
import { vi, beforeAll, beforeEach, expect, test } from 'vitest'
import { Plugin1, Plugin2, Plugin3 } from '../mocks/plugins'
import { store } from '../../src/services/store'
import defaults from '../../defaults/settings.json'
import Message from '../../src/models/message'
import Google from '../../src/llms/google'
import { loadGoogleModels } from '../../src/llms/llm'
import { EnhancedGenerateContentResponse, FunctionCall, FinishReason } from '@google/generative-ai'
import * as _Google from '@google/generative-ai'
import { LlmChunk } from 'types/llm'

window.api = {
  config: {
    save: vi.fn()
  },
}

Plugin2.prototype.execute = vi.fn((parameters: any): Promise<string> => Promise.resolve('result2'))

vi.mock('../../src/plugins/plugins', async () => {
  return {
    availablePlugins: {
      plugin1: Plugin1,
      plugin2: Plugin2,
      plugin3: Plugin3,
    }
  }
})

vi.mock('@google/generative-ai', async() => {
  const GoogleModel = vi.fn()
  GoogleModel.prototype.generateContent = vi.fn(() => { return { response: { text: () => 'response' } } })
  GoogleModel.prototype.generateContentStream = vi.fn(() => {
    return { stream: {
      async * [Symbol.asyncIterator]() {
        
        // first we yield tool call chunks
        yield { functionCalls: () => [{ name: 'plugin2', args: ['arg'] }] }
        
        // now the text response
        const content = 'response'
        for (let i = 0; i < content.length; i++) {
          yield { functionCalls: (): any[] => [], candidates: [ { finishReason: 'none' }], text: () => content[i] }
        }
        yield { functionCalls: (): any[] => [], candidates: [ { finishReason: 'STOP' }], text: vi.fn(() => null) }
      }
    }}
  })
  const GoogleGenerativeAI = vi.fn()
  GoogleGenerativeAI.prototype.apiKey = '123'
  GoogleGenerativeAI.prototype.getGenerativeModel = vi.fn(() => new GoogleModel())
  const SchemaType = { STRING: 'string', NUMBER: 'number', OBJECT: 'object'}
  const FunctionCallingMode = { AUTO: 'auto' }
  return { GoogleGenerativeAI, GoogleModel, default: GoogleGenerativeAI, SchemaType, FunctionCallingMode }
})

beforeAll(() => {
  store.config = defaults
  store.config.engines.google.apiKey = '123'
  store.config.engines.google.model.chat = 'models/gemini-1.5-pro-latest'
  store.config.plugins.dalle.enabled = false
})

beforeEach(() => {
  vi.clearAllMocks()
})

test('Google Load Models', async () => {
  expect(await loadGoogleModels()).toBe(true)
  const models = store.config.engines.google.models.chat
  expect(models.map((m: Model) => { return { id: m.id, name: m.name }})).toStrictEqual([
    { id: 'models/gemini-1.5-pro-latest', name: 'Gemini 1.5 Pro' },
    { id: 'gemini-1.5-flash-latest', name: 'Gemini  1.5 Flash' },
    { id: 'models/gemini-pro', name: 'Gemini 1.0 Pro' },
  ])
  expect(store.config.engines.google.model.chat).toStrictEqual(models[0].id)
})

test('Google Basic', async () => {
  const google = new Google(store.config)
  expect(google.getName()).toBe('google')
  expect(google.isVisionModel('models/gemini-pro')).toBe(false)
  expect(google.isVisionModel('gemini-1.5-flash-latest')).toBe(true)
  expect(google.isVisionModel('models/gemini-1.5-pro-latest')).toBe(true)
})

test('Google completion', async () => {
  const google = new Google(store.config)
  const response = await google.complete([
    new Message('system', 'instruction'),
    new Message('user', 'prompt'),
  ], null)
  expect(_Google.GoogleGenerativeAI).toHaveBeenCalled()
  expect(_Google.GoogleGenerativeAI.prototype.getGenerativeModel).toHaveBeenCalled()
  expect(_Google.GoogleModel.prototype.generateContent).toHaveBeenCalledWith({ contents: [{
    role: 'user',
    parts: [ { text: 'prompt' } ]
  }]})
  expect(response).toStrictEqual({
    type: 'text',
    content: 'response'
  })
})

