import type { KeyBindingInfo, KeymapInfo } from "@stesura/wordgard-dev-tools";
import { useState, type KeyboardEvent } from "react";
import { SortHeading, type SortBy } from "#components/sort-heading";
import type { MenuAnchor } from "#lib/menu-anchor.ts";
import { Tag } from "#components/ui/badge";
import { cn } from "cn";

const PLATFORM: Record<KeymapInfo["platform"], string> = {
  mac: "macOS",
  win: "Windows",
  linux: "Linux",
  other: "this platform",
};

/** The key as this platform reads it: a key combination, a character, or any key. */
export const keyLabel = (binding: KeyBindingInfo) =>
  binding.platformKey ??
  (binding.char != null ? `"${binding.char}"` : binding.any ? "any key" : "none");

/** A binding matches a search by its key, commands, descriptions or group. */
export const matchesBinding = (binding: KeyBindingInfo, query: string) => {
  const needle = query.trim().toLowerCase();
  return (
    !needle ||
    [
      keyLabel(binding),
      binding.key,
      binding.command,
      binding.shift,
      binding.description,
      binding.shiftDescription,
      binding.group,
    ].some((text) => text?.toLowerCase().includes(needle))
  );
};

const Command = ({ name, param }: { name: string | null; param: string | null }) =>
  name == null ? (
    <span className="text-muted-foreground">–</span>
  ) : (
    <>
      {name}
      {param != null && <span className="text-muted-foreground">({param})</span>}
    </>
  );

type SortKey = "index" | "key" | "command";

const sortValue: Record<SortKey, (binding: KeyBindingInfo) => string | null> = {
  index: () => null,
  key: keyLabel,
  command: (binding) => binding.command,
};

/** By key or command, those without a command last either way; ties in the keymap's order. */
export const sortBindings = (bindings: KeyBindingInfo[], { key, descending }: SortBy<SortKey>) =>
  key == "index"
    ? descending
      ? bindings.toReversed()
      : bindings
    : bindings.toSorted((a, b) => {
        const x = sortValue[key](a);
        const y = sortValue[key](b);
        if (x == null || y == null) return x == y ? a.index - b.index : x == null ? 1 : -1;
        return (descending ? y.localeCompare(x) : x.localeCompare(y)) || a.index - b.index;
      });

/** The key bindings Wordgard's keymap holds, sortable; the keymap's order first. */
export const KeymapView = ({
  keymap,
  query,
  menu,
}: {
  keymap: KeymapInfo;
  query: string;
  /** The rows' context menu: a right-click, Shift+F10, or Enter on a row. */
  menu: Pick<MenuAnchor<object>, "onContextMenu" | "onKeyDown" | "openOn">;
}) => {
  const [sort, setSort] = useState<SortBy<SortKey>>({ key: "index", descending: false });
  const shown = sortBindings(
    keymap.bindings.filter((binding) => matchesBinding(binding, query)),
    sort
  );
  const cell = "px-2 py-0.5 text-left align-top";
  // The row clicked or moved to: selected, and the rows' one Tab stop (else the first).
  const [active, setActive] = useState<number | null>(null);
  const stop = shown.some((b) => b.index == active) ? active : (shown[0]?.index ?? null);
  const onKeyDown = (event: KeyboardEvent<HTMLTableSectionElement>) => {
    menu.onKeyDown(event);
    if (event.defaultPrevented) return;
    const rows = [...event.currentTarget.querySelectorAll("tr")];
    const at = rows.findIndex((row) => event.target instanceof Node && row.contains(event.target));
    const current = rows[at];
    if (event.key == "Enter" && current) {
      event.preventDefault();
      menu.openOn(event.currentTarget, current);
      return;
    }
    const moves: Partial<Record<string, number>> = {
      ArrowDown: at + 1,
      ArrowUp: at - 1,
      Home: 0,
      End: rows.length - 1,
    };
    const target = moves[event.key];
    const row = target == null ? undefined : rows[Math.max(0, Math.min(rows.length - 1, target))];
    if (!row) return;
    event.preventDefault();
    row.focus();
  };
  const heading = (key: SortKey, label: string, tip: string) => (
    <th
      scope="col"
      className={cell}
      aria-sort={sort.key == key ? (sort.descending ? "descending" : "ascending") : undefined}
    >
      <SortHeading sortKey={key} label={label} tip={tip} sort={sort} onSort={setSort} />
    </th>
  );
  return (
    <div className="min-h-0 flex-1 overflow-auto" onContextMenu={menu.onContextMenu}>
      <p className="px-2 py-1 font-sans text-xs text-muted-foreground">
        # is the order Wordgard tries them in: for a key, the first whose command returns true wins.
        Keys as on {PLATFORM[keymap.platform]}.
      </p>
      {shown.length ? (
        <table className="w-full border-collapse font-mono text-xs">
          <caption className="sr-only">Key bindings</caption>
          <thead className="sticky top-0 bg-background text-muted-foreground">
            <tr className="border-b">
              {heading("index", "#", "Order")}
              {heading("key", "key", "Key")}
              {heading("command", "command", "Command")}
              <th scope="col" className={cell}>
                with Shift
              </th>
              <th scope="col" className={cn(cell, "font-sans")}>
                description
              </th>
              <th scope="col" className={cell}>
                notes
              </th>
            </tr>
          </thead>
          <tbody onKeyDown={onKeyDown}>
            {shown.map((binding) => (
              <tr
                key={binding.index}
                data-binding={binding.index}
                tabIndex={binding.index == stop ? 0 : -1}
                aria-current={binding.index == active ? "true" : undefined}
                onFocus={() => setActive(binding.index)}
                onClick={(event) => event.currentTarget.focus()}
                className={cn(
                  "cursor-default border-b outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                  // Not by its tint alone: a bar, as the tree's selected row.
                  binding.index == active && "bg-accent shadow-[inset_3px_0_0_var(--color-ring)]"
                )}
              >
                <td className={cn(cell, "text-muted-foreground")}>{binding.index + 1}</td>
                <th scope="row" className={cn(cell, "font-medium whitespace-nowrap")}>
                  {keyLabel(binding)}
                </th>
                <td className={cell}>
                  <Command name={binding.command} param={binding.param} />
                </td>
                <td className={cell}>
                  {binding.shift != null && (
                    <Command name={binding.shift} param={binding.shiftParam} />
                  )}
                </td>
                <td className={cn(cell, "font-sans")}>
                  {binding.description}
                  {binding.shiftDescription != null && (
                    <span className="block text-muted-foreground">
                      Shift: {binding.shiftDescription}
                    </span>
                  )}
                  {binding.group != null && (
                    <span className="block text-muted-foreground">{binding.group}</span>
                  )}
                </td>
                <td className={cn(cell, "whitespace-nowrap")}>
                  <span className="flex items-center gap-1">
                    {binding.fromDefault && <Tag>default keymap</Tag>}
                    {binding.allowDefault && <Tag>allows default</Tag>}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="p-2 text-xs text-muted-foreground">
          {keymap.bindings.length ? "No key bindings match." : "No key bindings."}
        </p>
      )}
    </div>
  );
};
