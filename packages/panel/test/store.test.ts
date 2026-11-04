// The store against a slow fake agent, as the extension's transport will be.
import {expect, it} from "vitest"
import type {EditorInfo, Push, Request, RequestType, Results} from "wordgard-devtools"
import {createPanelStore} from "../src/store.ts"
import type {Transport} from "../src/transport.ts"

const fakeAgent = (ids: number[], delay = 20) => {
  let editors: EditorInfo[] = ids.map(id => ({id, name: `e${id}`, attached: false, recording: false}))
  // What the agent handled, in order.
  const sent: string[] = []
  const listeners = new Set<(push: Push) => void>()
  const unsupported = () => {
    throw new Error("unsupported")
  }
  const handlers: {[K in RequestType]: (request: Request<K>) => Results[K]} = {
    listEditors: () => {
      sent.push("listEditors")
      return {agent: {version: "0.0.0", protocol: 1}, editors: editors.map(e => ({...e}))}
    },
    select: ({id}) => {
      sent.push(`select:${id}`)
      editors = editors.map(e => ({...e, attached: e.id == id}))
      return null
    },
    children: () => [[]],
    selection: () => ({anchor: 0, head: 0, from: 0, to: 0, empty: true, json: null, headPath: [], anchorPath: []}),
    node: unsupported,
    structure: unsupported,
    scrollIntoView: unsupported,
    record: unsupported,
    clear: unsupported,
    log: unsupported,
    entry: unsupported,
    highlight: () => null,
    pick: ({on}) => {
      sent.push(`pick:${on}`)
      return null
    },
    setConsole: unsupported,
    repro: unsupported,
  }
  const answer = <K extends RequestType>(request: Request<K>) => handlers[request.type](request)
  const transport: Transport = {
    send: request => {
      return new Promise((resolve, reject) =>
        setTimeout(() => {
          try {
            resolve(answer(request))
          } catch (e) {
            reject(e)
          }
        }, delay),
      )
    },
    onPush: listener => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
  const remove = (id: number) => {
    editors = editors.filter(e => e.id != id)
    for (const listener of listeners) listener({type: "editorsChanged"})
  }
  const add = (id: number, name = `e${id}`) => {
    editors = [...editors, {id, name, attached: false, recording: false}].sort((a, b) => a.id - b.id)
    for (const listener of listeners) listener({type: "editorsChanged"})
  }
  const push = (message: Push) => {
    for (const listener of listeners) listener(message)
  }
  return {transport, sent, remove, add, push, attached: () => editors.filter(e => e.attached).map(e => e.id)}
}

const settle = () => new Promise(resolve => setTimeout(resolve, 150))

it("doesn't attach an editor once stopped", async () => {
  const agent = fakeAgent([1])
  const store = createPanelStore(agent.transport)
  const stop = store.start()
  stop()
  await settle()
  expect(agent.sent).toEqual(["listEditors", "pick:false", "select:null"])
  expect(agent.attached()).toEqual([])
})

it("follows the chosen editor when it comes back", async () => {
  const agent = fakeAgent([1, 2])
  const store = createPanelStore(agent.transport)
  const stop = store.start()
  await settle()
  expect(store.get().selected).toBe(1)
  await store.select(2)
  agent.remove(2)
  await settle()
  expect(store.get().selected).toBe(1)
  agent.add(2)
  await settle()
  expect(store.get().selected).toBe(2)
  expect(agent.attached()).toEqual([2])
  stop()
})

it("follows the chosen editor's name when it is remounted as a new instance", async () => {
  const agent = fakeAgent([1, 2])
  const store = createPanelStore(agent.transport)
  const stop = store.start()
  await settle()
  await store.select(2)
  agent.remove(2)
  await settle()
  agent.add(3, "e2")
  await settle()
  expect(store.get().selected).toBe(3)
  stop()
})

it("ignores another panel's picks", async () => {
  const agent = fakeAgent([1, 2])
  const store = createPanelStore(agent.transport)
  const stop = store.start()
  await settle()
  agent.push({type: "picked", id: 2, path: [0]})
  await settle()
  expect(store.get().selected).toBe(1)
  expect(store.takeReveal(2)).toBeNull()
  stop()
})

it("leaves pick mode when picking ends elsewhere", async () => {
  const agent = fakeAgent([1, 2])
  const store = createPanelStore(agent.transport)
  const stop = store.start()
  await settle()
  store.pick(true)
  await settle()
  agent.sent.length = 0
  agent.push({type: "pickCancelled"})
  expect(store.get().picking).toBe(false)
  await settle()
  expect(agent.sent).toEqual([])
  store.pick(true)
  agent.push({type: "picked", id: 2, path: [0, 1]})
  await settle()
  expect(store.get()).toMatchObject({picking: false, selected: 2})
  expect(store.takeReveal(2)).toEqual([0, 1])
  stop()
})
