import type { Path, ViewInfo } from "@stesura/wordgard-dev-tools";
import { createResource, type ResourceSource } from "#stores/resource.ts";
import { fire, type Transport } from "../../transport.ts";

export type DomSource = ResourceSource<ViewInfo> & {
  /** An action on a line's element in the page. The element may have changed since the last load: on failure it loads again. */
  element: (path: Path, action: "outline" | "log" | "logHTML") => Promise<void>;
  /** Removes the outline an `element(…, "outline")` left in the page, if any. */
  hideOutline: () => void;
};

export const createDomSource = (transport: Transport, id: number): DomSource => {
  const resource = createResource(() => transport.send({ type: "view", id }));
  let outlined = false;
  return {
    ...resource,
    element: async (path, action) => {
      if (action == "outline") outlined = true;
      await transport.send({ type: "viewElement", id, path, action }).then(() => {}, resource.load);
    },
    hideOutline: () => {
      if (!outlined) return;
      outlined = false;
      fire(transport, { type: "highlight", id, path: null });
    },
  };
};
