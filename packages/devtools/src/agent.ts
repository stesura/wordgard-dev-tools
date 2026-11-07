import type { Wordgard } from "wordgard/editor";
import {
  PROTOCOL,
  SOURCE,
  accessor,
  mismatch,
  type Message,
  type Push,
  type Reply,
  type Request,
  type RequestType,
  type Results,
} from "./protocol.ts";
import type { Agent, Entry, Registry } from "./registry.ts";
import type * as Decorations from "./decorations.ts";
import type * as Extensions from "./extensions.ts";
import type * as Tags from "./tags.ts";
import type * as Keymap from "./keymap.ts";
import type * as Fields from "./fields.ts";
import type * as Inspect from "./inspect.ts";
import type * as Log from "./log.ts";
import type * as Repro from "./repro.ts";
import type * as Schema from "./schema.ts";
import type * as View from "./view.ts";
import { byAgent } from "./reads.ts";
import type * as Serialisers from "./serialise.ts";
import { VERSION } from "./version.ts";

/** Who asked: the in-page panel calls the agent directly, the extension over postMessage. */
type Client = "local" | "remote";
const clients: Client[] = ["local", "remote"];

type Handlers = {
  [K in RequestType]: (request: Request<K>, client: Client) => Results[K] | Promise<Results[K]>;
};

const fromBridge = (data: unknown, kind: string) =>
  typeof data == "object" &&
  data != null &&
  "source" in data &&
  data.source == SOURCE &&
  "kind" in data &&
  data.kind == kind;

const isRequest = (data: unknown): data is Extract<Message, { kind: "request" }> =>
  fromBridge(data, "request");

/** An entry of a JSON object or array, by its key. */
const childOf = (value: unknown, key: string): unknown =>
  Array.isArray(value)
    ? value[Number(key)]
    : typeof value == "object" && value != null
      ? Reflect.get(value, key)
      : undefined;

/**
 * `$wg` and `$tr` in the page's console: the editor a panel shows, the transaction it opened.
 * `tr` left out keeps the transaction while the editor stays the same.
 */
export type ConsoleGlobals = { set: (wg: Wordgard | null, tr?: unknown) => void };

const createConsoleGlobals = (): ConsoleGlobals => {
  let editor: Wordgard | null = null;
  let transaction: unknown = null;
  const getters: [string, () => unknown][] = [
    ["$wg", () => editor ?? undefined],
    ["$tr", () => transaction ?? undefined],
  ];
  const install = () => {
    for (const [name, get] of getters) {
      // The page's own `$wg` stays; ours is defined once, and a page assigning one takes it over.
      if (Object.getOwnPropertyDescriptor(window, name)) continue;
      const set = (value: unknown) =>
        Object.defineProperty(window, name, {
          configurable: true,
          enumerable: true,
          writable: true,
          value,
        });
      try {
        Object.defineProperty(window, name, { configurable: true, get, set });
      } catch {
        // A frozen window: no globals.
      }
    }
  };
  return {
    set: (wg, tr) => {
      transaction = tr !== undefined ? tr : wg == editor ? transaction : null;
      editor = wg;
      if (wg) install();
    },
  };
};

