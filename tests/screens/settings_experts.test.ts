
import { vi, beforeAll, beforeEach, afterAll, expect, test, Mock } from 'vitest'
import { mount, VueWrapper, enableAutoUnmount } from '@vue/test-utils'
import { useWindowMock } from '../mocks/window'
import { store } from '../../src/services/store'
import { switchToTab } from './settings_utils'
import Settings from '../../src/screens/Settings.vue'

enableAutoUnmount(afterAll)

HTMLDialogElement.prototype.showModal = vi.fn()
HTMLDialogElement.prototype.close = vi.fn()

vi.mock('../../src/services/i18n', async (importOriginal) => {
  const mod: any = await importOriginal()
  return {
    ...mod,
    t: (key: string) => `${key}`,
  }
})

vi.mock('../../src/services/store.ts', async (importOriginal) => {
  const experts = await import('../../defaults/experts.json')
  const mod: any = await importOriginal()
  return {
    clone: mod.clone,
    store: {
      ...mod.store,
      experts: experts.default,
      saveSettings: vi.fn()
    }
  }
})

let wrapper: VueWrapper<any>
const expertsIndex = 3

beforeAll(() => {

  useWindowMock()
  store.loadSettings()

  // override
  store.experts[0].id = 'uuid1'
  store.config.engines.openai = {
    models: {
      chat: [ { id: 'chat1', name: 'chat1' }, { id: 'chat2', name: 'chat2' } ]
    }
  }
  window.api.config.localeLLM = () => store.config.llm.locale || 'en-US'
    
  // wrapper
  document.body.innerHTML = `<dialog id="settings"></dialog>`
  wrapper = mount(Settings, { attachTo: '#settings' })
})

beforeEach(() => {
  vi.clearAllMocks()
})

test('Renders', async () => {

  const tab = await switchToTab(wrapper, expertsIndex)
  expect(tab.findAll('.sticky-table-container')).toHaveLength(1)
  expect(tab.findAll('.sticky-table-container tr.expert')).toHaveLength(166)
  expect(tab.findAll('.sticky-table-container tr.expert button')).toHaveLength(332)
  expect(tab.findAll('.actions button')).toHaveLength(7)

})

test('Disable items', async () => {

  const tab = await switchToTab(wrapper, expertsIndex)
  expect(store.experts[0].state).toBe('enabled')
  await tab.find('.sticky-table-container tr.expert:nth-of-type(1) input[type=checkbox]').trigger('click')
  expect(store.experts[0].state).toBe('disabled')
  await tab.find('.sticky-table-container tr.expert:nth-of-type(1) input[type=checkbox]').trigger('click')
  expect(store.experts[0].state).toBe('enabled')

})

test('Move items', async () => {

  const tab = await switchToTab(wrapper, expertsIndex)
  const first = tab.find('.sticky-table-container tr.expert').attributes('data-id')
  const second = tab.find('.sticky-table-container tr.expert:nth-of-type(2)').attributes('data-id')
  await tab.find('.sticky-table-container tr.expert:nth-of-type(2) button:nth-of-type(2)').trigger('click')
  expect (tab.find('.sticky-table-container tr.expert').attributes('data-id')).toBe(second)
  expect (tab.find('.sticky-table-container tr.expert:nth-of-type(2)').attributes('data-id')).toBe(first)
  await tab.find('.sticky-table-container tr.expert:nth-of-type(1) button:nth-of-type(1)').trigger('click')
  expect (tab.find('.sticky-table-container tr.expert').attributes('data-id')).toBe(first)
  expect (tab.find('.sticky-table-container tr.expert:nth-of-type(2)').attributes('data-id')).toBe(second)

})

test('New expert', async () => {

  const tab = await switchToTab(wrapper, expertsIndex)
  const editor = tab.find<HTMLDialogElement>('#expert-editor')
  const modal = editor.element
  vi.spyOn(modal, 'showModal').mockImplementation(() => modal.setAttribute('open', 'opened'))
  expect(modal.showModal).not.toHaveBeenCalled()
  await tab.find('.actions button[name=new]').trigger('click')
  expect(modal.showModal).toHaveBeenCalledTimes(1)
  expect(modal.hasAttribute('open')).toBe(true)
  modal.removeAttribute('open')

  // for test stability
  tab.vm.selected = null

  // new command creates
  expect(store.experts).toHaveLength(166)
  expect(tab.findAll('.sticky-table-container tr.expert')).toHaveLength(166)
  await editor.find('[name=name]').setValue('expert')
  await editor.find('[name=prompt]').setValue('prompt')
  await editor.find('button.default').trigger('click')

  // check
  expect(store.experts).toHaveLength(167)
  expect(tab.findAll('.sticky-table-container tr.expert')).toHaveLength(167)
  expect(store.experts[166]).toStrictEqual({
    id: expect.any(String),
    type: 'user',
    name: 'expert',
    prompt: 'prompt',
    triggerApps: [],
    state: 'enabled'
  })
})

