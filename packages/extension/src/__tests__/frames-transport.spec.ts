import { describe, expect, it } from "vitest";
import {
  PROTOCOL,
  mismatch,
  type EditorInfo,
  type Push,
  type Request,
} from "@stesura/wordgard-dev-tools";
import { createFramesTransport } from "../frames-transport.ts";
import type { ToBridge } from "../messages.ts";

type FakeFrame = {
  url: string;
  editors: EditorInfo[];
  seen: Request[];
  v?: number;
  silent?: boolean;
  delay?: number;
};

const editor = (id: number, name: string): EditorInfo => ({
  id,
  name,
  attached: false,
  recording: false,
});

// Frames whose agents answer listEditors and select, and echo the rest.
const setup = (frames: Record<number, FakeFrame>, timeout = 50) => {
  const { transport, receive, reset } = createFramesTransport((frameId, message: ToBridge) => {
    const frame = frames[frameId];
    if (!frame || frame.silent) return;
    frame.seen.push(message.request);
    const { request } = message;
    const value =
      request.type == "listEditors"
        ? { agent: { version: `v${frameId}`, protocol: PROTOCOL }, editors: frame.editors }
        : request.type == "select"
          ? null
          : request;
    setTimeout(
      () =>
        receive({
          type: "fromFrame",
          frameId,
          url: frame.url,
          message: { type: "reply", v: PROTOCOL, id: message.id, reply: { ok: true, value } },
        }),
      frame.delay ?? 0
    );
  }, timeout);
  const announce = (frameId: number) => {
    const frame = frames[frameId];
    if (!frame) return;
    const v = frame.v ?? PROTOCOL;
    receive({
      type: "fromFrame",
      frameId,
      url: frame.url,
      message: { type: "announce", v, agent: { version: "x", protocol: v } },
    });
  };
  const pushed: Push[] = [];
  transport.onPush((push) => pushed.push(push));
  return { transport, receive, reset, announce, pushed };
};

const twoFrames = (): { 0: FakeFrame; 7: FakeFrame } => ({
  0: { url: "https://top.test/", editors: [editor(1, "body"), editor(2, "title")], seen: [] },
  7: { url: "https://frame.test/inner", editors: [editor(1, "framed")], seen: [] },
});

