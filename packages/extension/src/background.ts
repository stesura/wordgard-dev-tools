import { browser, type Browser } from "wxt/browser";
import {
  BRIDGE_FILE,
  BRIDGE_PORT,
  PANEL_PORT,
  type BackgroundToPanel,
  type FromBridge,
  type PanelToBackground,
} from "./messages.ts";

type Port = Browser.runtime.Port;

/**
 * Routes between each tab's panel and the bridges in that tab's frames. Bridges are injected
 * only while a panel is open for the tab: on open, then in every frame that loads.
 */
export const startBackground = () => {
  const panels = new Map<number, Port>();
  const bridges = new Map<number, Map<number, Port>>();

  const toPanel = (tabId: number, message: BackgroundToPanel) =>
    panels.get(tabId)?.postMessage(message);

  const inject = (tabId: number, frameIds?: number[]) =>
    browser.scripting
      .executeScript({
        target: frameIds ? { tabId, frameIds } : { tabId, allFrames: true },
        files: [BRIDGE_FILE],
      })
      .catch((e) =>
        toPanel(tabId, { type: "injectFailed", error: e instanceof Error ? e.message : String(e) })
      );

  const onPanel = (port: Port) => {
    let tabId: number | null = null;
    port.onMessage.addListener((message: PanelToBackground) => {
      if (message.type == "init") {
        tabId = message.tabId;
        panels.set(tabId, port);
        void inject(tabId);
      } else if (message.type == "toFrame" && tabId != null) {
        bridges.get(tabId)?.get(message.frameId)?.postMessage(message.message);
      }
    });
    port.onDisconnect.addListener(() => {
      if (tabId == null || panels.get(tabId) != port) return;
      panels.delete(tabId);
      // Each bridge then tells its page agent to detach.
      for (const bridge of bridges.get(tabId)?.values() ?? []) bridge.disconnect();
      bridges.delete(tabId);
    });
  };

  const onBridge = (port: Port) => {
    const tabId = port.sender?.tab?.id;
    const frameId = port.sender?.frameId ?? 0;
    const url = port.sender?.url ?? "";
    if (tabId == null || !panels.has(tabId)) {
      port.disconnect();
      return;
    }
    let frames = bridges.get(tabId);
    if (!frames) bridges.set(tabId, (frames = new Map()));
    const previous = frames.get(frameId);
    if (previous) {
      // A new document whose predecessor's disconnect hasn't arrived yet.
      previous.disconnect();
      toPanel(tabId, { type: "frameGone", frameId });
    }
    frames.set(frameId, port);
    port.onMessage.addListener((message: FromBridge) =>
      toPanel(tabId, { type: "fromFrame", frameId, url, message })
    );
    port.onDisconnect.addListener(() => {
      if (bridges.get(tabId)?.get(frameId) != port) return;
      bridges.get(tabId)?.delete(frameId);
      toPanel(tabId, { type: "frameGone", frameId });
    });
  };

  browser.runtime.onConnect.addListener((port) => {
    if (port.name == PANEL_PORT) onPanel(port);
    else if (port.name == BRIDGE_PORT) onBridge(port);
  });

  browser.webNavigation.onDOMContentLoaded.addListener(({ tabId, frameId }) => {
    if (panels.has(tabId)) void inject(tabId, [frameId]);
  });
};
