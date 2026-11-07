// The store against a slow fake agent, as the extension's transport will be.
import { afterEach, expect, it } from "vitest";
import type { EditorInfo, Push, Request, RequestType, Results } from "@stesura/wordgard-dev-tools";
import { createPanelStore, type Change } from "../panel-store.ts";
import type { Transport } from "../../transport.ts";

const fakeAgent = (ids: number[], delay = 20) => {
  let editors: EditorInfo[] = ids.map((id) => ({
    id,
    name: `e${id}`,
    attached: false,
    recording: false,
  }));
  // What the agent handled, in order.
  const sent: string[] = [];
  let selections = 0;
  const listeners = new Set<(push: Push) => void>();
  const unsupported = () => {
    throw new Error("unsupported");
  };
  const handlers: { [K in RequestType]: (request: Request<K>) => Results[K] } = {
    listEditors: () => {
      sent.push("listEditors");
      return { agent: { version: "0.0.0", protocol: 1 }, editors: editors.map((e) => ({ ...e })) };
    },
    select: ({ id }) => {
      sent.push(`select:${id}`);
      editors = editors.map((e) => ({ ...e, attached: e.id == id }));
      return null;
    },
    stateJSON: unsupported,
    replaceState: unsupported,
    selection: () => {
      selections++;
      return {
        anchor: 0,
        head: 0,
        from: 0,
        to: 0,
        empty: true,
        json: null,
        headPath: [],
        anchorPath: [],
        nodePath: null,
        cells: null,
        activeMarks: [],
        storedMarks: false,
      };
    },
    node: unsupported,
    structure: unsupported,
    schema: unsupported,
    view: unsupported,
    status: () => ({
      connected: true,
      editable: true,
      focusable: true,
      focused: false,
      composing: false,
      compositionStarted: null,
      root: "document",
    }),
    viewElement: unsupported,
    fields: unsupported,
    field: unsupported,
    watchFields: unsupported,
    scrollIntoView: unsupported,
    logNode: unsupported,
    logState: unsupported,
    fieldChange: unsupported,
    logField: unsupported,
    clearFieldHistory: unsupported,
    findFields: unsupported,
    logType: unsupported,
    selectionDetail: unsupported,
    decorations: unsupported,
    logDecoration: unsupported,
    extensions: unsupported,
    extension: unsupported,
    logExtension: unsupported,
    keymap: unsupported,
    logKeyBinding: unsupported,
    resolve: unsupported,
    logPos: unsupported,
    logSlice: unsupported,
    logEditor: unsupported,
    logNodeDOM: unsupported,
    viewHTML: unsupported,
    record: unsupported,
    clear: unsupported,
    log: unsupported,
    entry: unsupported,
    logEntry: unsupported,
    highlight: () => null,
    pick: ({ on }) => {
      sent.push(`pick:${on}`);
      return null;
    },
    setConsole: unsupported,
    repro: unsupported,
  };
  const answer = <K extends RequestType>(request: Request<K>) => handlers[request.type](request);
  const transport: Transport = {
    send: (request) => {
      return new Promise((resolve, reject) =>
        setTimeout(() => {
          try {
            resolve(answer(request));
          } catch (e) {
            reject(e);
          }
        }, delay)
      );
    },
    onPush: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  const remove = (id: number) => {
    editors = editors.filter((e) => e.id != id);
    for (const listener of listeners) listener({ type: "editorsChanged" });
  };
  const add = (id: number, name = `e${id}`) => {
    editors = [...editors, { id, name, attached: false, recording: false }].sort(
      (a, b) => a.id - b.id
    );
    for (const listener of listeners) listener({ type: "editorsChanged" });
  };
  const push = (message: Push) => {
    for (const listener of listeners) listener(message);
  };
  return {
    transport,
    sent,
    remove,
    add,
    push,
    attached: () => editors.filter((e) => e.attached).map((e) => e.id),
    selections: () => selections,
  };
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 150));

afterEach(() => localStorage.clear());

it("restores the tab and the editor, by name, after a reload", async () => {
  const before = createPanelStore(fakeAgent([1, 2]).transport);
  const stopBefore = before.start();
  await settle();
  await before.select(2);
  before.setTab("schema");
  stopBefore();
  // A reload: new ids, same names.
  const agent = fakeAgent([5, 6]);
  agent.remove(5);
  agent.add(7, "e1");
  agent.add(8, "e2");
  agent.remove(6);
  const store = createPanelStore(agent.transport);
  expect(store.state.get().tab).toBe("schema");
  const stop = store.start();
  await settle();
  expect(store.state.get().selected).toBe(8);
  stop();
});

it("shows the first editor when the saved one is gone, and a stored tab that isn't one is ignored", async () => {
  localStorage.setItem("wordgard-devtools:panel", JSON.stringify({ tab: "nope", editor: "gone" }));
  const agent = fakeAgent([1, 2]);
  const store = createPanelStore(agent.transport);
  expect(store.state.get().tab).toBe("structure");
  const stop = store.start();
  await settle();
  expect(store.state.get().selected).toBe(1);
  expect(agent.attached()).toEqual([1]);
  stop();
});

it("reads a tab saved before the DOM tab's id was dom", () => {
  localStorage.setItem("wordgard-devtools:panel", JSON.stringify({ view: "view", editor: null }));
  expect(createPanelStore(fakeAgent([]).transport).state.get().tab).toBe("dom");
  localStorage.setItem("wordgard-devtools:panel", JSON.stringify({ view: "log", editor: null }));
  expect(createPanelStore(fakeAgent([]).transport).state.get().tab).toBe("log");
});

