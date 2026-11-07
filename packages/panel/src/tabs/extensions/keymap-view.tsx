import type { KeyBindingInfo, KeymapInfo } from "@stesura/wordgard-dev-tools";
import { useState, type KeyboardEvent } from "react";
import { CommandLineIcon } from "#icons";
import { IconButton } from "#components/icon-button";
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

/** The key bindings Wordgard's keymap holds, in the order it tries them. */
export const KeymapView = ({
  keymap,
  query,
  onLog,
}: {
  keymap: KeymapInfo;
  query: string;
  onLog: (index: number, shift: boolean) => void;
}) => {
  const shown = keymap.bindings.filter((binding) => matchesBinding(binding, query));
  const cell = "px-2 py-0.5 text-left align-top";
  // One Tab stop for the table: the row last focused, else the first with a command to log.
  const [active, setActive] = useState<number | null>(null);
  const loggable = (binding: KeyBindingInfo) => binding.command != null || binding.any;
  const stop = shown.some((b) => b.index == active && loggable(b))
    ? active
    : (shown.find(loggable)?.index ?? null);
  const onKeyDown = (event: KeyboardEvent<HTMLTableSectionElement>) => {
    const rows = [...event.currentTarget.querySelectorAll("tr")].filter((row) =>
      row.querySelector("button")
    );
    const at = rows.findIndex((row) => event.target instanceof Node && row.contains(event.target));
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
    row.querySelector("button")?.focus();
  };
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <p className="px-2 py-1 font-sans text-xs text-muted-foreground">
        In the order Wordgard tries them: for a key, the first whose command returns true wins. Keys
        as on {PLATFORM[keymap.platform]}.
      </p>
      {shown.length ? (
        <table className="w-full border-collapse font-mono text-xs">
          <caption className="sr-only">Key bindings</caption>
          <thead className="sticky top-0 bg-background text-muted-foreground">
            <tr className="border-b">
              <th scope="col" className={cell}>
                #
              </th>
              <th scope="col" className={cell}>
                key
              </th>
              <th scope="col" className={cell}>
                command
              </th>
              <th scope="col" className={cell}>
                with Shift
              </th>
              <th scope="col" className={cn(cell, "font-sans")}>
                description
              </th>
              <th scope="col" className={cell}>
                <span className="sr-only">Notes and actions</span>
              </th>
            </tr>
          </thead>
          <tbody onKeyDown={onKeyDown}>
            {shown.map((binding) => (
              <tr key={binding.index} data-binding={binding.index} className="border-b">
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
                    {(binding.command != null || binding.any) && (
                      <IconButton
                        label={`Log ${keyLabel(binding)}'s command to the console`}
                        tabIndex={binding.index == stop ? 0 : -1}
                        onFocus={() => setActive(binding.index)}
                        onClick={() => onLog(binding.index, false)}
                      >
                        <CommandLineIcon />
                      </IconButton>
                    )}
                    {binding.shift != null && (
                      <IconButton
                        label={`Log Shift-${keyLabel(binding)}'s command to the console`}
                        tabIndex={-1}
                        onFocus={() => setActive(binding.index)}
                        onClick={() => onLog(binding.index, true)}
                      >
                        <CommandLineIcon />
                      </IconButton>
                    )}
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
