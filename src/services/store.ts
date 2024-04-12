
import { reactive } from 'vue'
import { ipcRenderer } from 'electron'
import { loadSettings as _loadSettings , saveSettings as _saveSettings } from '../config'
import { isEngineReady, loadAllModels, availableEngines } from './llm'
import { Store } from '../index.d'
import Chat from '../models/chat'
import path from 'path'
import fs from 'fs'

// a standalone chat window can modify the store and save it
// but it is a separate vuejs application so we will not detecte it
// therefore we need to go back to monitoring the file
const historyMonitorInterval = 1000
let historyLoadedSize: number = null
let historyMonitor: NodeJS.Timeout = null

export const store: Store = reactive({
  userDataPath: null,
  commands: [], 
  config: null,
  chats: [],
  pendingAttachment: null,
})

store.load = async () => {

  // load data
  store.userDataPath = ipcRenderer.sendSync('get-app-path')
  loadSettings()
  loadHistory()

  // load models
  // and select valid engine
  await loadAllModels()
  if (!isEngineReady(store.config.llm.engine)) {
    for (const engine of availableEngines) {
      if (isEngineReady(engine)) {
        console.log(`Default engine ready, selecting ${engine} as default`)
        store.config.llm.engine = engine
        break
      }
    }
  }
}

store.dump = () => {
  console.dir(JSON.parse(JSON.stringify(store.config)))
}

const historyFilePath = () => {
  return path.join(store.userDataPath, 'history.json')
}

const settingsFilePath = () => {
  return path.join(store.userDataPath, 'settings.json')
}

const loadHistory = () => {

  try {
    store.chats = []
    historyLoadedSize = fs.statSync(historyFilePath()).size
    const data = fs.readFileSync(historyFilePath(), 'utf-8')
    const jsonChats = JSON.parse(data)
    for (const jsonChat of jsonChats) {
      const chat = new Chat(jsonChat)
      store.chats.push(chat)
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.log('Error retrieving history data', error)
    }
  }

  // start monitoring
  monitorHistory()

}

store.saveHistory = () => {

  // avoid infinite loop
  clearInterval(historyMonitor)
  
  try {

    // we need to srip attchment contents
    const chats = JSON.parse(JSON.stringify(store.chats))
    for (const chat of chats) {
      for (const message of chat.messages) {
        if (message.attachment) {
          message.attachment.contents = null
        }
      }
    }
    
    // save
    fs.writeFileSync(historyFilePath(), JSON.stringify(chats, null, 2))

  } catch (error) {
    console.log('Error saving history data', error)
  }

  // restart monitoring
  monitorHistory()
}

const monitorHistory = () => {
  clearInterval(historyMonitor)
  historyMonitor = setInterval(() => {
    try {
      const stats = fs.statSync(historyFilePath())
      if (stats.size != historyLoadedSize) {
        const data = fs.readFileSync(historyFilePath(), 'utf-8')
        patchHistory(JSON.parse(data))
        historyLoadedSize = stats.size
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.log('Error monitoring history data', error)
      }
    }
  }, historyMonitorInterval)
}

// 
const patchHistory = (jsonChats: any[]) => {

  // need to know
  let patched = false

  try {
    for (const jsonChat of jsonChats) {
      const chat = store.chats.find((chat) => chat.uuid === jsonChat.uuid)
      if (chat) {
        if (jsonChat.deleted) {
          store.chats = store.chats.filter((chat) => chat.uuid !== jsonChat.uuid)
          patched = true
        } else {
          patched = patched || chat.patchFromJson(jsonChat)
        }
      } else {
        const chat = new Chat(jsonChat)
        store.chats.push(chat)
        patched = true
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.log('Error patching history data', error)
    }
  }

  // save
  if (patched) {
    store.saveHistory()
  }

}

const loadSettings = () => {
  store.config = _loadSettings(settingsFilePath())
}

store.saveSettings = () => {
  _saveSettings(settingsFilePath(), store.config)
}