const createHandlers = (
  registry: Registry,
  s: typeof Serialisers,
  schema: typeof Schema,
  view: typeof View,
  decorations: typeof Decorations,
  extensions: typeof Extensions,
  tags: typeof Tags,
  keymap: typeof Keymap,
  repro: typeof Repro,
  inspector: Inspect.Inspector,
  recorder: Log.Recorder,
  tracker: Fields.FieldTracker,
  select: (client: Client, id: number | null) => void,
  globals: ConsoleGlobals
): Handlers => {
  const entry = (id: number) => {
    for (const e of registry.editors.values()) if (e.id == id) return e;
    throw new Error(`No editor with id ${id}`);
  };
  return {
    listEditors: () => ({
      agent: { version: VERSION, protocol: PROTOCOL },
      editors: [...registry.editors.values()].map(s.editorInfo),
    }),
    select: ({ id }, client) => {
      if (id != null) entry(id);
      select(client, id);
      return null;
    },
    stateJSON: ({ id }) => s.stateJSON(entry(id)),
    replaceState: ({ id, json }) => s.replaceState(entry(id), json),
    node: ({ id, path }) => s.node(entry(id).wg.state.doc, path),
    structure: ({ id }) => s.structure(entry(id).wg.state.doc),
    schema: ({ id }) => {
      const { state } = entry(id).wg;
      return schema.schemaInfo(state.schema, {
        decorations: tags.typeDecorations(state),
        isAtom: (type) => state.isAtom(type),
      });
    },
    view: ({ id }) => view.viewInfo(entry(id).wg),
    status: ({ id }) => view.viewStatus(entry(id).wg),
    viewElement: ({ id, path, action }) => {
      const target = view.viewNode(entry(id).wg, path);
      if (action == "outline") inspector.outlineDOM(target, view.viewLabel(target));
      else if (action == "logHTML")
        console.log(
          `[wordgard-devtools] the editor's <${view.viewLabel(target)}>, outer HTML`,
          view.outerHTML(target)
        );
      else console.log(`[wordgard-devtools] the editor's <${view.viewLabel(target)}>`, target);
      return null;
    },
    viewHTML: ({ id, path }) => view.outerHTML(view.viewNode(entry(id).wg, path)),
    selection: ({ id }) => s.selection(entry(id).wg.state),
    selectionDetail: ({ id }) => s.selectionDetail(entry(id).wg.state),
    decorations: ({ id }) => decorations.decorations(entry(id).wg.state),
    logDecoration: ({ id, source, index }) => {
      decorations.logDecoration(entry(id).wg.state, source, index);
      return null;
    },
    extensions: ({ id }) => {
      const e = entry(id);
      return extensions.extensions(e.wg.state, e);
    },
    extension: ({ id, path }) => {
      const e = entry(id);
      return extensions.extensionDetail(e.wg.state, e, path);
    },
    logExtension: ({ id, path, resolved }) => {
      const e = entry(id);
      extensions.logExtension(e.wg.state, e, path, resolved);
      return null;
    },
    keymap: ({ id }) => keymap.keymap(entry(id).wg.state),
    logKeyBinding: ({ id, index, shift }) => {
      keymap.logKeyBinding(entry(id).wg.state, index, shift);
      return null;
    },
    resolve: ({ id, pos }) => s.resolve(entry(id).wg.state.doc, pos),
    logPos: ({ id, pos }) => {
      console.log(
        `[wordgard-devtools] doc.resolve(${pos})`,
        s.resolvePos(entry(id).wg.state.doc, pos)
      );
      return null;
    },
    logNodeDOM: ({ id, path }) => {
      const { wg } = entry(id);
      const target = s.locate(wg.state.doc, path);
      if (!target) throw new Error(`No node at path [${path.join(", ")}]`);
      const { element, name, own } = view.nodeElement(wg, path);
      console.log(
        own
          ? `[wordgard-devtools] ${name}'s element`
          : `[wordgard-devtools] ${target.node.name} draws no element; ${name}'s`,
        element
      );
      return null;
    },
    logEditor: ({ id }) => {
      console.log("[wordgard-devtools] editor", entry(id).wg);
      return null;
    },
    logSlice: ({ id }) => {
      const { state } = entry(id).wg;
      console.log(
        "[wordgard-devtools] state.selection.toSlice(state.doc)",
        state.selection.toSlice(state.doc)
      );
      return null;
    },
    fields: ({ id }) => tracker.list(entry(id)),
    field: ({ id, index }) => tracker.detail(entry(id), index),
    fieldChange: ({ id, index, seq }) => tracker.changeDetail(entry(id), index, seq),
    logField: ({ id, index, seq, history }) => {
      tracker.log(entry(id), index, seq, history);
      return null;
    },
    clearFieldHistory: ({ id, index }) => {
      tracker.clearHistory(entry(id), index);
      return null;
    },
    findFields: ({ id, query }) => tracker.find(entry(id), query),
    logType: ({ id, kind, name, json }) => {
      const state = entry(id).wg.state;
      if (json || kind == "group") {
        const info = schema.schemaInfo(state.schema);
        const found =
          kind == "group"
            ? info.groups.find((g) => g.name == name)
            : (kind == "node" ? info.nodes : info.marks).find((t) => t.name == name)?.spec;
        if (!found) throw new Error(`No ${kind} ${name}`);
        console.log(
          `[wordgard-devtools] the ${name} ${kind == "group" ? "node group" : `${kind} type's spec`}`,
          found
        );
        return null;
      }
      const type = (kind == "node" ? state.schema.nodes : state.schema.marks).find(
        (t) => t.name == name
      );
      if (!type) throw new Error(`No ${kind} type ${name}`);
      console.log(`[wordgard-devtools] the ${name} ${kind} type`, type);
      return null;
    },
    watchFields: ({ id, on }, client) => {
      const e = entry(id);
      if (on && !e.attached) throw new Error("Select the editor before watching its fields");
      tracker.watch(e, client, on);
      return null;
    },
    record: ({ id, on, size, selectPointer, focusChanges }) => {
      const e = entry(id);
      // The log records only what a panel shows (see `sync`).
      if (on && !e.attached) throw new Error("Select the editor before recording");
      recorder.record(e, on, { size, selectPointer, focusChanges });
      return null;
    },
    clear: ({ id }) => {
      recorder.clear(entry(id));
      return null;
    },
    log: ({ id, from, to, decorations }) => recorder.slice(entry(id), from, to, decorations),
    entry: ({ id, index }) => recorder.detail(entry(id), index),
    logEntry: ({ id, index, part }) => {
      recorder.log(entry(id), index, part);
      return null;
    },
    highlight: ({ id, path }) => {
      inspector.highlight(path ? entry(id) : null, path);
      return null;
    },
    pick: ({ on }) => {
      inspector.pick(on);
      return null;
    },
    scrollIntoView: ({ id, path }) => {
      inspector.scrollIntoView(entry(id), path);
      return null;
    },
    logNode: ({ id, path, json, part }) => {
      const found = s.locate(entry(id).wg.state.doc, path);
      if (!found) throw new Error(`No node at path [${path.join(", ")}]`);
      const { node, from } = found;
      const to = from + node.length;
      const at = `${node.name} at range ${from}–${to}`;
      if (part == null) {
        console.log(`[wordgard-devtools] ${at}`, json ? node.toJSON() : node);
        return null;
      }
      const mark = typeof part == "object" ? node.marks[part.mark] : undefined;
      if (typeof part == "object" && !mark) throw new Error(`No mark ${part.mark} on ${at}`);
      const [label, value]: [string, unknown] =
        typeof part == "object"
          ? [`mark ${mark?.name}`, mark]
          : part == "type"
            ? ["type", node.type]
            : part == "path"
              ? ["path", path]
              : part == "range"
                ? ["from–to", { from, to }]
                : part == "param"
                  ? ["param", node.tag.param]
                  : ["text", node.isText ? node.param : null];
      console.log(`[wordgard-devtools] ${at}, ${label}`, value);
      return null;
    },
    logState: ({ id, keys, json }) => {
      const e = entry(id);
      const { state } = e.wg;
      const [first, ...rest] = keys;
      const field =
        first != null && !rest.length && Object.hasOwn(e.fields ?? {}, first)
          ? e.fields?.[first]
          : undefined;
      const asJSON = (): [string, unknown] => [
        `state.toJSON()${accessor(keys)}`,
        keys.reduce<unknown>(childOf, s.stateJSON(e)),
      ];
      const [label, value] = json
        ? asJSON()
        : first == null
          ? ["state", state]
          : first == "selection" && !rest.length
            ? ["state.selection", state.selection]
            : field
              ? [`state.field(${first})`, state.field(field, false)]
              : asJSON();
      console.log(`[wordgard-devtools] ${label}`, value);
      return null;
    },
    setConsole: ({ id, index }) => {
      const e = entry(id);
      globals.set(e.wg, index == null ? null : recorder.transaction(e, index));
      return null;
    },
    repro: ({ id }) => {
      const e = entry(id);
      return repro.reproScript(recorder.transactions(e), { editor: e.name, version: VERSION });
    },
  };
};

