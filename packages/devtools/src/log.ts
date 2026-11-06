import type { Wordgard } from "wordgard/editor";
import * as wordgardEditor from "wordgard/editor";
import type { GardState, Transaction } from "wordgard/state";
import * as wordgardState from "wordgard/state";
import type {
  ChangedRange,
  EntryPart,
  FlushDecorations,
  LogEntryDetail,
  LogRow,
  LogSlice,
  NamedValue,
  Push,
} from "./protocol.ts";
import { agentReading } from "./reads.ts";
import type { Entry, Registry } from "./registry.ts";
import { toSafe } from "./serialise.ts";
import { flushDecorations, logFlushDecorations, summaryOf } from "./flushes.ts";

// Loaded with the serialisers, on the first panel request.

export const LOG_SIZE = 500;
/** Flushes whose decorations one `log` request works out; the rest come back "pending". */
export const FLUSHES_PER_REQUEST = 100;

type Item = {
  index: number;
  tr: Transaction;
  dispatchMs: number | null;
  flushMs: number | null;
  flush: number | null;
  agentFlush: boolean;
};

type Log = {
  items: Item[];
  /** Records `select.pointer` transactions. */
  selectPointer: boolean;
  /** Records focus changes (`Wordgard.isFocusChange`). */
  focusChanges: boolean;
  end: number;
  size: number;
  /** Recorded, not drawn yet: the next flush times them. */
  unflushed: Item[];
  /** Recorded during the outermost open `dispatch` call. */
  dispatched: Item[] | null;
  flushes: number;
  timer: Timer | null;
  scheduled: boolean;
  /** Two copies of the package on one editor both deliver each transaction. */
  seen: WeakSet<Transaction>;
  /**
   * Each flush's decoration verdicts, not its sets (too large to keep): worked out once, from its
   * first held row and the row before it, which trimming can change.
   */
  flushVerdicts: Map<number, { first: number; before: number | null; value: FlushDecorations }>;
};

type Timer = {
  /** Stops timing dispatches; the flush wrapper stays until the transactions waiting for it are drawn. */
  pause: () => void;
  resume: () => void;
  /** Restores both now (the editor disconnected). */
  stop: () => void;
};

type Dispatch = Wordgard["dispatch"];
type Flush = Wordgard["flush"];

/**
 * Own-property wrappers on `flush` (on the prototype: the rAF callback and `ensureFlushed` look
 * it up on the instance) and `dispatch` (bound in the constructor; callers that kept the
 * original aren't timed). They pass every argument and the result through, so a Wordgard whose
 * signatures changed still works. Our bookkeeping never throws into the app: an error in it
 * restores the originals, with one warning. The originals' own errors propagate.
 */
const time = (wg: Wordgard, log: Log, changed: () => void): Timer => {
  const saved = {
    flush: Object.getOwnPropertyDescriptor(wg, "flush"),
    dispatch: Object.getOwnPropertyDescriptor(wg, "dispatch"),
  };
  const flush = wg.flush;
  const dispatch = wg.dispatch;
  let active = true;
  let depth = 0;
  const installed = { flush: false, dispatch: false };

  // Someone who wrapped ours keeps their wrapper; ours passes through.
  const restore = (key: "flush" | "dispatch", ours: unknown) => {
    if (!installed[key] || wg[key] != ours) return;
    installed[key] = false;
    const descriptor = saved[key];
    if (descriptor) Object.defineProperty(wg, key, descriptor);
    else Reflect.deleteProperty(wg, key);
  };

  let warned = false;
  const ours = (f: () => void) => {
    try {
      f();
    } catch (e) {
      stop();
      if (!warned) console.warn("Wordgard DevTools stopped timing this editor after an error.", e);
      warned = true;
    }
  };

  const timedFlush: Flush = (...args) => {
    if (!wg.connected || (!active && !log.unflushed.length)) return flush.apply(wg, args);
    // Plain reads and assignments: nothing here can throw before the original runs.
    const drawn = log.unflushed;
    log.unflushed = [];
    const agent = agentReading();
    const start = performance.now();
    let result: ReturnType<Flush>;
    try {
      result = flush.apply(wg, args);
    } catch (e) {
      // Not drawn (react-wordgard refused the update): the next flush draws them.
      log.unflushed = [...drawn, ...log.unflushed];
      throw e;
    }
    const ms = performance.now() - start;
    ours(() => {
      if (drawn.length) {
        const flushNumber = ++log.flushes;
        for (const item of drawn)
          Object.assign(item, { flushMs: ms, flush: flushNumber, agentFlush: agent });
        changed();
      }
      if (!active && !log.unflushed.length) restore("flush", timedFlush);
    });
    return result;
  };

  // Nested dispatches (a transaction listener dispatching) count toward the outermost call.
  const timedDispatch: Dispatch = (...args) => {
    if (!active) return dispatch.apply(wg, args);
    if (depth++ == 0) log.dispatched = [];
    const start = performance.now();
    try {
      return dispatch.apply(wg, args);
    } finally {
      if (--depth == 0) {
        const ms = performance.now() - start;
        ours(() => {
          for (const item of log.dispatched ?? []) item.dispatchMs = ms;
        });
        log.dispatched = null;
      }
    }
  };

  const stop = () => {
    active = false;
    log.unflushed = [];
    log.dispatched = null;
    restore("flush", timedFlush);
    restore("dispatch", timedDispatch);
  };

  const install = () => {
    active = true;
    if (!installed.flush) wg.flush = timedFlush;
    if (!installed.dispatch) wg.dispatch = timedDispatch;
    installed.flush = installed.dispatch = true;
  };
  install();
  return {
    pause: () => {
      active = false;
      log.dispatched = null;
      restore("dispatch", timedDispatch);
      if (!log.unflushed.length || !wg.connected) restore("flush", timedFlush);
    },
    resume: install,
    stop,
  };
};

