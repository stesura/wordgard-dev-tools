import { createPromiseCache } from "#lib/promise-cache.ts";
import type { EntryPart, LogEntryDetail, LogRow, LogSlice } from "@stesura/wordgard-dev-tools";
import { atom, type ReadableAtom } from "nanostores";
import { errorMessage } from "#lib/json.ts";
import { persistent } from "#stores/persistent.ts";
import { fire, type Transport } from "../../transport.ts";

export type LogView = {
  rows: LogRow[];
  start: number;
  end: number;
  /** Rows from this index on may still change: refetched on each load. */
  pending: number;
  recording: boolean;
  size: number;
  loaded: boolean;
  error: string | null;
  /** `select.pointer` transactions are recorded: the panel's setting, saved. */
  selectPointer: boolean;
  /** Focus changes (`Wordgard.isFocusChange`) are recorded: the panel's setting, saved. */
  focusChanges: boolean;
  /** Rows carry their flush's decoration summary: the panel's setting, saved, off by default. */
  decorations: boolean;
  /** Rows from this index on leave the editor's current document (`LogSlice.currentFrom`). */
  currentFrom: number | null;
};

/** What the log leaves out, unticked. */
export type RecordSetting = "selectPointer" | "focusChanges";

export type EntryDetail =
  { entry: LogEntryDetail; error?: undefined } | { entry?: undefined; error: string };

export type LogSource = {
  state: ReadableAtom<LogView>;
  /** Fetches the rows appended or changed since the last load. Never rejects. */
  load: () => Promise<void>;
  record: (on: boolean) => Promise<void>;
  /** Whether to record `select.pointer` transactions, or focus changes; applies at once while recording. */
  setSetting: (setting: RecordSetting, on: boolean) => Promise<void>;
  /** Asks for the rows' decoration summaries, or stops; switching on reloads every row. */
  setDecorations: (on: boolean) => Promise<void>;
  /** Asks the page, now, whether the row leaves the editor's current document; reloads when not. */
  isCurrent: (index: number) => Promise<boolean>;
  clear: () => Promise<void>;
  /** A promise per entry and flush (its timing arrives with the flush), cached: for `use()`. */
  detail: (index: number, flush: number | null) => Promise<EntryDetail>;
  /** Logs a transaction, or one of its parts, live in the page's console. */
  logEntry: (index: number, part?: EntryPart) => void;
  /** Drops a cached detail (a failed one, to retry). */
  forget: (index: number, flush: number | null) => void;
};

const SETTING_KEYS: Record<RecordSetting, string> = {
  selectPointer: "wordgard-devtools:log-select-pointer",
  focusChanges: "wordgard-devtools:log-focus-changes",
};

// On unless saved off. Read as the Log mounts: what's saved now.
const recordSetting = (setting: RecordSetting) =>
  persistent(SETTING_KEYS[setting], true, { decode: (text) => text != "false", encode: String });

/** The flushes among the rows, and those whose decorations are worked out. */
export const flushesChecked = (rows: LogRow[]) => {
  const all = new Set<number>();
  const pending = new Set<number>();
  for (const row of rows) {
    if (row.flush == null) continue;
    all.add(row.flush);
    if (row.decorationSummary == "pending") pending.add(row.flush);
  }
  return { checked: all.size - pending.size, flushes: all.size };
};

export const createLogSource = (transport: Transport, id: number): LogSource => {
  const settings = {
    selectPointer: recordSetting("selectPointer"),
    focusChanges: recordSetting("focusChanges"),
  };
  // Off unless saved on: summaries cost the page a call of every source per flush.
  const decorations = persistent("wordgard-devtools:log-decorations", false, {
    decode: (text) => text == "true",
    encode: String,
  });
  const empty = (): LogView => ({
    rows: [],
    start: 0,
    end: 0,
    pending: 0,
    recording: false,
    size: 0,
    loaded: false,
    error: null,
    selectPointer: settings.selectPointer.get(),
    focusChanges: settings.focusChanges.get(),
    decorations: decorations.get(),
    currentFrom: null,
  });
  // The working copy; `state` publishes it.
  let view = empty();
  const state = atom(view);
  let version = 0;
  const set = (patch: Partial<LogView>) => {
    view = { ...view, ...patch };
    state.set(view);
  };

  const details = createPromiseCache<EntryDetail>();

  const load = async (): Promise<void> => {
    const at = ++version;
    // Settled rows are kept; the rest (new, waiting for their flush, or for their decorations) is
    // fetched.
    const waiting = view.decorations
      ? view.rows.find((row) => row.decorationSummary == "pending")?.index
      : undefined;
    const from = Math.min(view.pending, view.end, waiting ?? Infinity);
    const asked = view.decorations;
    let slice: LogSlice;
    try {
      slice = await transport.send({
        type: "log",
        id,
        from,
        to: Number.MAX_SAFE_INTEGER,
        ...(asked && { decorations: true }),
      });
    } catch (e) {
      if (at == version) set({ error: errorMessage(e) });
      return;
    }
    if (at != version) return;
    // A new log (the editor reconnected): start over.
    if (slice.end < view.end) {
      view = {
        ...empty(),
        selectPointer: view.selectPointer,
        focusChanges: view.focusChanges,
        decorations: view.decorations,
      };
      details.clear();
      return load();
    }
    const kept = view.rows.filter((row) => row.index >= slice.start && row.index < from);
    const { start, end, pending, recording, size, currentFrom } = slice;
    set({
      rows: [...kept, ...slice.rows],
      start,
      end,
      pending,
      recording,
      size,
      currentFrom,
      loaded: true,
      error: null,
    });
    // The page works out a limited number of flushes per request: ask for the rest.
    if (asked && view.decorations && slice.rows.some((row) => row.decorationSummary == "pending"))
      return load();
  };

  const act = async (send: () => Promise<unknown>) => {
    try {
      await send();
    } catch (e) {
      set({ error: errorMessage(e) });
      return;
    }
    await load();
  };

  return {
    state,
    load,
    record: (on) =>
      act(() =>
        transport.send({
          type: "record",
          id,
          on,
          selectPointer: view.selectPointer,
          focusChanges: view.focusChanges,
        })
      ),
    setSetting: async (setting, on) => {
      settings[setting].set(on);
      set({ [setting]: on });
      if (view.recording)
        await act(() => transport.send({ type: "record", id, on: true, [setting]: on }));
    },
    setDecorations: async (on) => {
      decorations.set(on);
      // Rows kept from before have no summaries: all of them are fetched again.
      set(on ? { decorations: on, rows: [], pending: 0 } : { decorations: on });
      if (on) await load();
    },
    isCurrent: async (index) => {
      const at = Number.MAX_SAFE_INTEGER;
      const { currentFrom } = await transport.send({ type: "log", id, from: at, to: at });
      const current = currentFrom != null && index >= currentFrom;
      if (!current) await load();
      return current;
    },
    clear: () => act(() => transport.send({ type: "clear", id })),
    logEntry: (index, part) => {
      fire(transport, { type: "logEntry", id, index, part });
    },
    forget: (index, flush) => {
      details.delete(`${index}|${flush}`);
    },
    detail: (index, flush) =>
      details.get(`${index}|${flush}`, () =>
        transport.send({ type: "entry", id, index }).then(
          (entry): EntryDetail => ({ entry }),
          (e): EntryDetail => ({ error: errorMessage(e) })
        )
      ),
  };
};
