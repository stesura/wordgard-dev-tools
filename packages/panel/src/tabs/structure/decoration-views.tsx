import type { DecorationInfo } from "@stesura/wordgard-dev-tools";
import { CommandLineIcon } from "#icons";
import { CopyButton } from "#components/copy-button";
import { IconButton } from "#components/icon-button";
import { Tip } from "#components/tip";
import { Tag } from "#components/ui/badge";
import { json } from "#lib/json.ts";
import { sourceLabel, type DecorationIndex } from "./decorations-source.ts";

const place = (item: DecorationInfo) =>
  item.from == item.to ? `at ${item.from}` : `${item.from}–${item.to}`;

const summary = (item: DecorationInfo, index: DecorationIndex) =>
  `${item.kind} ${place(item)}, from ${sourceLabel(index.sources[item.source])}`;

/**
 * A node's decorations, as one badge: how many, and which in its tooltip (the mouse's; the node
 * pane lists them for the keyboard).
 */
export const DecorationBadge = ({
  items,
  index,
}: {
  items: DecorationInfo[] | undefined;
  index: DecorationIndex;
}) =>
  items?.length ? (
    <Tip
      label={
        // A column: the tooltip lays its content out in a row.
        <div className="flex flex-col gap-0.5">
          <p className="font-medium">
            {items.length == 1 ? "Decoration" : `${items.length} decorations`} on this node
          </p>
          <ul>
            {items.map((item, i) => (
              <li key={i}>{summary(item, index)}</li>
            ))}
          </ul>
        </div>
      }
    >
      {/* A gradient, to stand out among the marks' tags: white on it keeps 4.5:1 at both ends.
          Forced colours drop it: an outlined badge there. */}
      <Tag
        data-decorations={items.length}
        className="bg-linear-to-r from-violet-600 to-purple-700 font-medium text-white forced-colors:border-[CanvasText]"
      >
        <span aria-hidden="true">◇ {items.length}</span>
        <span className="sr-only">
          {items.length} decoration{items.length == 1 ? "" : "s"}
        </span>
      </Tag>
    </Tip>
  ) : null;

/** A widget where it sits: between nodes, or in a text leaf at its offset. Its tooltip as the badge's. */
export const WidgetChip = ({ item, index }: { item: DecorationInfo; index: DecorationIndex }) => {
  const param = item.details.find(([label]) => label == "param")?.[1];
  return (
    <Tip
      label={`Widget decoration ${place(item)}${item.side ? `, side ${item.side}` : ""}, from ${sourceLabel(index.sources[item.source])}${param ? `: ${param}` : ""}`}
    >
      <span
        data-widget={item.from}
        className="mx-0.5 inline-flex items-center align-middle text-violet-600 dark:text-violet-400"
      >
        <span aria-hidden="true">◆</span>
        <span className="sr-only">widget</span>
      </span>
    </Tip>
  );
};

/** The Decorations pane's body: each decoration on the node, with what it adds; logged or copied. */
export const DecorationList = ({
  title,
  items,
  index,
  onLog,
}: {
  title: string;
  items: DecorationInfo[];
  index: DecorationIndex;
  onLog: (item: DecorationInfo) => void;
}) => (
  <section aria-label={title} className="font-mono text-xs">
    <h3 className="mb-1 font-sans text-muted-foreground">{title}</h3>
    {items.length ? (
      <ol>
        {items.map((item, i) => (
          <li key={i} data-decoration={item.kind} className="mb-1.5 border-b pb-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">{item.kind}</span>
              <span className="text-muted-foreground">{place(item)}</span>
              {item.side && <span className="text-muted-foreground">side {item.side}</span>}
              <span className="ml-auto flex items-center">
                <IconButton label="Log it to the page's console" onClick={() => onLog(item)}>
                  <CommandLineIcon />
                </IconButton>
                <CopyButton label="Copy it as JSON" text={() => json(item)} />
              </span>
            </div>
            <div className="text-muted-foreground">{sourceLabel(index.sources[item.source])}</div>
            {item.details.map(([label, value]) => (
              <div key={label} className="grid grid-cols-[5.5rem_1fr] gap-2">
                <span className="text-muted-foreground">{label}</span>
                <span className="min-w-0 wrap-break-word">{value}</span>
              </div>
            ))}
            {item.note && (
              <p className="font-sans text-amber-700 dark:text-amber-300">{item.note}</p>
            )}
          </li>
        ))}
      </ol>
    ) : (
      <p className="font-sans text-muted-foreground">None.</p>
    )}
  </section>
);