const annotationNames = new Map<object, string>([
  [wordgardState.Transaction.time, "time"],
  [wordgardState.Transaction.userEvent, "userEvent"],
  [wordgardState.Transaction.addToHistory, "addToHistory"],
  [wordgardState.Transaction.remote, "remote"],
  [wordgardState.Transaction.appended, "appended"],
]);

// The annotation on the transaction Wordgard dispatches when the editor gains or loses focus.
// Checked for: not every Wordgard in the peer range may have it.
const focusChange: object | null =
  "isFocusChange" in wordgardEditor.Wordgard ? wordgardEditor.Wordgard.isFocusChange : null;
if (focusChange) annotationNames.set(focusChange, "focus");

const isFocusChange = (tr: Transaction) =>
  focusChange != null && annotationsOf(tr).some((a) => a.type == focusChange);

// Annotation types carry no name: those that aren't Wordgard's are numbered as first seen, page-wide.
const customNames = new WeakMap<object, string>();
let customCount = 0;
const annotationName = (type: object) => {
  const own = annotationNames.get(type);
  if (own) return own;
  let name = customNames.get(type);
  if (!name) customNames.set(type, (name = `annotation #${++customCount}`));
  return name;
};

// `annotations` is internal to Wordgard (`annotation(type)` is the public reader): counted when present.
const annotationsOf = (tr: Transaction): Transaction.Annotation<unknown>[] =>
  "annotations" in tr && Array.isArray(tr.annotations)
    ? tr.annotations.filter((a) => a instanceof wordgardState.Transaction.Annotation)
    : [];

const effectName = (effect: Transaction.Effect<unknown>) =>
  effect.is(wordgardState.GardState.reconfigure)
    ? "reconfigure"
    : effect.is(wordgardState.GardState.appendConfig)
      ? "appendConfig"
      : "effect";

const row = ({ index, tr, dispatchMs, flushMs, flush, agentFlush }: Item): LogRow => ({
  index,
  time: tr.annotation(wordgardState.Transaction.time) ?? 0,
  userEvent: tr.annotation(wordgardState.Transaction.userEvent) ?? null,
  appended: tr.annotation(wordgardState.Transaction.appended) ?? false,
  docChanged: tr.docChanged,
  selectionSet: tr.selection != null,
  effects: tr.effects.length,
  annotations: annotationsOf(tr).map((a) => annotationName(a.type)),
  dispatchMs,
  flushMs,
  flush,
  agentFlush,
});

const tokens = (doc: GardState["doc"], from: number, to: number) =>
  doc.slice(from, to).map((token) => toSafe(token.toJSON(), 64));