test('Edit user prompt', async () => {

  const tab = await switchToTab(wrapper, expertsIndex)
  const editor = tab.find<HTMLDialogElement>('#expert-editor')
  const modal = editor.element
  expect(modal.hasAttribute('open')).toBe(false)
  await tab.find('.sticky-table-container tr.expert:nth-of-type(167)').trigger('dblclick')
  expect(modal.showModal).toHaveBeenCalledTimes(1)
  expect(modal.hasAttribute('open')).toBe(true)

  expect(editor.find<HTMLInputElement>('[name=name]').element.value).toBe('expert')
  expect(editor.find<HTMLTextAreaElement>('[name=prompt]').element.value).toBe('prompt')

  await editor.find('[name=name]').setValue('')
  await editor.find('[name=prompt]').setValue('prompt2')
  await editor.find('button.default').trigger('click')

  expect((window.api.showDialog as Mock).mock.calls[0][0].message).toBe('experts.editor.validation.requiredFields')

  await editor.find('[name=name]').setValue('expert2')
  await editor.find('button.default').trigger('click')

  // check
  expect(store.experts).toHaveLength(167)
  expect(tab.findAll('.sticky-table-container tr.expert')).toHaveLength(167)
  expect(store.experts[166]).toStrictEqual({
    id: expect.any(String),
    type: 'user',
    name: 'expert2',
    prompt: 'prompt2',
    triggerApps: [],
    state: 'enabled'
  })
})

test('Edit system prompt', async () => {

  const tab = await switchToTab(wrapper, expertsIndex)
  const editor = tab.find<HTMLDialogElement>('#expert-editor')
  await tab.find('.sticky-table-container tr.expert:nth-of-type(1)').trigger('dblclick')

  expect(store.experts[1].label).toBeUndefined()
  expect(store.experts[1].template).toBeUndefined()

  expect(editor.find<HTMLInputElement>('[name=name]').element.value).toBe('experts.experts.uuid1.name')
  expect(editor.find<HTMLTextAreaElement>('[name=prompt]').element.value).toBe('experts.experts.uuid1.prompt')
  expect(editor.find<HTMLAnchorElement>('[name=reset]').exists()).toBe(false)

  await editor.find('[name=name]').setValue('expert')
  await editor.find('[name=prompt]').setValue('prompt')
  await editor.find('[name=name]').trigger('keyup')
  expect(editor.find<HTMLAnchorElement>('[name=reset]').exists()).toBe(true)

  await editor.find('button.default').trigger('click')

  expect(store.experts).toHaveLength(167)
  expect(tab.findAll('.sticky-table-container tr.expert')).toHaveLength(167)
  expect(store.experts[0]).toMatchObject({
    id: 'uuid1',
    type: 'system',
    name: 'expert',
    prompt: 'prompt',
  })

  await tab.find('.sticky-table-container tr.expert:nth-of-type(1)').trigger('dblclick')

  expect(editor.find<HTMLInputElement>('[name=name]').element.value).toBe('expert')
  expect(editor.find<HTMLTextAreaElement>('[name=prompt]').element.value).toBe('prompt')
  expect(editor.find<HTMLAnchorElement>('[name=reset]').exists()).toBe(true)

  await editor.find('[name=reset]').trigger('click')
  expect(editor.find<HTMLInputElement>('[name=name]').element.value).toBe('experts.experts.uuid1.name')
  expect(editor.find<HTMLTextAreaElement>('[name=prompt]').element.value).toBe('experts.experts.uuid1.prompt')
  expect(editor.find<HTMLAnchorElement>('[name=reset]').exists()).toBe(false)

  await editor.find('button.default').trigger('click')
  expect(store.experts[0].name).toBeUndefined()
  expect(store.experts[0].prompt).toBeUndefined()

})

test('Delete prompt', async () => {

  const tab = await switchToTab(wrapper, expertsIndex)
  await tab.find('.sticky-table-container tr.expert:nth-of-type(167)').trigger('click')
  await tab.find('.actions button[name=delete]').trigger('click')
  expect(tab.findAll('.sticky-table-container tr.expert')).toHaveLength(166)
  expect(store.experts).toHaveLength(166)

})

test('Copy prompt', async () => {

  const tab = await switchToTab(wrapper, expertsIndex)
  await tab.find('.sticky-table-container tr.expert:nth-of-type(1)').trigger('click')
  await tab.find('.actions button[name=copy]').trigger('click')
  expect(tab.findAll('.sticky-table-container tr.expert')).toHaveLength(167)
  expect(store.experts).toHaveLength(167)
  expect(store.experts[1]).toStrictEqual({
    id: expect.any(String),
    type: 'user',
    name: 'experts.experts.uuid1.name (settings.experts.copy)',
    prompt: 'experts.experts.uuid1.prompt',
    state: 'enabled',
    triggerApps: []
  })

})

test('Context Menu', async () => {

  const tab = await switchToTab(wrapper, expertsIndex)
  expect(tab.findAll('.context-menu')).toHaveLength(0)
  await tab.find('.actions .right button').trigger('click')
  await tab.vm.$nextTick()
  expect(tab.findAll('.context-menu')).toHaveLength(1)

})
