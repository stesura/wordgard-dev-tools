import type {Wordgard} from "wordgard/editor"
import {
  PROTOCOL,
  SOURCE,
  mismatch,
  type Message,
  type Push,
  type Reply,
  type Request,
  type RequestType,
  type Results,
} from "./protocol.ts"
import type {Agent, Entry, Registry} from "./registry.ts"
import type * as Serialisers from "./serialise.ts"
import {VERSION} from "./version.ts"

type Handlers = {[K in RequestType]: (request: Request<K>) => Results[K] | Promise<Results[K]>}

type RequestMessage = Extract<Message, {kind: "request"}>

const isRequest = (data: unknown): data is RequestMessage =>
  typeof data == "object" &&
  data != null &&
  "source" in data &&
  data.source == SOURCE &&
  "kind" in data &&
  data.kind == "request"

const notYet = (phase: number) => () => {
  throw new Error(`Not implemented yet (plan phase ${phase})`)
}

const createHandlers = (registry: Registry, s: typeof Serialisers): Handlers => {
  const entry = (id: number) => {
    for (const e of registry.editors.values()) if (e.id == id) return e
    throw new Error(`No editor with id ${id}`)
  }
  return {
    listEditors: () => ({
      agent: {version: VERSION, protocol: PROTOCOL},
      editors: [...registry.editors.values()].map(s.editorInfo),
    }),
    select: ({id}) => {
      if (id != null) entry(id)
      for (const e of registry.editors.values()) e.attached = e.id == id
      return null
    },
    children: ({id, paths}) => {
      const {doc} = entry(id).wg.state
      return paths.map(path => s.children(doc, path))
    },
    node: ({id, path}) => s.node(entry(id).wg.state.doc, path),
    selection: ({id}) => s.selection(entry(id).wg.state),
    record: ({id, on}) => {
      entry(id).recording = on
      return null
    },
    clear: notYet(5),
    log: notYet(5),
    entry: notYet(5),
    highlight: notYet(4),
    pick: notYet(4),
    setConsole: notYet(6),
    repro: notYet(7),
  }
}

const run = <K extends RequestType>(handlers: Handlers, request: Request<K>) => {
  if (!Object.hasOwn(handlers, request.type)) throw new Error(`Unknown request ${String(request.type)}`)
  return handlers[request.type](request)
}

export const createAgent = (registry: Registry): Agent => {
  const listeners = new Set<(push: Push) => void>()
  const lastUpdate = new WeakMap<Entry, Wordgard.Update>()
  // Set once a request arrives over postMessage, i.e. a bridge is listening.
  let remote = false
  let handlers: Promise<Handlers> | null = null

  const post = (message: Message) => window.postMessage(message, "*")

  const push = (message: Push) => {
    for (const listener of listeners) {
      try {
        listener(message)
      } catch (e) {
        console.error(e)
      }
    }
    if (remote) post({source: SOURCE, v: PROTOCOL, kind: "push", push: message})
  }

  // Serialisers load on the first request: pages that never open the panel skip them.
  const loadHandlers = () =>
    (handlers ??= import("./serialise.ts").then(
      s => createHandlers(registry, s),
      e => {
        handlers = null
        throw e
      },
    ))

  const request = async <K extends RequestType>(message: Request<K>): Promise<Reply<K>> => {
    try {
      return {ok: true, value: await run(await loadHandlers(), message)}
    } catch (e) {
      return {ok: false, error: e instanceof Error ? e.message : String(e)}
    }
  }

  registry.subscribe(() => push({type: "editorsChanged"}))

  window.addEventListener("message", event => {
    if (event.source != window || !isRequest(event.data)) return
    const {id, v, request: message} = event.data
    remote = true
    const reply: Promise<Reply> =
      v == PROTOCOL ? request(message) : Promise.resolve({ok: false, error: mismatch(PROTOCOL, v)})
    void reply.then(r => post({source: SOURCE, v: PROTOCOL, kind: "reply", id, reply: r}))
  })

  return {
    version: VERSION,
    protocol: PROTOCOL,
    request,
    onPush: listener => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    updated: (entry, update) => {
      // Two copies of the package on one editor both report the same update.
      if (!entry.attached || lastUpdate.get(entry) == update) return
      lastUpdate.set(entry, update)
      push({type: "stateChanged", id: entry.id, docChanged: update.docChanged, selectionSet: update.selectionSet})
    },
    // The transaction log is plan phase 5.
    recorded: () => {},
  }
}
