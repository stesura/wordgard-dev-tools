import { PROTOCOL, type Push } from "@stesura/wordgard-dev-tools";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fake, resetBrowser, type FakePort } from "../../__mocks__/wxt/browser.ts";
import type { BackgroundToPanel, PanelToBackground } from "../messages.ts";
import { connectPanel } from "../panel-connection.ts";

vi.mock("wxt/browser");

const announced: BackgroundToPanel = {
  type: "fromFrame",
  frameId: 0,
  url: "https://top.test/",
  message: { type: "announce", v: PROTOCOL, agent: { version: "x", protocol: PROTOCOL } },
};

const latest = () => {
  const port = fake.connected.at(-1);
  if (!port) throw new Error("Not connected");
  return port;
};

const sent = (port: FakePort, type: PanelToBackground["type"]) =>
  port.posted.filter(
    (message) => typeof message == "object" && message && "type" in message && message.type == type
  );

beforeEach(() => {
  resetBrowser();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("panel connection", () => {
  it("connects to the background and says which tab it inspects", () => {
    connectPanel(5);
    expect(fake.connected.map((port) => port.name)).toEqual(["wordgard-devtools-panel"]);
    expect(latest().posted).toEqual([{ type: "init", tabId: 5 }]);
  });

  it("sends requests to a frame through the background, and takes its replies", async () => {
    const transport = connectPanel(5);
    const port = latest();
    port.receive(announced);
    const pending = transport.send({ type: "listEditors" });
    await vi.waitFor(() => expect(sent(port, "toFrame")).toHaveLength(1));
    expect(sent(port, "toFrame")).toEqual([
      {
        type: "toFrame",
        frameId: 0,
        message: { type: "request", id: 1, request: { type: "listEditors" } },
      },
    ]);
    const agent = { version: "x", protocol: PROTOCOL };
    port.receive({
      ...announced,
      message: {
        type: "reply",
        v: PROTOCOL,
        id: 1,
        reply: { ok: true, value: { agent, editors: [] } },
      },
    });
    expect(await pending).toEqual({ agent, editors: [], notices: [] });
  });

  it("pings the background while open, so its service worker isn't stopped", () => {
    connectPanel(5);
    vi.advanceTimersByTime(45_000);
    expect(sent(latest(), "ping")).toHaveLength(2);
  });

  it("connects again when the background restarts, forgetting the frames until they announce", async () => {
    const transport = connectPanel(5);
    const pushes: Push[] = [];
    transport.onPush((push) => pushes.push(push));
    const first = latest();
    first.receive(announced);
    const pending = transport.send({ type: "listEditors" });
    await vi.waitFor(() => expect(sent(first, "toFrame")).toHaveLength(1));
    first.drop();
    // reset() forgets each frame, failing its requests, before the connection's.
    expect((await pending).notices).toEqual(["The frame went away"]);
    expect(pushes).toEqual([{ type: "editorsChanged" }, { type: "editorsChanged" }]);
    expect(fake.connected).toHaveLength(1);
    vi.advanceTimersByTime(100);
    expect(fake.connected).toHaveLength(2);
    const second = latest();
    expect(second.posted).toEqual([{ type: "init", tabId: 5 }]);
    // No frame until one announces itself again.
    expect(await transport.send({ type: "listEditors" })).toEqual({
      agent: null,
      editors: [],
      notices: [],
    });
    expect(sent(second, "toFrame")).toEqual([]);
    // Keepalive pings go to the new port.
    vi.advanceTimersByTime(20_000);
    expect(sent(second, "ping")).toHaveLength(1);
  });
});
