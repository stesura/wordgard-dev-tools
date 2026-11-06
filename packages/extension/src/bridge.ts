import {PROTOCOL, SOURCE, type Message} from "@stesura/wordgard-dev-tools"
import {browser, type Browser} from "wxt/browser"
import {BRIDGE_PORT, type FromBridge, type ToBridge} from "./messages.ts"

declare global {
  interface Window {
    /** Set by the first injection in this frame; later injections reconnect through it. */
    __wordgardDevtoolsBridge?: () => void
  }
}

const isMessage = (data: unknown): data is Message =>
  typeof data == "object" && data != null && "source" in data && data.source == SOURCE && "kind" in data

/**
 * Runs in the extension's isolated world, which shares `window` (and its messages) with the
 * page: relays between the page agent's postMessage protocol and a port to the background.
 */
export const startBridge = () => {
  if (window.__wordgardDevtoolsBridge) {
    window.__wordgardDevtoolsBridge()
    return
  }
  let port: Browser.runtime.Port | null = null
  const toPage = (message: Message) => window.postMessage(message, "*")

  const connect = () => {
    if (!port) {
      const opened = browser.runtime.connect({name: BRIDGE_PORT})
      opened.onMessage.addListener((message: ToBridge) =>
        toPage({source: SOURCE, v: PROTOCOL, kind: "request", id: message.id, request: message.request}),
      )
      opened.onDisconnect.addListener(() => {
        port = null
        toPage({source: SOURCE, v: PROTOCOL, kind: "detach"})
      })
      port = opened
    }
    // An agent already on the page announces itself; one created later announces on creation.
    toPage({source: SOURCE, v: PROTOCOL, kind: "ping"})
  }

  const toBackground = (message: FromBridge) => port?.postMessage(message)

  window.addEventListener("message", event => {
    const {data} = event
    if (event.source != window || !port || !isMessage(data)) return
    if (data.kind == "announce") toBackground({type: "announce", v: data.v, agent: data.agent})
    else if (data.kind == "reply") toBackground({type: "reply", v: data.v, id: data.id, reply: data.reply})
    else if (data.kind == "push") toBackground({type: "push", v: data.v, push: data.push})
  })

  // Restored from the back/forward cache: the port was closed when the page was stored.
  window.addEventListener("pageshow", event => {
    if (event.persisted) connect()
  })

  window.__wordgardDevtoolsBridge = connect
  connect()
}
