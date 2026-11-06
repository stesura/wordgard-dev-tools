import { useStore } from "@nanostores/react";
import { ClipboardDocumentIcon, CodeBracketIcon, CommandLineIcon, EyeIcon } from "#icons";
import type { SchemaInfo } from "@stesura/wordgard-dev-tools";
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
import { json } from "#lib/json.ts";
import { type Log, jsonOf } from "./spec-pane.tsx";

export type MenuTarget = { card: string };

/** A card's context menu: show, log and copy its JSON. */
export const SchemaMenu = ({
  schema,
  anchor,
  paneOpen,
  onShow,
  onLog,
}: {
  schema: SchemaInfo | null;
  anchor: MenuAnchor<MenuTarget>;
  paneOpen: boolean;
  onShow: (card: string) => void;
  onLog: Log;
}) => {
  const { target: opened, setTrigger } = anchor;
  const target = useStore(opened);
  const card = jsonOf(schema, target?.card ?? null);
  return (
    <ContextMenu>
      <ContextMenuTrigger className="hidden">
        <span ref={setTrigger} />
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <CopySelection text={target?.selection} />
        {/* With the pane open, the menu's card is already in it (opening the menu selects it). */}
        {!paneOpen && (
          <ContextMenuItem
            className="text-xs"
            disabled={!card}
            onClick={() => target && onShow(target.card)}
          >
            <EyeIcon /> Show JSON
          </ContextMenuItem>
        )}
        {card?.kind != "group" && (
          <ContextMenuItem
            className="text-xs"
            disabled={!card}
            onClick={() => card && onLog(card.kind, card.name, false)}
          >
            <CommandLineIcon /> Log to console
          </ContextMenuItem>
        )}
        <ContextMenuItem
          className="text-xs"
          disabled={!card}
          onClick={() => card && onLog(card.kind, card.name, true)}
        >
          <CodeBracketIcon /> Log JSON
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          className="text-xs"
          disabled={!card}
          onClick={() => card && void copy(json(card.value))}
        >
          <ClipboardDocumentIcon /> Copy JSON
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};
