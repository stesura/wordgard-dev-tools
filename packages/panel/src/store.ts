import type {
  AgentInfo,
  EditorInfo,
  Path,
  Push,
  Request,
  SelectionInfo,
} from "@stesura/wordgard-dev-tools";
import type { ColourKind } from "./colours.ts";
import type { Transport } from "./transport.ts";

export type View = "structure" | "selection" | "state" | "view" | "schema" | "fields" | "log";
const VIEWS: readonly View[] = [
  "structure",
  "selection",
  "state",
  "view",
  "schema",
  "fields",
  "log",
];
export const isView = (value: unknown): value is View => VIEWS.some((view) => view == value);

// The tab and the editor shown last, restored on reload. The editor by name: ids don't survive one.
const KEY = "wordgard-devtools:panel";
type Saved = { view: View; editor: string | null };

const readSaved = (): Saved => {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return {
      view: isView(stored?.view) ? stored.view : "structure",
      editor: typeof stored?.editor == "string" ? stored.editor : null,
    };
  } catch {
    return { view: "structure", editor: null };
  }
};

const writeSaved = (saved: Saved) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    // Storage blocked: nothing is restored.
  }
};

export type PanelState = {
  agent: AgentInfo | null;
  editors: EditorInfo[];
  selected: number | null;
  /** The selected editor's selection. */
  selection: { id: number; info: SelectionInfo } | null;
  error: string | null;
  /** Problems with some frames, from the transport. */
  notices: string[];
  /** Pick mode: the next click on an editor in the page selects its node. */
  picking: boolean;
  /** Paused by the user: no pushes, no editor attached, so the page's plugins do nothing. */
  paused: boolean;
  /** The tab shown for the selected editor. */
  view: View;
  /** Whether the shown editor's log records, as its Log tab knows it: for the tab's red dot. */
  recording: boolean;
};

