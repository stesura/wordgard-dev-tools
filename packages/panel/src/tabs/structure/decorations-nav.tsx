import type { DecorationInfo, Path, StructureNode } from "@stesura/wordgard-dev-tools";
import { useState } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "#icons";
import { IconButton } from "#components/icon-button";
import { Button } from "#components/ui/button";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "#components/ui/popover";
import { documentOrder, sourceLabel, type DecorationIndex } from "./decorations-source.ts";

const plural = (count: number, word: string) => `${count} ${word}${count == 1 ? "" : "s"}`;

const place = (item: DecorationInfo) =>
  item.from == item.to ? `at ${item.from}` : `${item.from}–${item.to}`;

/** The node a decoration takes the Structure to: the first it applies to, else the one holding it. */
const targetOf = (item: DecorationInfo): Path | null => item.paths[0] ?? item.at;

export const nameAt = (doc: StructureNode | null, path: Path) => {
  let node = doc;
  for (const index of path) node = node?.children[index] ?? null;
  return node ? (path.length ? node.name : "the document") : null;
};

/** One source's decorations, each a button to its node. */
const SourceList = ({
  index,
  source,
  doc,
  onShow,
}: {
  index: DecorationIndex;
  source: number;
  doc: StructureNode | null;
  onShow: (path: Path) => void;
}) => {
  const info = index.sources[source];
  const items = index.items.filter((item) => item.source == source);
  return (
    <section aria-label={sourceLabel(info)} className="border-t pt-1.5 first:border-t-0 first:pt-0">
      <h3 className="mb-1 flex gap-2 text-xs font-medium">
        {sourceLabel(info)}
        <span className="font-normal text-muted-foreground">
          {info?.error != null ? (
            <span className="text-destructive">failed: {info.error}</span>
          ) : (
            // Past the cap, some aren't sent: the source's count, and how many are listed.
            `${plural(info?.count ?? items.length, "decoration")}${info && !info.exact ? "+" : ""}${items.length < (info?.count ?? 0) ? `, ${items.length} listed` : ""}`
          )}
        </span>
      </h3>
      {items.length > 0 && (
        <ul className="font-mono text-xs">
          {items.map((item) => {
            const target = targetOf(item);
            const name = target && nameAt(doc, target);
            return (
              <li key={item.index}>
                <button
                  type="button"
                  disabled={!target}
                  onClick={() => target && onShow(target)}
                  className="flex min-h-6 w-full cursor-pointer items-baseline gap-2 rounded px-1 text-left outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-default"
                >
                  <span>{item.kind}</span>
                  <span className="text-muted-foreground">{place(item)}</span>
                  {name && <span className="text-muted-foreground">on {name}</span>}
                  {item.note && (
                    <span className="ml-auto font-sans text-amber-700 dark:text-amber-300">
                      {item.note}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

/**
 * The decorations' summary, opening the list of them by source (each a way to its node), and
 * previous / next through the nodes that have any, in document order.
 */
export const DecorationsNav = ({
  index,
  doc,
  selected,
  onShow,
}: {
  index: DecorationIndex;
  doc: StructureNode | null;
  selected: Path | null;
  onShow: (path: Path) => void;
}) => {
  const [open, setOpen] = useState(false);
  const { nodes } = index;
  const at = selected ? nodes.findIndex((path) => documentOrder(path, selected) == 0) : -1;
  // From the selected node, decorated or not: the next decorated one after it, or before it.
  const step = (forward: boolean) => {
    const after = selected
      ? nodes.filter((path) => documentOrder(path, selected) * (forward ? 1 : -1) > 0)
      : nodes;
    const next = (forward ? after[0] : after.at(-1)) ?? (forward ? nodes[0] : nodes.at(-1));
    if (next) onShow(next);
  };
  const failed = index.sources.filter((s) => s.error != null).length;
  const summary = `${plural(index.total, "decoration")}${failed ? ` · ${failed} failed` : ""}`;
  return (
    <span className="flex items-center gap-0.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="ghost"
              size="xs"
              className="text-muted-foreground"
              // Starts with the visible text (WCAG 2.5.3).
              aria-label={`${summary}, from ${plural(index.sources.length, "source")}: list them`}
            />
          }
        >
          {plural(index.total, "decoration")}
          {failed > 0 && <span className="text-destructive"> · {failed} failed</span>}
        </PopoverTrigger>
        <PopoverContent align="end" className="max-h-96 w-96 gap-1.5 overflow-auto">
          <PopoverTitle className="text-sm">
            Decorations, from {plural(index.sources.length, "source")}
          </PopoverTitle>
          {index.sources.map((source) => (
            <SourceList
              key={source.index}
              index={index}
              source={source.index}
              doc={doc}
              onShow={(path) => {
                setOpen(false);
                onShow(path);
              }}
            />
          ))}
        </PopoverContent>
      </Popover>
      {nodes.length > 0 && (
        <span className="shrink-0 text-muted-foreground" aria-live="polite">
          {at < 0 ? "–" : at + 1}/{nodes.length}
        </span>
      )}
      <IconButton
        label="Previous node with decorations"
        disabled={!nodes.length}
        onClick={() => step(false)}
      >
        <ChevronUpIcon />
      </IconButton>
      <IconButton
        label="Next node with decorations"
        disabled={!nodes.length}
        onClick={() => step(true)}
      >
        <ChevronDownIcon />
      </IconButton>
    </span>
  );
};