const detail = (item: Item, decorations: FlushDecorations | null): LogEntryDetail => {
  const { tr } = item;
  const before = tr.startState.doc;
  const after = tr.state.doc;
  const ranges: ChangedRange[] = [];
  tr.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
    ranges.push({
      fromA,
      toA,
      fromB,
      toB,
      before: tokens(before, fromA, toA),
      after: tokens(after, fromB, toB),
      beforeText: before.textContent({ from: fromA, to: toA, blockSeparator: "\n" }),
      afterText: after.textContent({ from: fromB, to: toB, blockSeparator: "\n" }),
    });
  });
  return {
    ...row(item),
    changes: tr.changes.toJSON(),
    ranges,
    selection: {
      set: tr.selection ? toSafe(tr.selection.toJSON(tr.state)) : null,
      before: toSafe(tr.startState.selection.toJSON(tr.startState)),
      after: toSafe(tr.newSelection.toJSON(tr.state)),
    },
    effectValues: tr.effects.map((effect): NamedValue => ({
      type: effectName(effect),
      value: toSafe(effect.value),
    })),
    annotationValues: annotationsOf(tr).map((a): NamedValue => ({
      type: annotationName(a.type),
      value: toSafe(a.value),
    })),
    scrollIntoView: tr.scrollIntoView,
    reconfigured: tr.reconfigured,
    decorations,
  };
};

/** A flush's held rows, and the held row before them. */
const flushItems = (log: Log, flush: number) => {
  const at = log.items.findIndex((item) => item.flush == flush);
  if (at < 0) return null;
  const items: Item[] = [];
  for (let i = at; i < log.items.length; i++) {
    const item = log.items[i];
    if (item?.flush == flush) items.push(item);
  }
  return { items, before: log.items[at - 1] ?? null };
};

/** A flush's verdicts, cached; null when the log holds none of its rows. */
const verdictsOf = (log: Log, flush: number) => {
  const found = flushItems(log, flush);
  const first = found?.items[0];
  if (!found || !first) return null;
  const before = found.before?.index ?? null;
  const cached = log.flushVerdicts.get(flush);
  if (cached && cached.first == first.index && cached.before == before) return cached.value;
  const value = flushDecorations(flush, found.items, found.before?.tr ?? null);
  log.flushVerdicts.set(flush, { first: first.index, before, value });
  return value;
};

/** Unset ones are left as they were. */
export type RecordOptions = { size?: number; selectPointer?: boolean; focusChanges?: boolean };

export type Recorder = {
  /** From every copy's transaction listener. */
  recorded: (entry: Entry, transactions: readonly Transaction[]) => void;
  record: (entry: Entry, on: boolean, options?: RecordOptions) => void;
  clear: (entry: Entry) => void;
  /** With `decorations`, rows carry their flush's `decorationSummary`. */
  slice: (entry: Entry, from: number, to: number, decorations?: boolean) => LogSlice;
  detail: (entry: Entry, index: number) => LogEntryDetail;
  /** Logs a transaction, or one of its parts, in the page's console. */
  log: (entry: Entry, index: number, part?: EntryPart) => void;
  /** A transaction's index, while the log holds it. */
  indexOf: (entry: Entry, tr: Transaction) => number | null;
  /** Drops the logs of editors that left the registry (a disconnect), restoring their methods. */
  prune: () => void;
};

