import {inPageTransport, type Transport} from "./transport.ts"

export type MountOptions = {
  /** Where the dock's host element goes. Defaults to `document.body`. Keep it outside every editor. */
  parent?: Element
  /** Defaults to the in-page transport. */
  transport?: Transport
}

export type MountedDevtools = {
  /** The host element; the dock renders in its shadow root. */
  host: HTMLElement
  /** Resolves once the panel has rendered. */
  ready: Promise<void>
  unmount: () => void
}

/** Docks the panel at the bottom of the page, in a shadow root. */
export const mountDevtools = (options: MountOptions = {}): MountedDevtools => {
  const host = document.createElement("wordgard-devtools")
  // Nothing the page sets on its ancestors is inherited into the panel.
  host.setAttribute("style", "all: initial")
  ;(options.parent ?? document.body).append(host)
  const shadow = host.attachShadow({mode: "open"})
  let unmountDock: (() => void) | null = null
  let disposed = false
  const ready = import("./app.tsx").then(({renderDock}) => {
    if (!disposed) unmountDock = renderDock(shadow, options.transport ?? inPageTransport())
  })
  ready.catch(e => console.error("wordgard-devtools-panel: failed to load the panel", e))
  return {
    host,
    ready,
    unmount: () => {
      disposed = true
      unmountDock?.()
      host.remove()
    },
  }
}
