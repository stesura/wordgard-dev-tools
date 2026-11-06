// The panel's tabs, in order. Plain data with no imports: Node scripts read it (the README, the
// screenshots), and any layer may import it.
export type Tab =
  "structure" | "selection" | "state" | "dom" | "schema" | "fields" | "extensions" | "log";

export const TABS: readonly { id: Tab; label: string }[] = [
  { id: "structure", label: "Structure" },
  { id: "selection", label: "Selection" },
  { id: "state", label: "State" },
  { id: "dom", label: "DOM" },
  { id: "schema", label: "Schema" },
  { id: "fields", label: "Fields" },
  { id: "extensions", label: "Extensions" },
  { id: "log", label: "Log" },
];

export const isTab = (value: unknown): value is Tab => TABS.some((tab) => tab.id == value);
