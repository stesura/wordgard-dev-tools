import { ClipboardDocumentIcon } from "#icons";
import { useState, type MouseEvent } from "react";
import { ContextMenuItem, ContextMenuSeparator } from "./ui/context-menu.tsx";
import { copy } from "#lib/clipboard.ts";
import { selectedText } from "#lib/selected-text.ts";

/** A menu's first item while text is selected in its view: copies it, as the browser's own menu would. */
export const CopySelection = ({ text }: { text: string | null | undefined }) =>
  text ? (
    <>
      <ContextMenuItem onClick={() => void copy(text)}>
        <ClipboardDocumentIcon /> Copy
      </ContextMenuItem>
      <ContextMenuSeparator />
    </>
  ) : null;

/** For a menu on its own trigger: the selection read as it opens, by the trigger's `onContextMenu`. */
export const useMenuSelection = () => {
  const [selection, setSelection] = useState<string | null>(null);
  const onContextMenu = (event: MouseEvent<Element>) =>
    setSelection(selectedText(event.currentTarget));
  return { selection, onContextMenu };
};
