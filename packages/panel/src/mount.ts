import { isProduction } from "@stesura/wordgard-dev-tools";
import { inPageTransport, type Transport } from "./transport.ts";

export type MountOptions = {
  /** Where the dock's host element goes. Defaults to `document.body`. Keep it outside every editor. */
  parent?: Element;
  /** Defaults to the in-page transport. */
  transport?: Transport;
  /**
   * Whether to mount. Defaults to off in production builds and on otherwise. When off, nothing is
   * mounted or downloaded, and the returned host stays detached.
   */
  enabled?: boolean;
};

export type MountedDevtools = {
  /** The host element; the dock renders in its shadow root. Null where there's no DOM (on a server). */
  host: HTMLElement | null;
  /** Resolves once the panel has rendered. */
  ready: Promise<void>;
  /** Releases this handle. The dock goes when every handle to it is released. */
  unmount: () => void;
};

type Dock = {
  host: HTMLElement;
  ready: Promise<void>;
  /** Null: the body. */
  parent: Element | null;
  transport: Transport | undefined;
  refs: number;
  warned: boolean;
  teardown: () => void;
};

/** At most one dock per document, shared by every handle. */
let live: Dock | null = null;

const body = () => document.querySelector("body");

const createDock = (parent: Element | null, transport: Transport | undefined): Dock => {
  const host = document.createElement("wordgard-devtools");
  // Nothing the page sets on its ancestors is inherited into the panel.
  host.setAttribute("style", "all: initial");
  const shadow = host.attachShadow({ mode: "open" });
  // Keys typed in the panel stay out of the page's shortcuts, which see the host as their target,
  // not the panel's input. Escape goes on: the panel's popups close on it from the document.
  const contain = (event: Event) => {
    if (event instanceof KeyboardEvent && event.key != "Escape") event.stopPropagation();
  };
  for (const type of ["keydown", "keypress", "keyup"]) host.addEventListener(type, contain);
  let unmountDock: (() => void) | null = null;
  let disposed = false;
  const target = parent ?? body();
  if (target) target.append(host);
  // Called from a script in <head>: the body isn't parsed yet.
  else
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        if (!disposed) (body() ?? document.documentElement).append(host);
      },
      { once: true }
    );
  const ready = import("./app.tsx").then(({ renderDock }) => {
    if (!disposed) unmountDock = renderDock(shadow, transport ?? inPageTransport());
  });
  ready.catch((e) => console.error("wordgard-devtools-panel: failed to load the panel", e));
  const teardown = () => {
    disposed = true;
    unmountDock?.();
    host.remove();
  };
  return { host, ready, parent, transport, refs: 0, warned: false, teardown };
};

/**
 * Docks the panel at the bottom of the page, in a shadow root.
 *
 * There is at most one dock per document: while one is mounted, later calls return handles to it,
 * and their `parent` and `transport` are ignored (with a warning when they differ). The dock is
 * removed when every handle has been unmounted, so a caller that mounts from an effect should still
 * return `unmount` from it.
 *
 * Without a DOM (server rendering) it does nothing, and the handle's `host` is null.
 */
export const mountDevtools = (options: MountOptions = {}): MountedDevtools => {
  if (typeof document == "undefined")
    return { host: null, ready: Promise.resolve(), unmount: () => {} };
  if (!(options.enabled ?? !isProduction())) {
    return {
      host: document.createElement("wordgard-devtools"),
      ready: Promise.resolve(),
      unmount: () => {},
    };
  }
  const parent = options.parent && options.parent != body() ? options.parent : null;
  if (!live) live = createDock(parent, options.transport);
  else if (!live.warned && (parent != live.parent || options.transport != live.transport)) {
    live.warned = true;
    console.warn(
      "wordgard-devtools-panel: mountDevtools() was called with a different parent or transport " +
        "while a dock is mounted; the mounted dock is kept."
    );
  }
  const dock = live;
  dock.refs++;
  let released = false;
  return {
    host: dock.host,
    ready: dock.ready,
    unmount: () => {
      if (released) return;
      released = true;
      if (--dock.refs > 0) return;
      dock.teardown();
      live = null;
    },
  };
};
