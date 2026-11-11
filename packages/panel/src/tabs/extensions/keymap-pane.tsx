import type { KeymapInfo } from "@stesura/wordgard-dev-tools";
import { useState } from "react";
import { XMarkIcon } from "#icons";
import { GuidePopover } from "#components/guide-popover";
import { IconButton } from "#components/icon-button";
import { LoadError } from "#components/load-error";
import { SearchInput, searchRest, searchStrip } from "#components/search-box";
import { createMenuAnchor } from "#lib/menu-anchor.ts";
import { KEY_BINDINGS } from "../../guides/guides.ts";
import { KeymapMenu, type KeyBindingTarget } from "./keymap-menu.tsx";
import { KeymapView, matchesBinding } from "./keymap-view.tsx";

/** The key bindings, beside the extensions: searchable, closed with its button or Escape. */
export const KeymapPane = ({
  keymap,
  error,
  onRetry,
  onLog,
  onClose,
}: {
  keymap: KeymapInfo | null;
  error: string | null;
  onRetry: () => void;
  onLog: (index: number, shift: boolean) => void;
  onClose: () => void;
}) => {
  const [query, setQuery] = useState("");
  // The row a context menu opens on takes focus (the table's Tab stop).
  const [menu] = useState(() =>
    createMenuAnchor<KeyBindingTarget>(
      "[data-binding]",
      (row) => ({ index: Number(row.getAttribute("data-binding")) }),
      (row) => row.focus()
    )
  );
  const shown = keymap?.bindings.filter((binding) => matchesBinding(binding, query)) ?? [];
  return (
    <aside
      aria-label="Key bindings"
      className="flex h-full min-h-0 flex-col"
      onKeyDown={(event) => {
        // In the pane itself: a popup's Escape (its menu) bubbles here too, through React.
        if (
          event.key == "Escape" &&
          !event.defaultPrevented &&
          event.target instanceof Node &&
          event.currentTarget.contains(event.target)
        ) {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <LoadError what="the key bindings" error={error} onRetry={onRetry} />
      <div className={searchStrip}>
        <h3 className="shrink-0 font-medium">Key bindings</h3>
        <GuidePopover guide={KEY_BINDINGS} label="About the key bindings" align="start" />
        <SearchInput
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            // Escape clears a search first, then closes the pane.
            if (event.key == "Escape" && query) {
              event.preventDefault();
              setQuery("");
            }
          }}
          aria-label="Search the key bindings"
          placeholder="Search keys, commands, descriptions"
        />
        <span className={searchRest}>
          {keymap && (
            <span className="shrink-0 text-muted-foreground" aria-live="polite">
              {shown.length != keymap.bindings.length && `${shown.length} of `}
              {keymap.bindings.length} key binding{keymap.bindings.length == 1 ? "" : "s"}
            </span>
          )}
          <IconButton label="Close the key bindings" onClick={onClose}>
            <XMarkIcon />
          </IconButton>
        </span>
      </div>
      {keymap && <KeymapView keymap={keymap} query={query} menu={menu} />}
      <KeymapMenu
        anchor={menu}
        bindingOf={(index) => keymap?.bindings.find((binding) => binding.index == index) ?? null}
        onLog={onLog}
      />
    </aside>
  );
};
