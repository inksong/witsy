
import { App } from 'electron'
import { Configuration } from '../types/config.d'
import { SourceType } from '../types/rag.d'
import defaultSettings from '../../defaults/settings.json'
import DocumentSourceImpl from './docsource'
import VectorDB from './vectordb'
import Embedder from './embedder'
import Loader from './loader'
import Splitter from './splitter'
import { databasePath } from './utils'
import * as file from '../main/file'
import { v4 as uuidv4 } from 'uuid'

export const ADD_COMMIT_EVERY = 5
export const DELETE_COMMIT_EVERY = 10

export default class DocumentBaseImpl {

  app: App
  config: Configuration
  db: VectorDB

  uuid: string
  name: string
  embeddingEngine: string
  embeddingModel: string
  documents: DocumentSourceImpl[]

  constructor(app: App, config: Configuration, uuid: string, name: string, embeddingEngine: string, embeddingModel: string) {
    this.app = app
    this.config = config
    this.uuid = uuid
    this.name = name
    this.embeddingEngine = embeddingEngine
    this.embeddingModel = embeddingModel
    this.documents = []
  }

  async add(uuid: string, type: SourceType, url: string, callback: VoidFunction): Promise<string> {

    // check existing
    let source = this.documents.find(d => d.uuid === uuid)
    if (source) {
      await this.delete(uuid)
    } else {
      source = new DocumentSourceImpl(uuid, type, url)
    }

    // add if
    if (type === 'folder') {

      // we add first so container is visible
      this.documents.push(source)
      callback?.()
      await this.addFolder(source, callback)

    } else {

      // we add only when it's done
      await this.addDocument(source, null, callback)
      this.documents.push(source)

    }

    // now store
    console.log(`Added document "${source.url}" to database "${this.name}"`)

    // done
    return source.uuid

  }

  async addDocument(source: DocumentSourceImpl, db?: VectorDB, callback?: VoidFunction): Promise<void> {

    // needed
    const loader = new Loader(this.config)
    if (!loader.isParseable(source.type, source.origin)) {
      throw new Error('Unsupported document type')
    }

    // log
    console.log(`Processing document [${source.type}] ${source.origin}`)

    // load the content
    const text = await loader.load(source.type, source.origin)
    if (!text) {
      console.log('Unable to load document', source.origin)
      throw new Error('Unable to load document')
    }

    // special case for empty pdf (or image only
    // ----------------Page (0) Break----------------
    if (/^-+Page \(\d+\) Break-+$/.test(text.trim())) {
      console.log('Empty PDF', source.origin)
      throw new Error('Empty PDF')
    }

    // check the size
    const maxDocumentSizeMB = this.config.rag?.maxDocumentSizeMB ?? defaultSettings.rag.maxDocumentSizeMB
    if (text.length > maxDocumentSizeMB * 1024 * 1024) {
      console.log(`Document is too large (max ${maxDocumentSizeMB}MB)`, source.origin)
      throw new Error(`Document is too large (max ${maxDocumentSizeMB}MB)`)
    }

    // set title if web page
    if (source.type === 'url') {
      const titleMatch = text.match(/<title>(.*?)<\/title>/i)
      if (titleMatch && titleMatch[1]) {
        source.title = titleMatch[1].trim()
      }
    }

    // now split
    const splitter = new Splitter(this.config)
    const chunks = await splitter.split(text)
    //console.log(`Split into ${chunks.length} chunks`)
    // now embeds
    const documents = []
    const embedder = await Embedder.init(this.app, this.config, this.embeddingEngine, this.embeddingModel)
    for (const chunk of chunks) {
      const embedding = await embedder.embed(chunk)
      documents.push({
        content: chunk,
        vector: embedding,
      })
    }

    // debug
    //console.log('Documents:', documents)
    // now store each document
    db = db ?? await VectorDB.connect(databasePath(this.app, this.uuid))
    for (const document of documents) {
      await db.insert(source.uuid, document.content, document.vector, {
        uuid: source.uuid,
        type: source.type,
        title: source.getTitle(),
        url: source.url
      })

    }

    // done
    callback?.()

  }

  async addFolder(source: DocumentSourceImpl, callback: VoidFunction): Promise<void> {

    // list files in folder recursively
    const files = file.listFilesRecursively(source.origin)

    // add to the database using transaction
    const db = await VectorDB.connect(databasePath(this.app, this.uuid))
    await db.beginTransaction()

    // iterate
    let added = 0
    for (const file of files) {
      try {

        // do it
        const doc = new DocumentSourceImpl(uuidv4(), 'file', file)
        await this.addDocument(doc, db)
        source.items.push(doc)

        // commit?
        if ((++added) % ADD_COMMIT_EVERY === 0) {
          await db.commitTransaction()
          callback?.()
          await db.beginTransaction()
        }

      } catch (error) {
        //console.error('Error adding file', file, error)
      }
    }

    // done
    await db.commitTransaction()
    callback?.()

  }

  async delete(docId: string, callback?: VoidFunction): Promise<void> {

    // find the document
    const index = this.documents.findIndex(d => d.uuid == docId)
    if (index === -1) {
      throw new Error('Document not found')
    }

    // list the database documents
    let docIds = [docId]
    const document = this.documents[index]
    if (document.items.length > 0) {
      docIds = document.items.map((item) => item.uuid)
    }

    // delete from the database using transaction
    const db = await VectorDB.connect(databasePath(this.app, this.uuid))
    await db.beginTransaction()

    // iterate
    let deleted = 0
    for (const docId of docIds) {

      // delete
      await db.delete(docId)

      // remove from doc list
      if (document.items.length > 0) {
        const index2 = document.items.findIndex(d => d.uuid == docId)
        if (index2 !== -1) {
          document.items.splice(index2, 1)

          // commit?
          if ((++deleted) % DELETE_COMMIT_EVERY === 0) {
            await db.commitTransaction()
            callback?.()
            await db.beginTransaction()
          }
        }
      }
    }

    // remove the main document
    this.documents.splice(index, 1)

    // done
    await db.commitTransaction()
    callback?.()

  }

}
