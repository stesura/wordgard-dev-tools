import { PROTOCOL } from "@stesura/wordgard-dev-tools";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  connect,
  domContentLoaded,
  fake,
  fakePort,
  resetBrowser,
  type Sender,
} from "../../__mocks__/wxt/browser.ts";
import { startBackground } from "../background.ts";
import {
  BRIDGE_FILE,
  BRIDGE_PORT,
  PANEL_PORT,
  type FromBridge,
  type ToBridge,
} from "../messages.ts";

vi.mock("wxt/browser", () => import("../../__mocks__/wxt/browser.ts"));

const openPanel = (tabId: number) => {
  const panel = fakePort(PANEL_PORT);
  connect(panel);
  panel.receive({ type: "init", tabId });
  return panel;
};

const openBridge = (sender: Sender) => {
  const bridge = fakePort(BRIDGE_PORT, sender);
  connect(bridge);
  return bridge;
};

const announce: FromBridge = {
  type: "announce",
  v: PROTOCOL,
  agent: { version: "x", protocol: PROTOCOL },
};

const request: ToBridge = { type: "request", id: 1, request: { type: "listEditors" } };

beforeEach(() => {
  resetBrowser();
  startBackground();
});

describe("background", () => {
  it("injects the bridge into the tab's frames when its panel opens, then into each frame that loads", () => {
    openPanel(1);
    domContentLoaded({ tabId: 1, frameId: 3 });
    domContentLoaded({ tabId: 2, frameId: 0 });
    expect(fake.injections).toEqual([
      { target: { tabId: 1, allFrames: true }, files: [BRIDGE_FILE] },
      { target: { tabId: 1, frameIds: [3] }, files: [BRIDGE_FILE] },
    ]);
  });

  it("tells the panel when the bridge can't be injected", async () => {
    fake.injectError = new Error("Cannot access a chrome:// URL");
    const panel = openPanel(1);
    await vi.waitFor(() =>
      expect(panel.posted).toEqual([
        { type: "injectFailed", error: "Cannot access a chrome:// URL" },
      ])
    );
  });

  it("routes between the panel and each frame's bridge", () => {
    const panel = openPanel(1);
    const top = openBridge({ tab: { id: 1 }, frameId: 0, url: "https://top.test/" });
    const inner = openBridge({ tab: { id: 1 }, frameId: 3, url: "https://frame.test/" });
    inner.receive(announce);
    expect(panel.posted).toEqual([
      { type: "fromFrame", frameId: 3, url: "https://frame.test/", message: announce },
    ]);
    panel.receive({ type: "toFrame", frameId: 3, message: request });
    // A frame without a bridge: dropped.
    panel.receive({ type: "toFrame", frameId: 9, message: request });
    expect(inner.posted).toEqual([request]);
    expect(top.posted).toEqual([]);
  });

  it("keeps each tab's panel and bridges apart", () => {
    const one = openPanel(1);
    const two = openPanel(2);
    const bridge = openBridge({ tab: { id: 2 }, frameId: 0 });
    bridge.receive(announce);
    expect(one.posted).toEqual([]);
    expect(two.posted).toHaveLength(1);
  });

  it("turns away a bridge when no panel is open for its tab", () => {
    openPanel(1);
    expect(openBridge({ tab: { id: 2 }, frameId: 0 }).disconnected).toBe(true);
    // Not from a tab.
    expect(openBridge({}).disconnected).toBe(true);
  });

  it("replaces a frame's bridge when its new document connects before the old one's disconnect", () => {
    const panel = openPanel(1);
    const old = openBridge({ tab: { id: 1 }, frameId: 0 });
    const next = openBridge({ tab: { id: 1 }, frameId: 0 });
    expect(old.disconnected).toBe(true);
    expect(panel.posted).toEqual([{ type: "frameGone", frameId: 0 }]);
    // The old one's disconnect, late: the frame has a bridge.
    old.drop();
    expect(panel.posted).toHaveLength(1);
    panel.receive({ type: "toFrame", frameId: 0, message: request });
    expect(next.posted).toEqual([request]);
    next.drop();
    expect(panel.posted).toEqual([
      { type: "frameGone", frameId: 0 },
      { type: "frameGone", frameId: 0 },
    ]);
  });

  it("disconnects the tab's bridges when its panel closes, and stops injecting", () => {
    const panel = openPanel(1);
    const bridges = [0, 3].map((frameId) => openBridge({ tab: { id: 1 }, frameId }));
    panel.drop();
    expect(bridges.map((bridge) => bridge.disconnected)).toEqual([true, true]);
    domContentLoaded({ tabId: 1, frameId: 0 });
    expect(fake.injections).toHaveLength(1);
    expect(openBridge({ tab: { id: 1 }, frameId: 0 }).disconnected).toBe(true);
  });

  it("keeps a reopened panel when the old one's disconnect arrives late", () => {
    const old = openPanel(1);
    const reopened = openPanel(1);
    old.drop();
    const bridge = openBridge({ tab: { id: 1 }, frameId: 0 });
    expect(bridge.disconnected).toBe(false);
    bridge.receive(announce);
    expect(reopened.posted).toHaveLength(1);
  });

  it("ignores a panel's messages before it says which tab it inspects", () => {
    const panel = fakePort(PANEL_PORT);
    connect(panel);
    panel.receive({ type: "toFrame", frameId: 0, message: request });
    panel.drop();
    expect(fake.injections).toEqual([]);
  });
});
