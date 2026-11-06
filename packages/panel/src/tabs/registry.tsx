// Each tab's component, keyed by tab: a tab missing here fails the typecheck.
import type { ComponentType } from "react";
import type { PanelStore } from "#stores/panel-store.ts";
import { Dom } from "./dom/dom.tsx";
import { Extensions } from "./extensions/extensions.tsx";
import { Fields } from "./fields/fields.tsx";
import { Log } from "./log/log.tsx";
import { Schema } from "./schema/schema.tsx";
import { SelectionTab } from "./selection/selection.tsx";
import { State } from "./state/state.tsx";
import { Structure } from "./structure/structure.tsx";
import type { Tab } from "./tabs.ts";

/** Mounted per editor. */
export type TabProps = { store: PanelStore; editorId: number };

export const TAB_COMPONENTS: Record<Tab, ComponentType<TabProps>> = {
  structure: Structure,
  selection: SelectionTab,
  state: State,
  dom: Dom,
  schema: Schema,
  fields: Fields,
  extensions: Extensions,
  log: Log,
};