export type PanelStore = {
  get: () => PanelState;
  subscribe: (listener: () => void) => () => void;
  select: (id: number | null) => Promise<void>;
  /** The selected editor's document changed (coalesced per frame). */
  onDocChanged: (listener: (id: number) => void) => () => void;
  /** The selected editor's state changed: any update (coalesced per frame). */
  onStateChanged: (listener: (id: number) => void) => () => void;
  /** The selected editor's configuration changed (coalesced per frame). */
  onConfigChanged: (listener: (id: number) => void) => () => void;
  /** The selected editor's transaction log changed (coalesced per frame). */
  onLogChanged: (listener: (id: number) => void) => () => void;
  pick: (on: boolean) => void;
  setView: (view: View) => void;
  /** From the Log tab: its editor's log records or not. */
  setRecording: (recording: boolean) => void;
  /** A node to reveal in an editor's Structure (a pick): taken once, by that editor's Structure tab. */
  takeReveal: (id: number) => Path | null;
  /** Shows a node type's card in the Schema tab, or a mark type's (taken once with `takeTypeReveal`). */
  showType: (id: number, name: string, kind?: ColourKind) => void;
  takeTypeReveal: (id: number) => { kind: ColourKind; name: string } | null;
  /** Shows a node in the Structure tab. */
  showNode: (id: number, path: Path) => void;
  /** Shows the Log tab with an entry selected (taken once with `takeLogReveal`). */
  showLogEntry: (id: number, index: number) => void;
  takeLogReveal: (id: number) => number | null;
  /** Shows the element drawing a node in the DOM tab (taken once with `takeDomReveal`). */
  showDom: (id: number, path: Path) => void;
  takeDomReveal: (id: number) => Path | null;
  /** A reveal is waiting: the Structure takes it with `takeReveal`, the Log with `takeLogReveal`, the Schema with `takeTypeReveal`, the DOM tab with `takeDomReveal`. */
  onReveal: (listener: () => void) => () => void;
  transport: Transport;
  /** Subscribes to pushes and loads the editors (unless paused). Returns the stop function, which detaches. */
  start: () => () => void;
  /** Pausing detaches as stopping does; resuming starts again. */
  pause: (on: boolean) => void;
};

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const createPanelStore = (transport: Transport): PanelStore => {
  const saved = readSaved();
  let state: PanelState = {
    agent: null,
    editors: [],
    selected: null,
    selection: null,
    error: null,
    notices: [],
    picking: false,
    paused: false,
    view: saved.view,
    recording: false,
  };
  const listeners = new Set<() => void>();
  const docListeners = new Set<(id: number) => void>();
  const logListeners = new Set<(id: number) => void>();
  const configListeners = new Set<(id: number) => void>();
  const stateListeners = new Set<(id: number) => void>();
  const revealListeners = new Set<() => void>();
  let reveal: { id: number; path: Path } | null = null;
  let logReveal: { id: number; index: number } | null = null;
  let typeReveal: { id: number; kind: ColourKind; name: string } | null = null;
  let domReveal: { id: number; path: Path } | null = null;
  const set = (patch: Partial<PanelState>) => {
    state = { ...state, ...patch };
    if (patch.view) save();
    for (const listener of listeners) listener();
  };
  const fail = (e: unknown) => set({ error: errorMessage(e) });

  // Bumped by start and stop: replies for an earlier run are dropped, so a stopped store
  // can't re-attach an editor.
  let run = 0;
  let running = false;
  const current = (at: number) => running && at == run;
  // The user's pick, followed when it comes back: the same instance reconnected keeps its id,
  // a remount (a new instance) or a reload is matched by name. Until it's there, if ever, the
  // first editor is shown.
  let chosen: { id: number | null; name: string } | null =
    saved.editor == null ? null : { id: null, name: saved.editor };
  const save = () => writeSaved({ view: state.view, editor: chosen?.name ?? null });

  // Replies can arrive out of order: only the latest selection request lands.
  let selectionRun = 0;
  const loadSelection = async () => {
    const at = run;
    const mine = ++selectionRun;
    const id = state.selected;
    if (id == null) {
      set({ selection: null });
      return;
    }
    const info = await transport.send({ type: "selection", id });
    if (current(at) && mine == selectionRun && id == state.selected)
      set({ selection: { id, info }, error: null });
  };

  const attach = async (id: number | null) => {
    const at = run;
    set({ selected: id, selection: state.selection?.id == id ? state.selection : null });
    try {
      await transport.send({ type: "select", id });
      if (current(at)) await loadSelection();
    } catch (e) {
      if (current(at)) fail(e);
    }
  };

  const select = (id: number | null) => {
    // Paused: nothing reaches the page.
    if (state.paused) return Promise.resolve();
    const editor = state.editors.find((e) => e.id == id);
    chosen = editor ? { id: editor.id, name: editor.name } : null;
    save();
    return attach(id);
  };

  const refreshEditors = async () => {
    const at = run;
    try {
      const { agent, editors, notices = [] } = await transport.send({ type: "listEditors" });
      if (!current(at)) return;
      set({ agent, editors, notices, error: null });
      const target =
        editors.find((e) => e.id == chosen?.id) ??
        editors.find((e) => e.name == chosen?.name) ??
        editors.find((e) => e.id == state.selected) ??
        editors[0] ??
        null;
      // A remounted editor comes back detached.
      if (target?.id != state.selected || (target && !target.attached))
        await attach(target?.id ?? null);
    } catch (e) {
      if (current(at)) fail(e);
    }
  };

  const pick = (on: boolean) => {
    if (on && state.paused) return;
    set({ picking: on });
    // To every frame, through the transport: one pick ends picking everywhere.
    transport.send({ type: "pick", on }).catch(fail);
  };

  // Coalesced per frame: a burst of updates refetches once.
  let frame: number | null = null;
  let docChanged = false;
  let stateChanged = false;
  let logChanged = false;
  let configChanged = false;
  const schedule = () => {
    frame ??= requestAnimationFrame(() => {
      frame = null;
      const id = state.selected;
      if (id != null && docChanged) for (const listener of docListeners) listener(id);
      if (id != null && logChanged) for (const listener of logListeners) listener(id);
      if (id != null && configChanged) for (const listener of configListeners) listener(id);
      if (id != null && stateChanged) for (const listener of stateListeners) listener(id);
      if (stateChanged) loadSelection().catch(fail);
      docChanged = stateChanged = logChanged = configChanged = false;
    });
  };
  const onPush = (push: Push) => {
    if (push.type == "editorsChanged") void refreshEditors();
    // Another panel's picking (the dock and the extension on one page) isn't ours.
    else if (push.type == "pickCancelled") {
      if (state.picking) set({ picking: false });
    } else if (push.type == "picked") {
      if (!state.picking) return;
      // Ends picking in the other frames too.
      pick(false);
      reveal = { id: push.id, path: push.path };
      // Shown in the Structure, whichever tab was open.
      set({ view: "structure" });
      void select(push.id);
      for (const listener of revealListeners) listener();
    } else if (push.type == "stateChanged" && push.id == state.selected) {
      docChanged ||= push.docChanged;
      configChanged ||= push.reconfigured;
      stateChanged = true;
      schedule();
    } else if (push.type == "logChanged" && push.id == state.selected) {
      logChanged = true;
      schedule();
    }
  };

  // The host's start, and pause, run this; its result undoes it.
  let started = false;
  let stopRun: (() => void) | null = null;
  /** `resumed`: the tabs reload once the editor is attached again (updates were missed while paused). */
  const activate = (resumed = false) => {
    run++;
    running = true;
    const at = run;
    let stopPushes = () => {};
    try {
      stopPushes = transport.onPush(onPush);
    } catch (e) {
      fail(e);
    }
    void refreshEditors().then(() => {
      if (!resumed || !current(at)) return;
      docChanged = stateChanged = logChanged = configChanged = true;
      schedule();
    });
    return () => {
      run++;
      running = false;
      stopPushes();
      if (frame != null) cancelAnimationFrame(frame);
      frame = null;
      docChanged = stateChanged = logChanged = configChanged = false;
      if (state.picking) set({ picking: false });
      for (const request of [
        { type: "pick", on: false },
        { type: "highlight", id: 0, path: null },
        { type: "select", id: null },
      ] satisfies Request[]) {
        transport.send(request).catch(() => {});
      }
    };
  };

  return {
    get: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    select,
    onDocChanged: (listener) => {
      docListeners.add(listener);
      return () => {
        docListeners.delete(listener);
      };
    },
    onStateChanged: (listener) => {
      stateListeners.add(listener);
      return () => {
        stateListeners.delete(listener);
      };
    },
    onConfigChanged: (listener) => {
      configListeners.add(listener);
      return () => {
        configListeners.delete(listener);
      };
    },
    onLogChanged: (listener) => {
      logListeners.add(listener);
      return () => {
        logListeners.delete(listener);
      };
    },
    pick,
    setView: (view) => set({ view }),
    setRecording: (recording) => {
      if (recording != state.recording) set({ recording });
    },
    takeReveal: (id) => {
      if (reveal?.id != id) return null;
      const { path } = reveal;
      reveal = null;
      return path;
    },
    showType: (id, name, kind = "node") => {
      typeReveal = { id, kind, name };
      set({ view: "schema" });
      for (const listener of revealListeners) listener();
    },
    takeTypeReveal: (id) => {
      if (typeReveal?.id != id) return null;
      const { kind, name } = typeReveal;
      typeReveal = null;
      return { kind, name };
    },
    showNode: (id, path) => {
      reveal = { id, path };
      set({ view: "structure" });
      for (const listener of revealListeners) listener();
    },
    showLogEntry: (id, index) => {
      logReveal = { id, index };
      set({ view: "log" });
      for (const listener of revealListeners) listener();
    },
    takeLogReveal: (id) => {
      if (logReveal?.id != id) return null;
      const { index } = logReveal;
      logReveal = null;
      return index;
    },
    showDom: (id, path) => {
      domReveal = { id, path };
      set({ view: "view" });
      for (const listener of revealListeners) listener();
    },
    takeDomReveal: (id) => {
      if (domReveal?.id != id) return null;
      const { path } = domReveal;
      domReveal = null;
      return path;
    },
    onReveal: (listener) => {
      revealListeners.add(listener);
      return () => {
        revealListeners.delete(listener);
      };
    },
    transport,
    start: () => {
      started = true;
      if (!state.paused) stopRun = activate();
      return () => {
        started = false;
        stopRun?.();
        stopRun = null;
      };
    },
    pause: (on) => {
      if (on == state.paused) return;
      set({ paused: on });
      if (!started) return;
      stopRun?.();
      stopRun = on ? null : activate(true);
    },
  };
};