test('Google streamChunkToLlmChunk Text', async () => {
  const google = new Google(store.config)
  const streamChunk: EnhancedGenerateContentResponse = {
    candidates: [ {
      index: 0,
      content: { role: 'model', parts: [ { text: 'response' } ] },
      //finishReason: FinishReason.STOP,
    } ],
    text: vi.fn(() => 'response'),
    functionCalls: vi.fn((): FunctionCall[] => []),
    functionCall: null,
  }
  const llmChunk1 = await google.streamChunkToLlmChunk(streamChunk, null)
  expect(streamChunk.text).toHaveBeenCalled()
  //expect(streamChunk.functionCalls).toHaveBeenCalled()
  expect(llmChunk1).toStrictEqual({ text: 'response', done: false })
  streamChunk.candidates[0].finishReason = 'STOP' as FinishReason
  streamChunk.text = vi.fn(() => '')
  const llmChunk2 = await google.streamChunkToLlmChunk(streamChunk, null)
  expect(streamChunk.text).toHaveBeenCalled()
  //expect(streamChunk.functionCalls).toHaveBeenCalled()
  expect(llmChunk2).toStrictEqual({ text: '', done: true })
})

test('Google stream', async () => {
  const google = new Google(store.config)
  const stream = await google.stream([
    new Message('system', 'instruction'),
    new Message('user', 'prompt'),
  ], null)
  expect(_Google.GoogleGenerativeAI).toHaveBeenCalled()
  expect(_Google.GoogleGenerativeAI.prototype.getGenerativeModel).toHaveBeenCalled()
  expect(_Google.GoogleModel.prototype.generateContentStream).toHaveBeenCalledWith({ contents: [{
    role: 'user',
    parts: [ { text: 'prompt' } ]
  }]})
  let response = ''
  const eventCallback = vi.fn()
  for await (const streamChunk of stream) {
    const chunk: LlmChunk = await google.streamChunkToLlmChunk(streamChunk, eventCallback)
    if (chunk) {
      if (chunk.done) break
      response += chunk.text
    }
  }
  expect(response).toBe('response')
  expect(eventCallback).toHaveBeenNthCalledWith(1, { type: 'tool', content: 'prep2' })
  expect(eventCallback).toHaveBeenNthCalledWith(2, { type: 'tool', content: 'run2' })
  expect(Plugin2.prototype.execute).toHaveBeenCalledWith(['arg'])
  expect(eventCallback).toHaveBeenNthCalledWith(3, { type: 'tool', content: null })
  expect(eventCallback).toHaveBeenNthCalledWith(4, { type: 'stream', content: expect.any(Object) })
  await google.stop(stream)
  //expect(response.controller.abort).toHaveBeenCalled()
})

test('Google Text Attachments', async () => {
  const google = new Google(store.config)
  await google.stream([
    new Message('system', 'instruction'),
    new Message('user', { role: 'user', type: 'text', content: 'prompt1', attachment: { url: '', mimeType: 'text/plain', contents: 'text1', downloaded: true } } ),
    new Message('assistant', 'response1'),
    new Message('user', { role: 'user', type: 'text', content: 'prompt2', attachment: { url: '', mimeType: 'text/plain', contents: 'text2', downloaded: true } } ),
  ], null)
  expect(_Google.GoogleModel.prototype.generateContentStream).toHaveBeenCalledWith({ contents: [
    { role: 'user', parts: [ { text: 'prompt1\n\ntext1' } ] },
    { role: 'model', parts: [ { text: 'response1' } ] },
    { role: 'user', parts: [ { text: 'prompt2\n\ntext2' } ] },
  ]})
})

test('Google Image Attachments', async () => {
  const google = new Google(store.config)
  await google.stream([
    new Message('system', 'instruction'),
    new Message('user', { role: 'user', type: 'text', content: 'prompt1', attachment: { url: '', mimeType: 'image/png', contents: 'image', downloaded: true } } ),
    new Message('assistant', 'response1'),
    new Message('user', { role: 'user', type: 'text', content: 'prompt2', attachment: { url: '', mimeType: 'image/png', contents: 'image', downloaded: true } } ),
  ], null)
  expect(_Google.GoogleModel.prototype.generateContentStream).toHaveBeenCalledWith({ contents: [
    { role: 'user', parts: [ { text: 'prompt1' } ] },
    { role: 'model', parts: [ { text: 'response1' } ] },
    { role: 'user', parts: [ { text: 'prompt2' }, { inlineData: { data: 'image', mimeType: 'image/png' }} ] },
  ]})
})
