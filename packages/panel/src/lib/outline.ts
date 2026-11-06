import type { Path } from "@stesura/wordgard-dev-tools";
import { fire, type Transport } from "../transport.ts";

/** A tab's outline of a node in the page: `hide` removes it only if this tab drew one. */
export const createOutline = (transport: Transport, id: number) => {
  let shown = false;
  return {
    show: (path: Path) => {
      shown = true;
      fire(transport, { type: "highlight", id, path });
    },
    hide: () => {
      if (!shown) return;
      shown = false;
      fire(transport, { type: "highlight", id, path: null });
    },
  };
};
