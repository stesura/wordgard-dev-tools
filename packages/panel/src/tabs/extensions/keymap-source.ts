import type { KeymapInfo } from "@stesura/wordgard-dev-tools";
import { createResource, type ResourceSource } from "#stores/resource.ts";
import type { Transport } from "../../transport.ts";

export type KeymapSource = ResourceSource<KeymapInfo>;

export const createKeymapSource = (transport: Transport, id: number): KeymapSource =>
  createResource(() => transport.send({ type: "keymap", id }));
