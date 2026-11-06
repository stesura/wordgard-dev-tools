import type { Path, ViewInfo } from "@stesura/wordgard-dev-tools";
import { errorMessage } from "#stores/panel-store.ts";
import type { Transport } from "../../transport.ts";

export type ViewState = { info: ViewInfo | null; error: string | null };

export type ViewSource = {
  get: () => ViewState;
  subscribe: (listener: () => void) => () => void;
  /** Replies to an older load are dropped. Never rejects. */
  load: () => Promise<void>;
  /** An action on a line's element in the page. The element may have changed since the last load: on failure it loads again. */
  element: (path: Path, action: "outline" | "log" | "logHTML") => Promise<void>;
  /** Removes the outline an `element(…, "outline")` left in the page, if any. */
  hideOutline: () => void;
};

export const createViewSource = (transport: Transport, id: number): ViewSource => {
  let state: ViewState = { info: null, error: null };
  let version = 0;
  const listeners = new Set<() => void>();
  let outlined = false;
  const load = async () => {
    const at = ++version;
    try {
      const info = await transport.send({ type: "view", id });
      if (at != version) return;
      state = { info, error: null };
    } catch (e) {
      if (at != version) return;
      // The last view stays up, with the error.
      state = { ...state, error: errorMessage(e) };
    }
    for (const listener of listeners) listener();
  };
  return {
    get: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    load,
    element: async (path, action) => {
      if (action == "outline") outlined = true;
      await transport.send({ type: "viewElement", id, path, action }).then(() => {}, load);
    },
    hideOutline: () => {
      if (!outlined) return;
      outlined = false;
      transport.send({ type: "highlight", id, path: null }).catch(() => {});
    },
  };
};
