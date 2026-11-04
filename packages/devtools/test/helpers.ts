import {Wordgard} from "wordgard/editor"
import {basicSchema} from "wordgard/schema"
import type {GardState} from "wordgard/state"
import {
  PROTOCOL,
  SOURCE,
  type Message,
  type Push,
  type Registry,
  type Reply,
  type Request,
  type RequestType,
  type Results,
} from "../src/index.ts"

export const doc = "<h1>Title</h1><p>Hello <strong>world</strong></p>"

export const editor = (config: GardState.Extension = [], content = doc) =>
  Wordgard.create({parent: document.body, doc: content, config: [basicSchema(), config]})

export const registry = (): Registry => {
  const found = window.__WORDGARD_DEVTOOLS__
  if (!found) throw new Error("No registry")
  return found
}

export const agent = () => {
  const found = registry().agent
  if (!found) throw new Error("No agent")
  return found
}

/** A request's value, failing on an error reply. */
export const ask = async <K extends RequestType>(request: Request<K>): Promise<Results[K]> => {
  const reply = await agent().request(request)
  if (!reply.ok) throw new Error(reply.error)
  return reply.value
}

export const pushes = () => {
  const seen: Push[] = []
  const stop = agent().onPush(push => seen.push(push))
  return {seen, stop}
}

let nextId = 1

const isReply = (data: unknown, id: number): data is Extract<Message, {kind: "reply"}> =>
  typeof data == "object" && data != null && "kind" in data && data.kind == "reply" && "id" in data && data.id == id

/** Sends a request the way the extension's bridge does, and collects the replies for a while. */
export const post = (request: Request, v = PROTOCOL, wait = 50) =>
  new Promise<Reply[]>(resolve => {
    const id = nextId++
    const replies: Reply[] = []
    const listen = (event: MessageEvent) => {
      if (isReply(event.data, id)) replies.push(event.data.reply)
    }
    window.addEventListener("message", listen)
    window.postMessage({source: SOURCE, v, kind: "request", id, request}, "*")
    setTimeout(() => {
      window.removeEventListener("message", listen)
      resolve(replies)
    }, wait)
  })
