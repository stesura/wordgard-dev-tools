import type { Notice } from "#components/notice-bar";
import { copy } from "#lib/clipboard.ts";
import { errorMessage } from "#lib/json.ts";
import type { LogSource } from "./log-source.ts";

// Outside the component: the React Compiler can't compile conditionals inside a try/catch yet.
/** Copies the page's repro script for the log, and says how that went. */
export const copyRepro = async (source: LogSource, notify: (notice: Notice) => void) => {
  try {
    await copy(await source.repro());
  } catch (e) {
    notify({ ok: false, text: `Couldn't copy a repro: ${errorMessage(e)}` });
    return;
  }
  notify({
    ok: true,
    text: "Copied a Node script replaying the log on plain Wordgard. Its header says what it leaves out.",
  });
};
