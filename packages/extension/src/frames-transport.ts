import {PROTOCOL, mismatch, type AgentInfo, type EditorInfo, type Push, type Request, type RequestType, type Results} from "wordgard-devtools"
import {AgentError, type Transport} from "wordgard-devtools-panel/transport"
import type {BackgroundToPanel, FromBridge, ToBridge} from "./messages.ts"

type Frame = {url: string; agent: AgentInfo; v: number}
type WireReply = Extract<FromBridge, {type: "reply"}>["reply"]
type Pending = {frameId: number; settle: (reply: WireReply) => void; fail: (error: Error) => void}
type FrameEditors = {agent?: AgentInfo | null; editors?: EditorInfo[]; notice?: string}
type Handlers = {[K in RequestType]: (request: Request<K>) => Promise<Results[K]>}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

export const frameLabel = (url: string) => {
  try {
    const {host, pathname} = new URL(url)
    return host ? host + pathname : url
  } catch {
    return url
  }
}

/**
 * One transport over every frame of the inspected tab. Editor ids are the page's, unique only
 * within a frame: the panel gets ids of its own, mapped to (frame, page id).
 */
// Generous: a frame's first request also loads the agent's serialisers.
export const createFramesTransport = (send: (frameId: number, message: ToBridge) => void, timeout = 10_000) => {
  const frames = new Map<number, Frame>()
  const listeners = new Set<(push: Push) => void>()
  const pending = new Map<number, Pending>()
  let nextRequest = 1
  let injectError: string | null = null

  let nextId = 1
  const toPage = new Map<number, {frameId: number; id: number}>()
  const toPanel = new Map<string, number>()
  const panelId = (frameId: number, id: number) => {
    const key = `${frameId}:${id}`
    let found = toPanel.get(key)
    if (found == null) {
      found = nextId++
      toPanel.set(key, found)
      toPage.set(found, {frameId, id})
    }
    return found
  }
  const usable = (frameId: number) => frames.get(frameId)?.v == PROTOCOL
  const pageId = (id: number) => {
    const found = toPage.get(id)
    if (!found || !usable(found.frameId)) throw new AgentError(`No editor with id ${id}`)
    return found
  }

  const emit = (push: Push) => {
    for (const listener of listeners) listener(push)
  }

  const ask = <K extends RequestType>(frameId: number, request: Request) =>
    new Promise<Results[K]>((resolve, reject) => {
      const id = nextRequest++
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new AgentError(`${frameLabel(frames.get(frameId)?.url ?? "")}: the page didn't answer`))
      }, timeout)
      const done = () => {
        clearTimeout(timer)
        pending.delete(id)
      }
      pending.set(id, {
        frameId,
        settle: reply => {
          done()
          if (reply.ok) resolve(reply.value)
          else reject(new AgentError(reply.error))
        },
        fail: error => {
          done()
          reject(error)
        },
      })
      send(frameId, {type: "request", id, request})
    })

  const routed = <K extends RequestType>(id: number, make: (pageId: number) => Request) => {
    const target = pageId(id)
    return ask<K>(target.frameId, make(target.id))
  }

  const usableFrames = () => [...frames.keys()].filter(usable)

  const listEditors = async (): Promise<Results["listEditors"]> => {
    // In frame order (the top frame is 0), whatever order the replies arrive in.
    const ordered = [...frames].sort(([a], [b]) => a - b)
    const results = await Promise.all(
      ordered.map(async ([frameId, frame]): Promise<FrameEditors> => {
        if (frame.v != PROTOCOL) return {notice: `${frameLabel(frame.url)}: ${mismatch(frame.v, PROTOCOL)}`}
        try {
          const {agent, editors} = await ask<"listEditors">(frameId, {type: "listEditors"})
          const label = frameId == 0 ? undefined : frameLabel(frame.url)
          return {agent, editors: editors.map(editor => ({...editor, id: panelId(frameId, editor.id), frame: label}))}
        } catch (e) {
          return {notice: message(e)}
        }
      }),
    )
    const notices = results.flatMap(r => (r.notice ? [r.notice] : []))
    if (injectError && !frames.size) notices.push(`Can't inspect this page: ${injectError}`)
    return {
      agent: results.find(r => r.agent)?.agent ?? null,
      editors: results.flatMap(r => r.editors ?? []),
      notices,
    }
  }

  const handlers: Handlers = {
    listEditors,
    select: async ({id}) => {
      const target = id == null ? null : pageId(id)
      // Only the target frame's failure is the caller's: the others just let go.
      const others = usableFrames().filter(frameId => frameId != target?.frameId)
      void Promise.allSettled(others.map(frameId => ask(frameId, {type: "select", id: null})))
      if (target) await ask(target.frameId, {type: "select", id: target.id})
      return null
    },
    children: ({id, paths}) => routed<"children">(id, page => ({type: "children", id: page, paths})),
    node: ({id, path}) => routed<"node">(id, page => ({type: "node", id: page, path})),
    selection: ({id}) => routed<"selection">(id, page => ({type: "selection", id: page})),
    record: ({id, on}) => routed<"record">(id, page => ({type: "record", id: page, on})),
    clear: ({id}) => routed<"clear">(id, page => ({type: "clear", id: page})),
    log: ({id, from, to}) => routed<"log">(id, page => ({type: "log", id: page, from, to})),
    entry: ({id, index}) => routed<"entry">(id, page => ({type: "entry", id: page, index})),
    highlight: ({id, path}) => routed<"highlight">(id, page => ({type: "highlight", id: page, path})),
    setConsole: ({id, index}) => routed<"setConsole">(id, page => ({type: "setConsole", id: page, index})),
    repro: ({id}) => routed<"repro">(id, page => ({type: "repro", id: page})),
    pick: async ({on}) => {
      const results = await Promise.allSettled(usableFrames().map(frameId => ask(frameId, {type: "pick", on})))
      // Fails only when no frame could pick.
      const failed = results.find(r => r.status == "rejected")
      if (failed && results.every(r => r.status == "rejected")) throw failed.reason
      return null
    },
  }

  const run = <K extends RequestType>(request: Request<K>) => handlers[request.type](request)

  const forget = (frameId: number) => {
    frames.delete(frameId)
    for (const entry of pending.values()) if (entry.frameId == frameId) entry.fail(new AgentError("The frame went away"))
    // A new document in that frame starts its ids again: they are other editors.
    for (const [id, target] of toPage) {
      if (target.frameId != frameId) continue
      toPage.delete(id)
      toPanel.delete(`${frameId}:${target.id}`)
    }
  }

  const transport: Transport = {
    // async: an unknown id rejects rather than throws.
    send: async request => run(request),
    onPush: listener => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }

  const receive = (incoming: BackgroundToPanel) => {
    if (incoming.type == "injectFailed") {
      injectError = incoming.error
      emit({type: "editorsChanged"})
      return
    }
    if (incoming.type == "frameGone") {
      if (!frames.has(incoming.frameId)) return
      forget(incoming.frameId)
      emit({type: "editorsChanged"})
      return
    }
    const {frameId, url, message: m} = incoming
    if (m.type == "announce") {
      frames.set(frameId, {url, agent: m.agent, v: m.v})
      emit({type: "editorsChanged"})
    } else if (m.type == "reply") {
      pending.get(m.id)?.settle(m.reply)
    } else if (usable(frameId)) {
      const push = m.push
      emit(push.type == "editorsChanged" ? push : {...push, id: panelId(frameId, push.id)})
    }
  }

  /**
   * The connection to the background dropped: frames announce themselves again on reconnect.
   * A frame may have navigated meanwhile, unseen: its ids are forgotten as on frameGone.
   */
  const reset = () => {
    for (const frameId of [...frames.keys()]) forget(frameId)
    for (const entry of pending.values()) entry.fail(new AgentError("Lost the connection to the page"))
    injectError = null
    emit({type: "editorsChanged"})
  }

  return {transport, receive, reset}
}
