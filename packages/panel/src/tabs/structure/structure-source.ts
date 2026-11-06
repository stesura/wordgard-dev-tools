import type { StructureNode } from "@stesura/wordgard-dev-tools";
import { createDetailCache, type DetailSource } from "#lib/detail-cache.ts";
import { createResource, type ResourceSource } from "#stores/resource.ts";
import type { Transport } from "../../transport.ts";

/** The whole document, and the node pane's details, per version. */
export type StructureSource = ResourceSource<StructureNode> & Pick<DetailSource, "detail">;

export const createStructureSource = (transport: Transport, id: number): StructureSource => ({
  ...createResource(() => transport.send({ type: "structure", id })),
  detail: createDetailCache(transport, id),
});
