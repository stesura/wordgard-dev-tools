import type { AgentInfo, Push, Request } from "@stesura/wordgard-dev-tools";

export const PANEL_PORT = "wordgard-devtools-panel";
export const BRIDGE_PORT = "wordgard-devtools-bridge";
export const BRIDGE_FILE = "/bridge.js";

/** Background → bridge, and the panel's requests routed through it. */
export type ToBridge = { type: "request"; id: number; request: Request };

/**
 * Bridge → background → panel. `v` is the page agent's protocol. Replies come from the page,
 * structured-cloned: their values are unchecked, hence `any`.
 */
export type FromBridge =
  | { type: "announce"; v: number; agent: AgentInfo }
  | {
      type: "reply";
      v: number;
      id: number;
      reply: { ok: true; value: any } | { ok: false; error: string };
    }
  | { type: "push"; v: number; push: Push };

export type PanelToBackground =
  | { type: "init"; tabId: number }
  | { type: "toFrame"; frameId: number; message: ToBridge }
  | { type: "ping" };

export type BackgroundToPanel =
  | { type: "fromFrame"; frameId: number; url: string; message: FromBridge }
  | { type: "frameGone"; frameId: number }
  /** The bridge couldn't be injected (a page extensions can't script, or no host permission). */
  | { type: "injectFailed"; error: string };
