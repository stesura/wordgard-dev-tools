import type { SchemaInfo } from "@stesura/wordgard-dev-tools";
import { createResource, type ResourceSource } from "#stores/resource.ts";
import type { Transport } from "../../transport.ts";

export type SchemaSource = ResourceSource<SchemaInfo>;

export const createSchemaSource = (transport: Transport, id: number): SchemaSource =>
  createResource(() => transport.send({ type: "schema", id }));
