
export { strDict, anyDict } from 'multi-llm-ts'
import { LlmChunk, LlmChunkTool, LlmRole, anyDict } from 'multi-llm-ts'
import { Configuration } from './config.d'
import { ToolCallInfo } from 'models/message'

export interface Attachment {
  contents: string
  mimeType: string
  url: string
  extracted: boolean
  saved: boolean
  extractText(): void
  loadContents(): void
  b64Contents(): string
  isText(): boolean
  isImage(): boolean
  format(): string
}

export type ToolCallInfo = {
  status: string
  calls: {
    name: string
    params: any
    result: any
  }[]
}

export interface Message {
  uuid: string
  type: string
  createdAt: number
  role: LlmRole
  content: string
  transient: boolean
  toolCall?: ToolCallInfo
  attachment: Attachment
  setText(text: string): void
  setImage(url: string): void
  setToolCall(toolCall: LlmChunkTool): void
  attach(attachment: Attachment): void
  appendText(chunk: LlmChunk): void
}

export interface Chat {
  uuid: string
  title: string
  createdAt: number
  lastModified: number
  engine: string
  model: string
  messages: Message[]
  deleted: boolean
  docrepo: string
  fromJson(json: any): void
  patchFromJson(jsonChat: any): boolean
  setEngineModel(engine: string, model: string): void
  addMessage(message: Message): void
  lastMessage(): Message
  subtitle(): string
  delete(): void
}

export interface Command {
  id: string,
  type: 'system' | 'user',
  icon: string,
  label: string,
  action: 'chat_window' | 'paste_below' | 'paste_in_place' | 'clipboard_copy',
  template: string,
  shortcut: string,
  state: 'enabled' | 'disabled' | 'deleted',
  engine: string,
  model: string,
}

export interface Shortcut {
  alt?: boolean
  ctrl?: boolean
  shift?: boolean
  meta?: boolean
  key: string
  [key: string]: boolean | string
}

export interface Store {
  commands: Command[]
  experts: Expert[]
  config: Configuration
  chats: Chat[]
  chatFilter: string|null
  saveHistory?(): void
  saveSettings?(): void
  load?(): Promise<void>
  loadSettings?(): Promise<void>
  loadCommands?(): Promise<void>
  loadExperts?(): Promise<void>
  loadHistory?(): Promise<void>
  mergeHistory?(chats: any[]): void
  dump?(): void
}

export interface ExternalApp {
  name: string
  identifier: string
  icon: string
}

export interface Expert {
  id: string,
  type: 'system' | 'user',
  name: string
  prompt: string
  state: 'enabled' | 'disabled' | 'deleted',
  triggerApps: ExternalApp[]
}

export interface FileContents {
  url: string
  mimeType: string
  contents: string
}

export interface OnlineFileMetadata {
  id: string
  size: number
  createdTime: Date
  modifiedTime: Date
}

export interface OnlineStorageProvider {
  initialize: () => Promise<void>
  metadata: (filepath: string) => Promise<OnlineFileMetadata>
  download: (filepath: string) => Promise<string>
  upload: (filepath: string, modifiedTime: Date) => Promise<boolean>
}

export type ComputerAction = {
  action: 'key' | 'type' | 'mouse_move' | 'left_click' | 'left_click_drag' | 'right_click' | 'middle_click' | 'double_click' | 'screenshot' | 'cursor_position'
  coordinate?: number[]
  text?: string
}

declare global {
  interface Window {
    api: {
      licensed?: boolean
      platform?: string
      isMasBuild?: boolean
      userDataPath?: string
      on?: (signal: string, callback: (value: any) => void) => void
      off?: (signal: string, callback: (value: any) => void) => void
      setAppearanceTheme?(theme: string): void
      showDialog?(opts: any): Promise<Electron.MessageBoxReturnValue>
      listFonts?(): string[]
      fullscreen?(state: boolean): void
      runAtLogin?: {
        get?(): boolean
        set?(state: boolean): void
      }
      store?: {
        get?(key: string, fallback?: any): any
        set?(key: string, value: any): void
      }
      base64?: {
        encode?(data: string): string
        decode?(data: string): string
      }
      file?: {
        read?(filepath: string): FileContents
        readIcon?(filepath: string): FileContents
        save?(opts: {
          contents: string,
          url?: string,
          properties: anyDict
        }): string
        download?(opts: {
          url: string,
          properties: anyDict
        }): string
        pick?(opts: anyDict): string|string[]|FileContents
        pickDir?(): string
        delete?(filepath: string): void
        find?(name: string): string
        extractText?(contents: string, format: string): string
        getAppInfo?(filepath: string): ExternalApp
      }
      shortcuts?: {
        register?(): void
        unregister?(): void
      }
      ipcRenderer?: {
        send?(event: string, payload: any): void
        sendSync?(event: string, payload: any): any
      }
      update?: {
        isAvailable?(): boolean
        apply?(): void
      }
      config?: {
        load?(): Configuration
        save?(config: Configuration): void
      }
      history?: {
        load?(): Chat[]
        save?(chats: Chat[]): void
      }
      commands?: {
        load?(): Command[]
        save?(commands: Command[]): void
        cancel?(): void
        closePalette?(): void
        run?({ textId: string, command: Command }): void
        getPrompt?(id: string): string
        isPromptEditable?(id: string): boolean
        import?(): boolean
        export?(): boolean
      }
      anywhere?: {
        prompt?(): void
        insert?(prompt: string): void
        continue?(chatId: string): void
        cancel?(): void
      }
      experts?: {
        load?(): Expert[]
        save?(experts: Expert[]): void
        import?(): boolean
        export?(): boolean
      }
      docrepo?: {
        list?(): DocumentBase[]
        connect?(baseId: string): void
        disconnect?(): void
        create?(title: string, embeddingEngine: string, embeddingModel: string): string
        rename?(id: string, title: string): void
        delete?(id: string): void
        addDocument?(id: string, type: string, url: string): void
        removeDocument?(id: string, docId: string): void
        query?(id: string, text: string): Promise<DocRepoQueryResponseItem[]>
        isEmbeddingAvailable?(engine: string, model: string): boolean
      },
      readaloud?: {
        getText?(id: string): string
        closePalette?(): void
      },
      whisper?: {
        initialize?(): void
        transcribe?(audioBlob: Blob): Promise<{ text: string }>
      },
      transcribe?: {
        insert?(text: string): void
        cancel?(): void
      },
      clipboard?: {
        writeText?(text: string): void
        writeImage?(path: string): void
      },
      markdown?: {
        render?(markdown: string): string
      }
      interpreter?: {
        python?(code: string): any
      }
      nestor?: {
        isAvailable?(): boolean
        getStatus?(): any
        getTools?(): any
        callTool?(name: string, parameters: anyDict): any
      }
      scratchpad?: {
        open?(): void
      }
      computer?: {
        isAvailable?(): boolean
        getScaledScreenSize?(): Size
        getScreenNumber?(): number
        takeScreenshot?(): string
        executeAction?(action: ComputerAction): any
      }
    }
  }
}