export const createRecorder = (registry: Registry, push: (message: Push) => void): Recorder => {
  const logs = new Map<Entry, Log>();

  const logOf = (entry: Entry) => {
    let log = logs.get(entry);
    if (!log) {
      log = {
        items: [],
        selectPointer: true,
        focusChanges: true,
        end: 0,
        size: LOG_SIZE,
        unflushed: [],
        dispatched: null,
        flushes: 0,
        timer: null,
        scheduled: false,
        seen: new WeakSet(),
        flushVerdicts: new Map(),
      };
      logs.set(entry, log);
    }
    return log;
  };

  // One push per task: a dispatch and its appended transactions, or a flush.
  const changed = (entry: Entry, log: Log) => {
    if (log.scheduled || !entry.attached) return;
    log.scheduled = true;
    queueMicrotask(() => {
      log.scheduled = false;
      if (logs.get(entry) == log && entry.attached)
        push({ type: "logChanged", id: entry.id, end: log.end });
    });
  };

  const trim = (log: Log) => {
    if (log.items.length <= log.size) return;
    log.items.splice(0, log.items.length - log.size);
    const oldest = log.items[0]?.flush;
    for (const flush of log.flushVerdicts.keys())
      if (oldest == null || flush < oldest) log.flushVerdicts.delete(flush);
  };

  // With decorations: each row's flush summary, newest flushes worked out first, a limited number
  // per request.
  const rowsOf = (log: Log, from: number, to: number, decorations: boolean) => {
    const items = log.items.filter((item) => item.index >= from && item.index < to);
    if (!decorations) return items.map(row);
    const flushes = [...new Set(items.map((item) => item.flush))].filter((f) => f != null);
    const summaries = new Map<number, LogRow["decorationSummary"]>();
    let budget = FLUSHES_PER_REQUEST;
    for (const flush of flushes.sort((a, b) => b - a)) {
      const known = log.flushVerdicts.has(flush);
      if (!known && budget-- <= 0) {
        summaries.set(flush, "pending");
        continue;
      }
      const verdicts = verdictsOf(log, flush);
      summaries.set(flush, verdicts ? summaryOf(verdicts) : null);
    }
    return items.map((item): LogRow => ({
      ...row(item),
      decorationSummary: item.flush == null ? null : (summaries.get(item.flush) ?? null),
    }));
  };

  const currentFrom = (log: Log, doc: GardState["doc"]) => {
    let found: number | null = null;
    for (let i = log.items.length - 1; i >= 0; i--) {
      const item = log.items[i];
      if (item?.tr.state.doc !== doc) break;
      found = item.index;
    }
    return found;
  };

  const held = (entry: Entry, index: number) => {
    const item = logs.get(entry)?.items.find((i) => i.index == index);
    if (!item) throw new Error(`Transaction ${index} is no longer in the log`);
    return item;
  };

  return {
    recorded: (entry, transactions) => {
      if (!entry.recording) return;
      const log = logOf(entry);
      for (const tr of transactions) {
        if (log.seen.has(tr)) continue;
        log.seen.add(tr);
        if (!log.selectPointer && tr.isUserEvent("select.pointer")) continue;
        if (!log.focusChanges && isFocusChange(tr)) continue;
        const item: Item = {
          index: log.end++,
          tr,
          dispatchMs: null,
          flushMs: null,
          flush: null,
          agentFlush: false,
        };
        log.items.push(item);
        // Limitation: a flush forced earlier in this dispatch (a listener ordered before ours reading
        // layout) already drew it; it is credited to the next flush.
        log.unflushed.push(item);
        log.dispatched?.push(item);
      }
      trim(log);
      changed(entry, log);
    },
    record: (entry, on, { size, selectPointer, focusChanges } = {}) => {
      const log = logOf(entry);
      if (selectPointer != null) log.selectPointer = selectPointer;
      if (focusChanges != null) log.focusChanges = focusChanges;
      if (size != null) {
        if (!Number.isInteger(size) || size < 1) throw new Error(`Invalid log size ${size}`);
        log.size = size;
        trim(log);
      }
      entry.recording = on;
      if (!on) log.timer?.pause();
      else if (log.timer) log.timer.resume();
      else log.timer = time(entry.wg, log, () => changed(entry, log));
      changed(entry, log);
    },
    clear: (entry) => {
      const log = logs.get(entry);
      if (!log) return;
      log.items = [];
      log.unflushed = [];
      log.flushVerdicts.clear();
      changed(entry, log);
    },
    slice: (entry, from, to, decorations = false) => {
      const log = logs.get(entry);
      if (!log)
        return {
          start: 0,
          end: 0,
          pending: 0,
          recording: entry.recording,
          size: LOG_SIZE,
          rows: [],
          currentFrom: null,
        };
      return {
        start: log.items[0]?.index ?? log.end,
        end: log.end,
        pending: log.unflushed[0]?.index ?? log.end,
        recording: entry.recording,
        size: log.size,
        rows: rowsOf(log, from, to, decorations),
        currentFrom: currentFrom(log, entry.wg.state.doc),
      };
    },
    detail: (entry, index) => {
      const item = held(entry, index);
      const log = logs.get(entry);
      return detail(item, log && item.flush != null ? verdictsOf(log, item.flush) : null);
    },
    log: (entry, index, part = "transaction") => {
      const { tr, flush } = held(entry, index);
      if (part == "decorations") {
        const log = logs.get(entry);
        const found = log && flush != null ? flushItems(log, flush) : null;
        if (flush == null || !found) throw new Error(`Transaction ${index} isn't drawn yet`);
        logFlushDecorations(flush, found.items);
        return;
      }
      const value =
        part == "changes"
          ? tr.changes
          : part == "selection"
            ? { set: tr.selection, before: tr.startState.selection, after: tr.newSelection }
            : part == "effects"
              ? tr.effects
              : part == "annotations"
                ? annotationsOf(tr)
                : tr;
      console.log(
        `[wordgard-devtools] transaction #${index}${part == "transaction" ? "" : `, ${part}`}`,
        value
      );
    },
    indexOf: (entry, tr) => logs.get(entry)?.items.find((item) => item.tr == tr)?.index ?? null,
    prune: () => {
      for (const [entry, log] of logs) {
        if (registry.editors.get(entry.wg) == entry) continue;
        log.timer?.stop();
        logs.delete(entry);
        entry.recording = false;
      }
    },
  };
};
