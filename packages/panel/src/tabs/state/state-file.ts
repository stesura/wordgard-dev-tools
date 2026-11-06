import type { PanelStore } from "#stores/panel-store.ts";

/** A file name from the editor's: letters, digits, dashes. */
export const fileName = (editor: string) =>
  `wordgard-state-${editor.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "editor"}.json`;

/** Saves the JSON as a file, through a link. */
export const download = (json: unknown, name: string) => {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(json, null, 2)], { type: "application/json" })
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  // After the click has started the download.
  setTimeout(() => URL.revokeObjectURL(url));
};

export type Notice = { ok: boolean; text: string; closing?: boolean };

// The banner's close: its height eases to nothing, then it unmounts.
export const SHOWN_MS = 5000;
export const CLOSING_MS = 300;

// Outside the component: the React Compiler can't compile conditionals inside a try/catch yet.
export const replaceFrom = async (
  store: PanelStore,
  editorId: number,
  file: File,
  notify: (notice: Notice) => void
) => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch (e) {
    notify({
      ok: false,
      text: `${file.name} isn't JSON: ${e instanceof Error ? e.message : String(e)}`,
    });
    return;
  }
  try {
    const { exact } = await store.transport.send({
      type: "replaceState",
      id: editorId,
      json: parsed,
    });
    notify({
      ok: true,
      text: `State replaced from ${file.name}${exact ? "" : ", then changed by the editor (an appender or a filter)"}. Undo reverts it.`,
    });
  } catch (e) {
    notify({
      ok: false,
      text: `Couldn't replace the state: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
};
