
import Chat from '../models/chat'
import Message from '../models/message'
import OpenAI from '../services/openai'
import { store, saveStore } from '../services/store'

export default class {

  constructor(config) {
    this.config = config
    this.llm = new OpenAI(config)
    this.chat = null
    this.newChat()
  }

  newChat(title) {

    // select last chat
    if (store.chats.length > 0) {
      this.chat = store.chats[store.chats.length - 1]
    }

    // now check
    if (this.chat === null || this.chat.messages.length > 1) { 
      this.chat = new Chat(title)
      this.chat.addMessage(new Message('system', this.config.instructions.default))
      store.chats.push(this.chat)
      saveStore()
    }
  }

  setChat(chat) {
    this.chat = chat
  }

  async route(prompt) {
    // build messages
    let messages = [
      new Message('system', this.config.instructions.routing),
      new Message('user', prompt)
    ]

    // now get it
    let route = await this.llm.complete(messages, { model: 'gpt-3.5-turbo' })
    return route.content
  }

  async prompt(prompt) {

    // check
    prompt = prompt.trim()
    if (prompt === '') {
      return
    }

    // add message
    let message = new Message('user', prompt)
    this.chat.addMessage(message)

    // add assistant message
    this.chat.addMessage(new Message('assistant'))
    this.chat.lastMessage().setText(null)

    // route
    let route = await this.route(prompt)
    if (route === 'IMAGE') {
      this.generateImage(prompt)
    } else {
      this.generateText(prompt)
    }

    // check if we need to update title
    if (this.chat.messages.filter((msg) => msg.role === 'assistant').length === 1) {
      this.chat.setTitle(await this.getTitle())
    }
  
    // save
    saveStore()

  }

  async generateText(prompt) {
    let stream = await this.llm.stream(this.chat.messages)
    for await (let chunk of stream) {
      this.chat.lastMessage().appendText(chunk.choices[0]?.delta?.content || '')
    }
  }

  async generateImage(prompt) {
    let response = await this.llm.image(prompt)
    this.chat.lastMessage().setImage(response.url)
  }

  async getTitle() {

    // build messages
    let messages = [
      new Message('system', this.config.instructions.titling),
      this.chat.messages[1],
      this.chat.messages[2]
    ]

    // now get it
    let response = await this.llm.complete(messages)
    let title = response.content

    // now clean up
    if (title.startsWith('Title:')) {
      title = title.substring(6)
    }
    return title.trim().replace(/^"|"$/g, '').trim()
  }

}
