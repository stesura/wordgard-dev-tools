import type { EntryPart, LogEntryDetail, LogRow } from "@stesura/wordgard-dev-tools";
import { atom, type ReadableAtom } from "nanostores";
import { errorMessage } from "#lib/json.ts";
import { persistent } from "#stores/persistent.ts";
import type { Transport } from "../../transport.ts";

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

const KEPT = 32;

export const createLogSource = (transport: Transport, id: number): LogSource => {
  const settings = {
    selectPointer: recordSetting("selectPointer"),
    focusChanges: recordSetting("focusChanges"),
  };
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
  });
  // The working copy; `state` publishes it.
  let view = empty();
  const state = atom(view);
  let version = 0;
  const set = (patch: Partial<LogView>) => {
    view = { ...view, ...patch };
    state.set(view);
  };

  const details = new Map<string, Promise<EntryDetail>>();

  const load = async (): Promise<void> => {
    const at = ++version;
    // Settled rows are kept; the rest (new, or waiting for their flush) is fetched.
    const from = Math.min(view.pending, view.end);
    try {
      const slice = await transport.send({ type: "log", id, from, to: Number.MAX_SAFE_INTEGER });
      if (at != version) return;
      // A new log (the editor reconnected): start over.
      if (slice.end < view.end) {
        view = { ...empty(), selectPointer: view.selectPointer, focusChanges: view.focusChanges };
        details.clear();
        return load();
      }
      const kept = view.rows.filter((row) => row.index >= slice.start && row.index < from);
      const { start, end, pending, recording, size } = slice;
      set({
        rows: [...kept, ...slice.rows],
        start,
        end,
        pending,
        recording,
        size,
        loaded: true,
        error: null,
      });
    } catch (e) {
      if (at == version) set({ error: errorMessage(e) });
    }
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
    clear: () => act(() => transport.send({ type: "clear", id })),
    logEntry: (index, part) => {
      transport.send({ type: "logEntry", id, index, part }).catch(() => {});
    },
    forget: (index, flush) => {
      details.delete(`${index}|${flush}`);
    },
    detail: (index, flush) => {
      const key = `${index}|${flush}`;
      let found = details.get(key);
      if (!found) {
        found = transport.send({ type: "entry", id, index }).then(
          (entry): EntryDetail => ({ entry }),
          (e): EntryDetail => ({ error: errorMessage(e) })
        );
        details.set(key, found);
        for (const old of details.keys()) {
          if (details.size <= KEPT) break;
          details.delete(old);
        }
      }
      return found;
    },
  };
};