it("doesn't attach an editor once stopped", async () => {
  const agent = fakeAgent([1]);
  const store = createPanelStore(agent.transport);
  const stop = store.start();
  stop();
  await settle();
  expect(agent.sent).toEqual(["listEditors", "pick:false", "select:null"]);
  expect(agent.attached()).toEqual([]);
});

it("follows the chosen editor when it comes back", async () => {
  const agent = fakeAgent([1, 2]);
  const store = createPanelStore(agent.transport);
  const stop = store.start();
  await settle();
  expect(store.state.get().selected).toBe(1);
  await store.select(2);
  agent.remove(2);
  await settle();
  expect(store.state.get().selected).toBe(1);
  agent.add(2);
  await settle();
  expect(store.state.get().selected).toBe(2);
  expect(agent.attached()).toEqual([2]);
  stop();
});

it("follows the chosen editor's name when it is remounted as a new instance", async () => {
  const agent = fakeAgent([1, 2]);
  const store = createPanelStore(agent.transport);
  const stop = store.start();
  await settle();
  await store.select(2);
  agent.remove(2);
  await settle();
  agent.add(3, "e2");
  await settle();
  expect(store.state.get().selected).toBe(3);
  stop();
});

it("ignores another panel's picks", async () => {
  const agent = fakeAgent([1, 2]);
  const store = createPanelStore(agent.transport);
  const stop = store.start();
  await settle();
  agent.push({ type: "picked", id: 2, path: [0] });
  await settle();
  expect(store.state.get().selected).toBe(1);
  expect(store.takeReveal(2)).toBeNull();
  stop();
});

it("leaves pick mode when picking ends elsewhere", async () => {
  const agent = fakeAgent([1, 2]);
  const store = createPanelStore(agent.transport);
  const stop = store.start();
  await settle();
  store.pick(true);
  await settle();
  agent.sent.length = 0;
  agent.push({ type: "pickCancelled" });
  expect(store.state.get().picking).toBe(false);
  await settle();
  expect(agent.sent).toEqual([]);
  store.pick(true);
  agent.push({ type: "picked", id: 2, path: [0, 1] });
  await settle();
  expect(store.state.get()).toMatchObject({ picking: false, selected: 2 });
  expect(store.takeReveal(2)).toEqual([0, 1]);
  stop();
});

it("detaches while paused, and attaches again on resume", async () => {
  const agent = fakeAgent([1, 2]);
  const store = createPanelStore(agent.transport);
  const stop = store.start();
  await settle();
  expect(agent.attached()).toEqual([1]);
  store.pause(true);
  await settle();
  expect(store.state.get().paused).toBe(true);
  expect(agent.attached()).toEqual([]);
  // No pushes while paused: an editor list change goes unseen.
  agent.sent.length = 0;
  agent.add(3);
  await settle();
  expect(agent.sent).toEqual([]);
  store.pause(false);
  await settle();
  expect(agent.attached()).toEqual([1]);
  expect(store.state.get().editors.map((e) => e.id)).toEqual([1, 2, 3]);
  stop();
});

const CHANGES: Change[] = ["state", "config", "log", "doc"];
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

const listen = (store: ReturnType<typeof createPanelStore>) => {
  const heard: string[] = [];
  for (const change of CHANGES) store.on(change, (id) => heard.push(`${change}:${id}`));
  return heard;
};

it("tells each change once per frame, in order: doc, log, config, state", async () => {
  const agent = fakeAgent([1]);
  const store = createPanelStore(agent.transport);
  const stop = store.start();
  await settle();
  const heard = listen(store);
  const selections = agent.selections();
  agent.push({
    type: "stateChanged",
    id: 1,
    docChanged: false,
    selectionSet: false,
    reconfigured: false,
  });
  agent.push({
    type: "stateChanged",
    id: 1,
    docChanged: true,
    selectionSet: true,
    reconfigured: true,
  });
  agent.push({ type: "logChanged", id: 1, end: 1 });
  agent.push({ type: "logChanged", id: 1, end: 2 });
  // Coalesced: nothing until the next frame.
  expect(heard).toEqual([]);
  await nextFrame();
  expect(heard).toEqual(["doc:1", "log:1", "config:1", "state:1"]);
  await settle();
  expect(agent.selections()).toBe(selections + 1);
  stop();
});

it("tells only the selected editor's changes, and reloads the selection on state changes only", async () => {
  const agent = fakeAgent([1, 2]);
  const store = createPanelStore(agent.transport);
  const stop = store.start();
  await settle();
  const heard = listen(store);
  const selections = agent.selections();
  agent.push({
    type: "stateChanged",
    id: 2,
    docChanged: true,
    selectionSet: false,
    reconfigured: false,
  });
  agent.push({ type: "logChanged", id: 1, end: 1 });
  await settle();
  expect(heard).toEqual(["log:1"]);
  expect(agent.selections()).toBe(selections);
  stop();
});

it("tells every change again on resume: the updates were missed while paused", async () => {
  const agent = fakeAgent([1]);
  const store = createPanelStore(agent.transport);
  const stop = store.start();
  await settle();
  const heard = listen(store);
  store.pause(true);
  agent.push({ type: "logChanged", id: 1, end: 1 });
  await settle();
  expect(heard).toEqual([]);
  store.pause(false);
  await settle();
  expect(heard).toEqual(["doc:1", "log:1", "config:1", "state:1"]);
  stop();
});