describe("frames transport", () => {
  it("lists every frame's editors under ids of its own", async () => {
    const { transport, announce, pushed } = setup(twoFrames());
    announce(0);
    announce(7);
    expect(pushed).toEqual([{ type: "editorsChanged" }, { type: "editorsChanged" }]);
    const { agent, editors, notices } = await transport.send({ type: "listEditors" });
    expect(agent?.version).toBe("v0");
    expect(notices).toEqual([]);
    expect(editors.map((e) => [e.id, e.name, e.frame])).toEqual([
      [1, "body", undefined],
      [2, "title", undefined],
      [3, "framed", "frame.test/inner"],
    ]);
  });

  it("routes requests to the editor's frame with the page's id", async () => {
    const frames = twoFrames();
    const { transport, announce } = setup(frames);
    announce(0);
    announce(7);
    await transport.send({ type: "listEditors" });
    expect(await transport.send({ type: "node", id: 3, path: [0] })).toEqual({
      type: "node",
      id: 1,
      path: [0],
    });
    expect(frames[7].seen.at(-1)).toEqual({ type: "node", id: 1, path: [0] });
    await transport.send({ type: "select", id: 3 });
    expect(frames[7].seen.at(-1)).toEqual({ type: "select", id: 1 });
    expect(frames[0].seen.at(-1)).toEqual({ type: "select", id: null });
    await expect(transport.send({ type: "selection", id: 99 })).rejects.toThrow(
      "No editor with id 99"
    );
  });

  it("routes the extensions requests with their paths", async () => {
    const frames = twoFrames();
    const { transport, announce } = setup(frames);
    announce(0);
    await transport.send({ type: "listEditors" });
    await transport.send({ type: "extensions", id: 2 });
    expect(frames[0].seen.at(-1)).toEqual({ type: "extensions", id: 2 });
    await transport.send({ type: "extension", id: 2, path: [1, 0] });
    expect(frames[0].seen.at(-1)).toEqual({ type: "extension", id: 2, path: [1, 0] });
    await transport.send({ type: "logExtension", id: 2, path: [3], resolved: true });
    expect(frames[0].seen.at(-1)).toEqual({
      type: "logExtension",
      id: 2,
      path: [3],
      resolved: true,
    });
  });

  it("forwards the log's decorations flag", async () => {
    const frames = twoFrames();
    const { transport, announce } = setup(frames);
    announce(0);
    await transport.send({ type: "listEditors" });
    await transport.send({ type: "log", id: 2, from: 3, to: 9, decorations: true });
    expect(frames[0].seen.at(-1)).toEqual({
      type: "log",
      id: 2,
      from: 3,
      to: 9,
      decorations: true,
    });
  });

  it("translates pushes and ignores frames without an agent", async () => {
    const { transport, receive, announce, pushed } = setup(twoFrames());
    announce(7);
    await transport.send({ type: "listEditors" });
    pushed.length = 0;
    const push = (frameId: number, p: Push) =>
      receive({
        type: "fromFrame",
        frameId,
        url: "",
        message: { type: "push", v: PROTOCOL, push: p },
      });
    push(7, {
      type: "stateChanged",
      id: 1,
      docChanged: true,
      selectionSet: false,
      reconfigured: false,
    });
    push(0, {
      type: "stateChanged",
      id: 1,
      docChanged: true,
      selectionSet: false,
      reconfigured: false,
    });
    push(7, { type: "picked", id: 1, path: [0, 1] });
    push(7, { type: "pickCancelled" });
    expect(pushed).toEqual([
      { type: "stateChanged", id: 1, docChanged: true, selectionSet: false, reconfigured: false },
      { type: "picked", id: 1, path: [0, 1] },
      { type: "pickCancelled" },
    ]);
  });

  it("forgets a frame that goes away, and doesn't reuse its ids", async () => {
    const frames = twoFrames();
    const { transport, receive, announce } = setup(frames);
    announce(0);
    announce(7);
    await transport.send({ type: "listEditors" });
    receive({ type: "frameGone", frameId: 7 });
    expect((await transport.send({ type: "listEditors" })).editors.map((e) => e.id)).toEqual([
      1, 2,
    ]);
    await expect(transport.send({ type: "node", id: 3, path: [] })).rejects.toThrow(
      "No editor with id 3"
    );
    // The frame's next document starts its own ids at 1 again: a different editor.
    announce(7);
    expect((await transport.send({ type: "listEditors" })).editors.map((e) => e.id)).toEqual([
      1, 2, 4,
    ]);
  });

  it("rejects pending requests when their frame goes away", async () => {
    const frames = twoFrames();
    const { transport, receive, announce } = setup(frames, 1000);
    announce(7);
    await transport.send({ type: "listEditors" });
    frames[7].silent = true;
    const pending = transport.send({ type: "selection", id: 1 });
    receive({ type: "frameGone", frameId: 7 });
    await expect(pending).rejects.toThrow("The frame went away");
  });

  it("reports a protocol mismatch and leaves that frame out", async () => {
    const frames = { ...twoFrames(), 7: { ...twoFrames()[7], v: PROTOCOL + 1 } };
    const { transport, announce } = setup(frames);
    announce(0);
    announce(7);
    const { editors, notices } = await transport.send({ type: "listEditors" });
    expect(editors.map((e) => e.name)).toEqual(["body", "title"]);
    expect(notices).toEqual([`frame.test/inner: ${mismatch(PROTOCOL + 1, PROTOCOL)}`]);
    expect(frames[7].seen).toEqual([]);
  });

  it("times out on a page that doesn't answer", async () => {
    const frames = twoFrames();
    frames[0] = { ...frames[0], silent: true };
    const { transport, announce } = setup(frames);
    announce(0);
    const { editors, notices } = await transport.send({ type: "listEditors" });
    expect(editors).toEqual([]);
    expect(notices).toEqual(["top.test/: the page didn't answer"]);
  });

  it("hides the outline in every frame", async () => {
    const frames = twoFrames();
    const { transport, announce } = setup(frames);
    announce(0);
    announce(7);
    await transport.send({ type: "highlight", id: 0, path: null });
    expect(frames[0].seen.at(-1)).toEqual({ type: "highlight", id: 0, path: null });
    expect(frames[7].seen.at(-1)).toEqual({ type: "highlight", id: 0, path: null });
  });

  it("starts over when the connection drops, with new ids", async () => {
    const { transport, announce, reset, pushed } = setup(twoFrames());
    announce(0);
    await transport.send({ type: "listEditors" });
    pushed.length = 0;
    reset();
    expect(pushed).toEqual([{ type: "editorsChanged" }]);
    expect((await transport.send({ type: "listEditors" })).editors).toEqual([]);
    // The frame may have navigated while the connection was down: its editors get new ids.
    announce(0);
    expect((await transport.send({ type: "listEditors" })).editors.map((e) => e.id)).toEqual([
      3, 4,
    ]);
  });

  it("reports the top frame's agent, whichever frame answers first", async () => {
    const frames = twoFrames();
    frames[0] = { ...frames[0], delay: 30 };
    const { transport, announce } = setup(frames);
    announce(7);
    announce(0);
    expect((await transport.send({ type: "listEditors" })).agent?.version).toBe("v0");
  });

  it("says so when the page can't be scripted", async () => {
    const { transport, receive, announce } = setup(twoFrames());
    receive({ type: "injectFailed", error: "Cannot access a chrome:// URL" });
    expect((await transport.send({ type: "listEditors" })).notices).toEqual([
      "Can't inspect this page: Cannot access a chrome:// URL",
    ]);
    // Some frame got its bridge after all: no notice.
    announce(0);
    expect((await transport.send({ type: "listEditors" })).notices).toEqual([]);
  });

  it("selects in the target frame even when another frame hangs", async () => {
    const frames = twoFrames();
    const { transport, announce } = setup(frames);
    announce(0);
    announce(7);
    await transport.send({ type: "listEditors" });
    frames[0].silent = true;
    await transport.send({ type: "select", id: 3 });
    expect(frames[7].seen.at(-1)).toEqual({ type: "select", id: 1 });
  });
});
