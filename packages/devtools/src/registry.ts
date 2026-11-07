import type { Wordgard } from "wordgard/editor";
import type { GardState, Transaction } from "wordgard/state";
import { createAgent } from "./agent.ts";
import type { Push, Reply, Request, RequestType } from "./protocol.ts";

// The registry is the contract between copies of this package on one page
// (the app's and react-wordgard's may differ): duck-typed, versioned on its own.
export const REGISTRY_VERSION = 1;

/** State fields by name, for the Fields tab (the shape `GardState.toJSON` takes). */
export type NamedFields = { [name: string]: GardState.Field<unknown> };

/** Names for the Extensions tab, by identity: a facet, a compartment, a field or any extension. */
export type NamedExtensions = {
  [name: string]:
    | GardState.Extension
    | GardState.Facet<never, unknown>
    | GardState.Compartment
    | GardState.Field.Derived<unknown>;
};

export type Entry = {
  readonly id: number;
  name: string;
  readonly wg: Wordgard;
  /** The panel is connected and shows this editor: updates are pushed. */
  attached: boolean;
  /** The transaction log records this editor. */
  recording: boolean;
  /** Named by the plugins' options; optional for registries made by older copies. */
  fields?: NamedFields;
  names?: NamedExtensions;
};

export type Agent = {
  readonly version: string;
  readonly protocol: number;
  request: <K extends RequestType>(request: Request<K>) => Promise<Reply<K>>;
  onPush: (listener: (push: Push) => void) => () => void;
  /** From every copy's update listener, for attached editors. */
  updated: (entry: Entry, update: Wordgard.Update) => void;
  /** From every copy's transaction listener, for recording editors. */
  recorded: (entry: Entry, transactions: readonly Transaction[]) => void;
};

export type Registry = {
  readonly registryVersion: number;
  readonly editors: ReadonlyMap<Wordgard, Entry>;
  /** Adds the editor, or renames it when known, adding names. Counted: one per connected plugin. */
  register: (wg: Wordgard, name?: string, fields?: NamedFields, names?: NamedExtensions) => Entry;
  /** Removes the editor once no plugin holds it, or when it is disconnected. */
  unregister: (wg: Wordgard) => void;
  subscribe: (listener: () => void) => () => void;
  /** Installed by the copy that created the registry. */
  agent: Agent | null;
};

declare global {
  interface Window {
    __WORDGARD_DEVTOOLS__?: Registry;
  }
}

const defaultName = (wg: Wordgard, id: number) =>
  wg.contentDOM.getAttribute("aria-label") || wg.dom.getAttribute("aria-label") || `editor #${id}`;

const createRegistry = (): Registry => {
  const editors = new Map<Wordgard, Entry>();
  const holds = new Map<Wordgard, number>();
  const ids = new WeakMap<Wordgard, number>();
  const listeners = new Set<() => void>();
  let nextId = 1;
  const changed = () => {
    for (const listener of listeners) {
      try {
        listener();
      } catch (e) {
        console.error(e);
      }
    }
  };
  return {
    registryVersion: REGISTRY_VERSION,
    editors,
    register: (wg, name, fields, names) => {
      holds.set(wg, (holds.get(wg) ?? 0) + 1);
      const known = editors.get(wg);
      if (known) {
        const named =
          fields && Object.entries(fields).some(([key, field]) => known.fields?.[key] != field);
        if (named) known.fields = { ...known.fields, ...fields };
        const labelled =
          names && Object.entries(names).some(([key, value]) => known.names?.[key] != value);
        if (labelled) known.names = { ...known.names, ...names };
        const renamed = Boolean(name) && name != known.name;
        if (name && renamed) known.name = name;
        // The panel reloads its editors, and with them the field names.
        if (named || labelled || renamed) changed();
        return known;
      }
      // Stable across reconnects of the same instance.
      const id = ids.get(wg) ?? nextId++;
      ids.set(wg, id);
      const entry: Entry = {
        id,
        name: name || defaultName(wg, id),
        wg,
        attached: false,
        recording: false,
        fields,
        names,
      };
      editors.set(wg, entry);
      changed();
      return entry;
    },
    unregister: (wg) => {
      const left = (holds.get(wg) ?? 0) - 1;
      if (left > 0 && wg.connected) {
        holds.set(wg, left);
        return;
      }
      holds.delete(wg);
      if (editors.delete(wg)) changed();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    agent: null,
  };
};

let warned = false;

/** The page's registry, if it is one this copy understands. */
export const currentRegistry = (): Registry | null => {
  const registry = window.__WORDGARD_DEVTOOLS__;
  if (!registry) return null;
  if (registry.registryVersion == REGISTRY_VERSION) return registry;
  if (!warned) {
    warned = true;
    console.warn(
      `wordgard-devtools: the page's registry is version ${registry.registryVersion}, this copy needs ${REGISTRY_VERSION}. Its editors won't show in the panel.`
    );
  }
  return null;
};

/** The page's registry, created with its agent when there is none yet. */
export const ensureRegistry = (): Registry | null => {
  if (window.__WORDGARD_DEVTOOLS__) return currentRegistry();
  const registry = createRegistry();
  window.__WORDGARD_DEVTOOLS__ = registry;
  registry.agent = createAgent(registry);
  return registry;
};
