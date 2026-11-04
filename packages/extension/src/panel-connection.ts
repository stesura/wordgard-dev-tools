import {browser, type Browser} from "wxt/browser"
import {createFramesTransport} from "./frames-transport.ts"
import {PANEL_PORT, type BackgroundToPanel, type PanelToBackground} from "./messages.ts"

// Chrome stops an idle service worker after 30 s, which drops the ports: messages keep it up.
const KEEPALIVE = 20_000

/** The panel's transport for the inspected tab, over a port to the background. */
export const connectPanel = (tabId: number) => {
  let port: Browser.runtime.Port | null = null
  const post = (message: PanelToBackground) => port?.postMessage(message)
  const {transport, receive, reset} = createFramesTransport((frameId, message) =>
    post({type: "toFrame", frameId, message}),
  )

  const connect = () => {
    const opened = browser.runtime.connect({name: PANEL_PORT})
    opened.onMessage.addListener((message: BackgroundToPanel) => receive(message))
    opened.onDisconnect.addListener(() => {
      port = null
      reset()
      // The background restarted: connect again, which reinjects and reconnects the bridges.
      setTimeout(connect, 100)
    })
    port = opened
    post({type: "init", tabId})
  }

  setInterval(() => post({type: "ping"}), KEEPALIVE)
  connect()
  return transport
}
