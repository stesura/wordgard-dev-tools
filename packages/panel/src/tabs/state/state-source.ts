import { createResource, type ResourceSource } from "#stores/resource.ts";
import type { Transport } from "../../transport.ts";

/** The editor's state as JSON (`GardState.toJSON`). */
export type StateSource = ResourceSource<unknown>;

export const createStateSource = (transport: Transport, id: number): StateSource =>
  createResource(() => transport.send({ type: "stateJSON", id }));
