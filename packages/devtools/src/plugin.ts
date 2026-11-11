import type { Wordgard } from "wordgard/editor";
import * as wordgardEditor from "wordgard/editor";
import type { GardState, Transaction } from "wordgard/state";
import { isProduction } from "./production.ts";
import {
  currentRegistry,
  ensureRegistry,
  type NamedExtensions,
  type NamedFields,
} from "./registry.ts";
import { VERSION } from "./version.ts";

export type DevtoolsOptions = {
  /** Shown in the panel's editor picker. Defaults to the editor's `aria-label`, then `editor #n`. */
  name?: string;
  /**
   * Names for the editor's state fields: in the Fields tab, and as their keys in the State tab's
   * JSON. Without one, a field shows by its debug name (`Field.define({name})`), else "field #n".
   */
  fields?: NamedFields;
  /**
   * Names for the Extensions tab, by identity: a facet (each of its values), a compartment, a field
   * (in the Fields tab too) or any extension. They override debug names; unnamed ones show by
   * their debug name (`Facet.define({name})`, `Compartment.define(name)`…), class name, or numbered.
   */
  names?: NamedExtensions;
  /**
   * Whether to register the editor. Defaults to off in production builds and on otherwise. Pass it
   * where `process.env.NODE_ENV` isn't set (no bundler), or to keep the devtools in production.
   */
  enabled?: boolean;
};

// The devtools never break the app's editor: the first error from their code in it (most likely
// a Wordgard version they don't support yet) turns them off for the page, with one warning.
// Wordgard doesn't catch errors from transaction listeners, so they'd reach the app's dispatch.
let failed = false;

// This copy's holds on the registry: one per connected plugin.
const held = new Map<Wordgard, number>();

const release = (wg: Wordgard) => {
  const count = held.get(wg);
  if (!count) return;
  if (count > 1) held.set(wg, count - 1);
  else held.delete(wg);
  currentRegistry()?.unregister(wg);
};

const fail = (error: unknown) => {
  if (failed) return;
  failed = true;
  console.warn(
    `Wordgard DevTools ${VERSION} turned itself off after an error. If you've just upgraded wordgard, this version may not support it yet.`,
    error
  );
  // Its editors leave the panel: nothing reports their updates anymore.
  try {
    for (const [wg, count] of [...held]) for (let i = 0; i < count; i++) release(wg);
  } catch {
    held.clear();
  }
};

const guard =
  <A extends unknown[]>(f: (...args: A) => void) =>
  (...args: A) => {
    if (failed) return;
    try {
      f(...args);
    } catch (e) {
      fail(e);
    }
  };

// Shared by every plugin of this copy, so the facets dedupe them when an editor has two. Built
// on first use, not on import, so a Wordgard API change can't make importing this module throw.
let listeners: GardState.Extension | null = null;
const sharedListeners = () =>
  (listeners ??= [
    wordgardEditor.Wordgard.updateListener.of(
      guard((update: Wordgard.Update) => {
        const registry = currentRegistry();
        const entry = registry?.editors.get(update.editor);
        if (entry?.attached) registry?.agent?.updated(entry, update);
      })
    ),
    wordgardEditor.Wordgard.transactionListener.of(
      guard((transactions: readonly Transaction[], wg: Wordgard) => {
        const registry = currentRegistry();
        const entry = registry?.editors.get(wg);
        if (entry?.recording) registry?.agent?.recorded(entry, transactions);
      })
    ),
  ]);

/** Registers the editor with Wordgard DevTools while it is connected. */
export const wordgardDevtools = (options: DevtoolsOptions = {}): GardState.Extension => {
  if (failed || !(options.enabled ?? !isProduction())) return [];
  const register = guard((wg: Wordgard) => {
    if (!ensureRegistry()?.register(wg, options.name, options.fields, options.names)) return;
    held.set(wg, (held.get(wg) ?? 0) + 1);
  });
  const unregister = guard(release);
  try {
    const provided = sharedListeners();
    return wordgardEditor.Wordgard.Plugin.define(
      (wg) => {
        // Added by a reconfigure while connected: Wordgard calls `connect` before creating the
        // value, so `connect` never runs for this instance.
        if (wg.connected) register(wg);
        return { connect: register, disconnect: unregister };
      },
      () => provided
    );
  } catch (e) {
    fail(e);
    return [];
  }
};
