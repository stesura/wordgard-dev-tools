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
import type * as Inspect from "./inspect.ts"
import type * as Serialisers from "./serialise.ts"
import {VERSION} from "./version.ts"

/** Who asked: the in-page panel calls the agent directly, the extension over postMessage. */
type Client = "local" | "remote"

type Handlers = {[K in RequestType]: (request: Request<K>, client: Client) => Results[K] | Promise<Results[K]>}

const fromBridge = (data: unknown, kind: string) =>
  typeof data == "object" && data != null && "source" in data && data.source == SOURCE && "kind" in data && data.kind == kind

const isRequest = (data: unknown): data is Extract<Message, {kind: "request"}> => fromBridge(data, "request")

const notYet = (phase: number) => () => {
  throw new Error(`Not implemented yet (plan phase ${phase})`)
}

const createHandlers = (
  registry: Registry,
  s: typeof Serialisers,
  inspector: Inspect.Inspector,
  select: (client: Client, id: number | null) => void,
): Handlers => {
  const entry = (id: number) => {
    for (const e of registry.editors.values()) if (e.id == id) return e
    throw new Error(`No editor with id ${id}`)
  }
  return {
    listEditors: () => ({
      agent: {version: VERSION, protocol: PROTOCOL},
      editors: [...registry.editors.values()].map(s.editorInfo),
    }),
    select: ({id}, client) => {
      if (id != null) entry(id)
      select(client, id)
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
    highlight: ({id, path}) => {
      inspector.highlight(path ? entry(id) : null, path)
      return null
    },
    pick: ({on}) => {
      inspector.pick(on)
      return null
    },
    setConsole: notYet(6),
    repro: notYet(7),
  }
}

const run = <K extends RequestType>(handlers: Handlers, request: Request<K>, client: Client) => {
  if (!Object.hasOwn(handlers, request.type)) throw new Error(`Unknown request ${String(request.type)}`)
  return handlers[request.type](request, client)
}

export const createAgent = (registry: Registry): Agent => {
  const listeners = new Set<(push: Push) => void>()
  const lastUpdate = new WeakMap<Entry, Wordgard.Update>()
  // Set once a request arrives over postMessage, i.e. a bridge is listening.
  let remote = false
  let handlers: Promise<Handlers> | null = null
  let inspector: Inspect.Inspector | null = null
  // Each client's editor: one doesn't detach the other's (the dock and the extension at once).
  const selected: Record<Client, number | null> = {local: null, remote: null}
  const sync = () => {
    for (const e of registry.editors.values()) e.attached = e.id == selected.local || e.id == selected.remote
  }
  const select = (client: Client, id: number | null) => {
    selected[client] = id
    sync()
  }

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
    (handlers ??= Promise.all([import("./serialise.ts"), import("./inspect.ts")]).then(
      ([s, inspect]) => {
        inspector = inspect.createInspector(registry, push)
        return createHandlers(registry, s, inspector, select)
      },
      e => {
        handlers = null
        throw e
      },
    ))

  const request = async <K extends RequestType>(message: Request<K>, client: Client): Promise<Reply<K>> => {
    try {
      return {ok: true, value: await run(await loadHandlers(), message, client)}
    } catch (e) {
      return {ok: false, error: e instanceof Error ? e.message : String(e)}
    }
  }

  registry.subscribe(() => {
    // A reconnected editor (same instance, same id) is attached again.
    sync()
    push({type: "editorsChanged"})
  })

  const info = {version: VERSION, protocol: PROTOCOL}
  const announce = () => post({source: SOURCE, v: PROTOCOL, kind: "announce", agent: info})

  window.addEventListener("message", event => {
    if (event.source != window) return
    const {data} = event
    if (fromBridge(data, "ping")) announce()
    else if (fromBridge(data, "detach")) {
      remote = false
      inspector?.stop()
      select("remote", null)
    } else if (isRequest(data)) {
      const {id, v, request: message} = data
      remote = true
      const reply: Promise<Reply> =
        v == PROTOCOL ? request(message, "remote") : Promise.resolve({ok: false, error: mismatch(PROTOCOL, v)})
      void reply.then(r => post({source: SOURCE, v: PROTOCOL, kind: "reply", id, reply: r}))
    }
  })
  // A bridge injected before the agent existed learns about it here.
  announce()

  return {
    version: VERSION,
    protocol: PROTOCOL,
    request: message => request(message, "local"),
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
