import type { KeyBindingInfo } from "@stesura/wordgard-dev-tools";
import { useStore } from "@nanostores/react";
import { ClipboardDocumentIcon, CodeBracketIcon, CommandLineIcon } from "#icons";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "#components/ui/context-menu";
import { CopySelection } from "#components/copy-selection";
import { copy } from "#lib/clipboard.ts";
import type { MenuAnchor } from "#lib/menu-anchor.ts";
import { keyLabel } from "./keymap-view.tsx";

export type KeyBindingTarget = { index: number };

const commandText = (name: string, param: string | null) =>
  param == null ? name : `${name}(${param})`;

/** A key binding's context menu: log its commands, copy its parts. */
export const KeymapMenu = ({
  anchor,
  bindingOf,
  onLog,
}: {
  anchor: MenuAnchor<KeyBindingTarget>;
  bindingOf: (index: number) => KeyBindingInfo | null;
  onLog: (index: number, shift: boolean) => void;
}) => {
  const { target: opened, setTrigger } = anchor;
  const target = useStore(opened);
  const binding = target ? bindingOf(target.index) : null;
  const key = binding ? keyLabel(binding) : "";
  return (
    <ContextMenu>
      <ContextMenuTrigger className="hidden">
        <span ref={setTrigger} />
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52" finalFocus={() => opened.get()?.row ?? true}>
        <CopySelection text={target?.selection} />
        {binding && (binding.command != null || binding.any) && (
          <ContextMenuItem onClick={() => onLog(binding.index, false)}>
            <CommandLineIcon /> Log {key}&apos;s command
          </ContextMenuItem>
        )}
        {binding?.shift != null && (
          <ContextMenuItem onClick={() => onLog(binding.index, true)}>
            <CommandLineIcon /> Log Shift-{key}&apos;s command
          </ContextMenuItem>
        )}
        {binding && (binding.command != null || binding.any || binding.shift != null) && (
          <ContextMenuSeparator />
        )}
        <ContextMenuItem onClick={() => void copy(key)}>
          <ClipboardDocumentIcon /> Copy key
        </ContextMenuItem>
        {binding?.command != null && (
          <ContextMenuItem
            onClick={() =>
              binding.command != null && void copy(commandText(binding.command, binding.param))
            }
          >
            <ClipboardDocumentIcon /> Copy command
          </ContextMenuItem>
        )}
        <ContextMenuItem onClick={() => binding && void copy(JSON.stringify(binding, null, 2))}>
          <CodeBracketIcon /> Copy as JSON
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};
