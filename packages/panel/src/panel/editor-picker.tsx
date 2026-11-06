import { useStore } from "@nanostores/react";
import type { EditorInfo } from "@stesura/wordgard-dev-tools";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#components/ui/select";
import type { PanelStore } from "#stores/panel-store.ts";

const editorLabel = (editor: EditorInfo) =>
  `${editor.name} · #${editor.id}` + (editor.frame ? ` · ${editor.frame}` : "");

export const EditorPicker = ({ store }: { store: PanelStore }) => {
  const { editors, selected, paused } = useStore(store.state);
  const items = editors.map((editor) => ({ value: editor.id, label: editorLabel(editor) }));
  return (
    <Select
      items={items}
      value={selected}
      // Base UI also reports changes it makes itself ("none": the selected editor left the list,
      // or the value prop moved): only the user's picks count.
      onValueChange={(id, details) => {
        if (id != null && details.reason != "none") void store.select(id);
      }}
      disabled={!editors.length || paused}
    >
      <SelectTrigger size="sm" aria-label="Editor" className="min-w-40">
        <SelectValue placeholder="No editors" />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} align="start">
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
