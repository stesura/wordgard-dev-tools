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
import type * as Fields from "./fields.ts"
import type * as Inspect from "./inspect.ts"
import type * as Log from "./log.ts"
import type * as Schema from "./schema.ts"
import type * as View from "./view.ts"
import {byAgent} from "./reads.ts"
import type * as Serialisers from "./serialise.ts"
import {VERSION} from "./version.ts"

/** Who asked: the in-page panel calls the agent directly, the extension over postMessage. */
type Client = "local" | "remote"
const clients: Client[] = ["local", "remote"]

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
  schema: typeof Schema,
  view: typeof View,
  inspector: Inspect.Inspector,
  recorder: Log.Recorder,
  tracker: Fields.FieldTracker,
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
    stateJSON: ({id}) => s.stateJSON(entry(id)),
    node: ({id, path}) => s.node(entry(id).wg.state.doc, path),
    structure: ({id}) => s.structure(entry(id).wg.state.doc),
    schema: ({id}) => schema.schemaInfo(entry(id).wg.state.schema),
    view: ({id}) => view.viewInfo(entry(id).wg),
    viewElement: ({id, path, action}) => {
      const target = view.viewNode(entry(id).wg, path)
      if (action == "outline") inspector.outlineDOM(target, view.viewLabel(target))
      else console.log(`[wordgard-devtools] the editor's <${view.viewLabel(target)}>`, target)
      return null
    },
    selection: ({id}) => s.selection(entry(id).wg.state),
    fields: ({id}) => tracker.list(entry(id)),
    field: ({id, index}) => tracker.detail(entry(id), index),
    watchFields: ({id, on}, client) => {
      const e = entry(id)
      if (on && !e.attached) throw new Error("Select the editor before watching its fields")
      tracker.watch(e, client, on)
      return null
    },
    record: ({id, on, size}) => {
      const e = entry(id)
      // The log records only what a panel shows (see `sync`).
      if (on && !e.attached) throw new Error("Select the editor before recording")
      recorder.record(e, on, size)
      return null
    },
    clear: ({id}) => {
      recorder.clear(entry(id))
      return null
    },
    log: ({id, from, to}) => recorder.slice(entry(id), from, to),
    entry: ({id, index}) => recorder.detail(entry(id), index),
    highlight: ({id, path}) => {
      inspector.highlight(path ? entry(id) : null, path)
      return null
    },
    pick: ({on}) => {
      inspector.pick(on)
      return null
    },
    scrollIntoView: ({id, path}) => {
      inspector.scrollIntoView(entry(id), path)
      return null
    },
    logNode: ({id, path}) => {
      const found = s.locate(entry(id).wg.state.doc, path)
      if (!found) throw new Error(`No node at path [${path.join(", ")}]`)
      console.log(`[wordgard-devtools] ${found.node.name} at [${path.join(", ")}], ${found.from}–${found.from + found.node.length}`, found.node)
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
  let recorder: Log.Recorder | null = null
  let tracker: Fields.FieldTracker | null = null
  // Each client's editor: one doesn't detach the other's (the dock and the extension at once).
  const selected: Record<Client, number | null> = {local: null, remote: null}
  const sync = () => {
    for (const e of registry.editors.values()) {
      e.attached = e.id == selected.local || e.id == selected.remote
      // Nothing records unless a panel shows it: the log pauses, and keeps what it has.
      if (e.recording && !e.attached) recorder?.record(e, false)
      // Each panel watches the fields of the editor it shows.
      for (const client of clients) if (selected[client] != e.id && tracker?.watching(e, client)) tracker.watch(e, client, false)
    }
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
    (handlers ??= Promise.all([import("./serialise.ts"), import("./inspect.ts"), import("./log.ts"), import("./schema.ts"), import("./fields.ts"), import("./view.ts")]).then(
      ([s, inspect, log, schema, fields, view]) => {
        inspector = inspect.createInspector(registry, push)
        const logged = log.createRecorder(registry, push)
        recorder = logged
        tracker = fields.createFieldTracker(registry, logged.indexOf)
        return createHandlers(registry, s, schema, view, inspector, logged, tracker, select)
      },
      e => {
        handlers = null
        throw e
      },
    ))

  const request = async <K extends RequestType>(message: Request<K>, client: Client): Promise<Reply<K>> => {
    try {
      const loaded = await loadHandlers()
      // Reads that force a flush are tagged in the log.
      return {ok: true, value: await byAgent(() => run(loaded, message, client))}
    } catch (e) {
      return {ok: false, error: e instanceof Error ? e.message : String(e)}
    }
  }

  registry.subscribe(() => {
    recorder?.prune()
    tracker?.prune()
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
      tracker?.updated(entry, update)
      push({
        type: "stateChanged",
        id: entry.id,
        docChanged: update.docChanged,
        selectionSet: update.selectionSet,
        reconfigured: update.startState.config != update.state.config,
      })
    },
    recorded: (entry, transactions) => recorder?.recorded(entry, transactions),
  }
}