const run = <K extends RequestType>(handlers: Handlers, request: Request<K>, client: Client) => {
  if (!Object.hasOwn(handlers, request.type))
    throw new Error(`Unknown request ${String(request.type)}`);
  return handlers[request.type](request, client);
};

export const createAgent = (registry: Registry): Agent => {
  const listeners = new Set<(push: Push) => void>();
  const lastUpdate = new WeakMap<Entry, Wordgard.Update>();
  // Set once a request arrives over postMessage, i.e. a bridge is listening.
  let remote = false;
  let handlers: Promise<Handlers> | null = null;
  let inspector: Inspect.Inspector | null = null;
  let recorder: Log.Recorder | null = null;
  let tracker: Fields.FieldTracker | null = null;
  // Each client's editor: one doesn't detach the other's (the dock and the extension at once).
  const selected: Record<Client, number | null> = { local: null, remote: null };
  const sync = () => {
    for (const e of registry.editors.values()) {
      e.attached = e.id == selected.local || e.id == selected.remote;
      // Nothing records unless a panel shows it: the log pauses, and keeps what it has.
      if (e.recording && !e.attached) recorder?.record(e, false);
      // Each panel watches the fields of the editor it shows.
      for (const client of clients)
        if (selected[client] != e.id && tracker?.watching(e, client))
          tracker.watch(e, client, false);
    }
  };
  const globals = createConsoleGlobals();
  const select = (client: Client, id: number | null) => {
    selected[client] = id;
    sync();
    // The editor this panel shows, else the other panel's.
    const shown = id ?? clients.map((c) => selected[c]).find((other) => other != null) ?? null;
    globals.set([...registry.editors.values()].find((e) => e.id == shown)?.wg ?? null);
  };

  const post = (message: Message) => window.postMessage(message, "*");

  const push = (message: Push) => {
    for (const listener of listeners) {
      try {
        listener(message);
      } catch (e) {
        console.error(e);
      }
    }
    if (remote) post({ source: SOURCE, v: PROTOCOL, kind: "push", push: message });
  };

  // Serialisers load on the first request: pages that never open the panel skip them.
  const loadHandlers = () =>
    (handlers ??= Promise.all([
      import("./serialise.ts"),
      import("./inspect.ts"),
      import("./log.ts"),
      import("./schema.ts"),
      import("./fields.ts"),
      import("./view.ts"),
      import("./decorations.ts"),
      import("./extensions.ts"),
      import("./tags.ts"),
      import("./keymap.ts"),
      import("./repro.ts"),
    ]).then(
      ([s, inspect, log, schema, fields, view, decorations, extensions, tags, keymap, repro]) => {
        inspector = inspect.createInspector(registry, push);
        const logged = log.createRecorder(registry, push);
        recorder = logged;
        tracker = fields.createFieldTracker(registry, logged.indexOf);
        return createHandlers(
          registry,
          s,
          schema,
          view,
          decorations,
          extensions,
          tags,
          keymap,
          repro,
          inspector,
          logged,
          tracker,
          select,
          globals
        );
      },
      (e) => {
        handlers = null;
        throw e;
      }
    ));

  const request = async <K extends RequestType>(
    message: Request<K>,
    client: Client
  ): Promise<Reply<K>> => {
    try {
      const loaded = await loadHandlers();
      // Reads that force a flush are tagged in the log.
      return { ok: true, value: await byAgent(() => run(loaded, message, client)) };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  };

  registry.subscribe(() => {
    recorder?.prune();
    tracker?.prune();
    // A reconnected editor (same instance, same id) is attached again.
    sync();
    push({ type: "editorsChanged" });
  });

  const info = { version: VERSION, protocol: PROTOCOL };
  const announce = () => post({ source: SOURCE, v: PROTOCOL, kind: "announce", agent: info });

  window.addEventListener("message", (event) => {
    if (event.source != window) return;
    const { data } = event;
    if (fromBridge(data, "ping")) announce();
    else if (fromBridge(data, "detach")) {
      remote = false;
      inspector?.stop();
      select("remote", null);
    } else if (isRequest(data)) {
      const { id, v, request: message } = data;
      remote = true;
      const reply: Promise<Reply> =
        v == PROTOCOL
          ? request(message, "remote")
          : Promise.resolve({ ok: false, error: mismatch(PROTOCOL, v) });
      void reply.then((r) => post({ source: SOURCE, v: PROTOCOL, kind: "reply", id, reply: r }));
    }
  });
  // A bridge injected before the agent existed learns about it here.
  announce();

  return {
    version: VERSION,
    protocol: PROTOCOL,
    request: (message) => request(message, "local"),
    onPush: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    updated: (entry, update) => {
      // Two copies of the package on one editor both report the same update.
      if (!entry.attached || lastUpdate.get(entry) == update) return;
      lastUpdate.set(entry, update);
      tracker?.updated(entry, update);
      push({
        type: "stateChanged",
        id: entry.id,
        docChanged: update.docChanged,
        selectionSet: update.selectionSet,
        reconfigured: update.startState.config != update.state.config,
      });
    },
    recorded: (entry, transactions) => recorder?.recorded(entry, transactions),
  };
};
