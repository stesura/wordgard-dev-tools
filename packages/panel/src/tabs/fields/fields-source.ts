import { createPromiseCache } from "#lib/promise-cache.ts";
import type { FieldChangeDetail, FieldDetail, FieldsInfo } from "@stesura/wordgard-dev-tools";
import { createResource, type ResourceSource } from "#stores/resource.ts";
import { errorMessage } from "#lib/json.ts";
import { fire, type Transport } from "../../transport.ts";

export type FieldResult =
  { field: FieldDetail; error?: undefined } | { field?: undefined; error: string };
export type ChangeResult =
  { detail: FieldChangeDetail; error?: undefined } | { detail?: undefined; error: string };

/** The fields; a field's detail is cached per load (`version`). */
export type FieldsSource = ResourceSource<FieldsInfo> & {
  /** A promise per (version, field), cached: for `use()`. */
  detail: (index: number, version: number) => Promise<FieldResult>;
  /** The value a change in a field's history set (for a set, what it added and dropped): a promise per change, cached (it never changes). */
  /** `version`: the load it's shown at; its links are fetched again for each (they follow the document). */
  change: (index: number, seq: number, version?: number) => Promise<ChangeResult>;
  /** Logs it in the page's console. */
  logChange: (index: number, seq: number) => void;
  /** Logs a field's whole history in the page's console. */
  logHistory: (index: number) => void;
  /** Logs a field's live value in the page's console. */
  logValue: (index: number) => void;
};

export const createFieldsSource = (transport: Transport, id: number): FieldsSource => {
  const details = createPromiseCache<FieldResult>();
  const changes = createPromiseCache<ChangeResult>();

  return {
    ...createResource(() => transport.send({ type: "fields", id })),
    detail: (index, at) =>
      details.get(`${at}|${index}`, () =>
        transport.send({ type: "field", id, index }).then(
          (field): FieldResult => ({ field }),
          (e): FieldResult => ({ error: errorMessage(e) })
        )
      ),
    change: (index, seq, version) =>
      changes.get(`${index}|${seq}|${version ?? ""}`, () =>
        transport.send({ type: "fieldChange", id, index, seq }).then(
          (detail): ChangeResult => ({ detail }),
          (e): ChangeResult => ({ error: errorMessage(e) })
        )
      ),
    logChange: (index, seq) => {
      fire(transport, { type: "logField", id, index, seq });
    },
    logHistory: (index) => {
      fire(transport, { type: "logField", id, index, history: true });
    },
    logValue: (index) => {
      fire(transport, { type: "logField", id, index });
    },
  };
};
