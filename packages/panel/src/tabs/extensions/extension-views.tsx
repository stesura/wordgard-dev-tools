import type { ExtensionNode, FacetOrder, Path } from "@stesura/wordgard-dev-tools";
import { paneHeader } from "#components/pane-header";
import { cn } from "cn";
import type { KeyboardEvent } from "react";
import { ChevronDownIcon, ChevronRightIcon, XMarkIcon } from "#icons";
import { IconButton } from "#components/icon-button";
import { GuidePopover } from "#components/guide-popover";
import { EXTENSION_DETAIL } from "../../guides/guides.ts";
import { Tag } from "#components/ui/badge";
import { Field } from "#components/node-pane";
import type { MenuAnchor } from "#lib/menu-anchor.ts";
import type { Line } from "./extension-tree.ts";
import type { RowValues } from "./extensions-source.ts";
import { facetNote } from "./facet-notes.ts";

// The chevron's target is 24 × 24 (WCAG 2.5.8): the row is its height.
export const ROW = 24;
const INDENT = 14;

const KIND_COLOUR: Partial<Record<ExtensionNode["kind"], string>> = {
  field: "text-green-700 dark:text-green-400",
  "derived field": "text-green-700 dark:text-green-400",
  facet: "text-sky-700 dark:text-sky-400",
  precedence: "text-violet-700 dark:text-violet-300",
  compartment: "text-amber-700 dark:text-amber-400",
};

export const Row = ({
  line,
  start,
  selected,
  match,
  onToggle,
}: {
  line: Line;
  start: number;
  selected: boolean;
  /** A search match's tint, in place of the selection's. */
  match: string;
  onToggle: (id: string) => void;
}) => {
  const { node } = line;
  const folder = node.children.length > 0;
  return (
    <div
      id={`extension-${line.id}`}
      role="treeitem"
      aria-level={line.depth + 1}
      aria-expanded={folder ? !line.collapsed : undefined}
      aria-selected={selected}
      aria-posinset={line.position}
      aria-setsize={line.siblings}
      data-extension={line.id}
      className={cn(
        "absolute inset-x-0 top-0 flex cursor-default items-center gap-1 pr-2 font-mono text-xs whitespace-nowrap",
        match || (selected && "bg-accent"),
        // Not by its tint alone (1.1:1): a bar, wider under a match's inset outline.
        selected &&
          (match
            ? "shadow-[inset_5px_0_0_var(--color-ring)]"
            : "shadow-[inset_3px_0_0_var(--color-ring)]")
      )}
      style={{ height: ROW, transform: `translateY(${start}px)`, paddingLeft: line.depth * INDENT }}
    >
      <span className="-mr-1 flex size-6 shrink-0 items-center justify-center text-muted-foreground [&_svg]:size-3">
        {folder && (
          // For the mouse: the item's aria-expanded says it, and its name mustn't start with it.
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            className="flex size-6 cursor-pointer items-center justify-center"
            onClick={(event) => {
              event.stopPropagation();
              onToggle(line.id);
            }}
          >
            {line.collapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
          </button>
        )}
      </span>
      <span
        className={cn(
          "shrink-0",
          node.duplicate ? "text-muted-foreground line-through" : KIND_COLOUR[node.kind]
        )}
      >
        {node.label}
      </span>
      {node.kind != "precedence" && node.prec != "default" && <Tag>{node.prec}</Tag>}
      {node.duplicate && <Tag>duplicate</Tag>}
      {node.order && node.order.of > 1 && (
        <span className="shrink-0 text-muted-foreground">
          #{node.order.index + 1} of {node.order.of}
        </span>
      )}
      {node.value != null && !node.duplicate && (
        <span className="truncate text-muted-foreground">{node.value}</span>
      )}
      {line.collapsed && (
        <span className="text-muted-foreground">{node.children.length + node.more} inside</span>
      )}
      {node.more > 0 && !line.collapsed && (
        <span className="text-muted-foreground">(+{node.more} not shown)</span>
      )}
    </div>
  );
};

const KIND_TEXT: Record<ExtensionNode["kind"], string> = {
  configuration: "The editor's configuration.",
  group: "An array of extensions.",
  precedence: "Sets the precedence of what it holds.",
  compartment: "A compartment: its current content, which a transaction can reconfigure.",
  field: "A state field.",
  "derived field": "A derived field: computed from the state.",
  facet: "A facet provider: a value for a facet.",
  object: "An object with an `extension` property: its content.",
  unknown: "Not an extension Wordgard knows: it would throw.",
};

const placeOf = ({ from, to }: { from: number; to: number }) =>
  from == to ? `${from}` : `${from}–${to}`;

/**
 * The selected row: what it is, its values now, its links. Its actions are in its context menu
 * (the tree row's): the body takes focus for Shift+F10.
 */
export const ExtensionPane = ({
  id,
  node,
  values,
  facets,
  capped,
  menu,
  onShowNode,
  onShowRow,
  onClose,
}: {
  /** The row's id in the tree. */
  id: string | null;
  node: ExtensionNode | null;
  values: RowValues;
  facets: FacetOrder[];
  /** The tree left rows out: an order may miss values. */
  capped: boolean;
  menu: Pick<MenuAnchor<object>, "onContextMenu" | "onKeyDown">;
  /** The Structure, with decorations on: a node, or the document. */
  onShowNode: (path: Path) => void;
  /** Selects another row, by its id in the tree. */
  onShowRow: (id: string) => void;
  onClose: () => void;
}) => {
  const about = (
    <GuidePopover guide={EXTENSION_DETAIL} label="About the extension details" align="start" />
  );
  const close = (
    <IconButton label="Close the extension details" className="ml-auto" onClick={onClose}>
      <XMarkIcon />
    </IconButton>
  );
  // In the pane itself: a popup's Escape (its menu) bubbles here too, through React.
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    menu.onKeyDown(event);
    if (
      event.key == "Escape" &&
      !event.defaultPrevented &&
      event.target instanceof Node &&
      event.currentTarget.contains(event.target)
    ) {
      event.preventDefault();
      onClose();
    }
  };
  if (!node || id == null) {
    return (
      <aside
        aria-label="Extension"
        className="flex h-full min-h-0 flex-col text-xs"
        onKeyDown={onKeyDown}
      >
        <div className={paneHeader}>
          <h3 className="text-muted-foreground">Extension</h3>
          {about}
          {close}
        </div>
        <p className="p-2 text-muted-foreground">Select an extension to see it here.</p>
      </aside>
    );
  }
  const { source } = node;
  const output = values.output;
  return (
    <aside
      aria-label="Extension"
      className="flex h-full min-h-0 flex-col text-xs"
      onContextMenu={menu.onContextMenu}
      onKeyDown={onKeyDown}
    >
      <div className={paneHeader}>
        <h3 className="truncate font-medium">{node.label}</h3>
        {about}
        <span className="shrink-0 text-muted-foreground">{node.kind}</span>
        {close}
      </div>
      <div
        data-extension-detail={id}
        tabIndex={0}
        className="min-h-0 flex-1 overflow-auto p-2 font-mono outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <p className="mb-2 font-sans text-muted-foreground">{KIND_TEXT[node.kind]}</p>
        <Field label="kind">{node.kind}</Field>
        <Field label="precedence">{node.prec}</Field>
        {node.value != null && <Field label="value">{node.value}</Field>}
        {values.values?.value != null && <Field label="now">{values.values.value}</Field>}
        {node.facet != null && values.values?.resolved != null && (
          <Field label="resolved">{values.values.resolved}</Field>
        )}
        {values.error != null && <p className="text-destructive">{values.error}</p>}
        {node.order && (
          <Order
            facet={facets[node.order.facet]}
            index={node.order.index}
            capped={capped}
            onShowRow={onShowRow}
          />
        )}
        {source != null && output && <Decorations output={output} onShowNode={onShowNode} />}
      </div>
    </aside>
  );
};

/** A facet value among its facet's, in the order Wordgard gives them; the others link to their rows. */
const Order = ({
  facet,
  index,
  capped,
  onShowRow,
}: {
  facet: FacetOrder | undefined;
  index: number;
  capped: boolean;
  onShowRow: (id: string) => void;
}) => {
  if (!facet) return null;
  return (
    <section aria-label="Order">
      <h4 className="mt-2 mb-1 font-sans text-muted-foreground">
        Order in {facet.label}: #{index + 1} of {facet.values.length}
      </h4>
      <p className="mb-1 font-sans text-muted-foreground">
        {facet.values.length == 1
          ? "Its only value."
          : (facetNote(facet.wordgard ?? facet.label) ??
            "By precedence, then in configuration order. What the order does depends on the facet.")}
      </p>
      {capped && (
        <p className="mb-1 font-sans text-amber-700 dark:text-amber-400">
          The tree left some extensions out: this order may miss values.
        </p>
      )}
      {facet.values.length > 1 && (
        <ol>
          {facet.values.map((value, i) => {
            const id = value.path.join(".");
            const current = i == index;
            return (
              <li
                key={id}
                aria-current={current || undefined}
                className={cn("flex items-center gap-2 border-b py-0.5", current && "bg-accent")}
              >
                <span className="shrink-0 text-muted-foreground">#{i + 1}</span>
                {value.prec != "default" && <Tag>{value.prec}</Tag>}
                {current ? (
                  <span className="truncate">{value.value ?? "this one"}</span>
                ) : (
                  <button
                    type="button"
                    className="cursor-pointer truncate text-left text-primary hover:underline"
                    onClick={() => onShowRow(id)}
                  >
                    {value.value ?? "show"}
                  </button>
                )}
                {value.from && (
                  <span className="truncate text-muted-foreground">in {value.from}</span>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
};

const Decorations = ({
  output,
  onShowNode,
}: {
  output: NonNullable<RowValues["output"]>;
  onShowNode: (path: Path) => void;
}) => (
  <section aria-label="Decorations">
    <h4 className="mt-2 mb-1 font-sans text-muted-foreground">
      Decorations: {output.source?.count ?? output.decorations.length}
      {output.source?.exact === false && "+"}
    </h4>
    {output.source?.error != null && <p className="text-destructive">{output.source.error}</p>}
    <ul>
      {output.decorations.map((decoration) => {
        const [path] = decoration.paths;
        const target = path ?? decoration.at;
        return (
          <li key={decoration.index} className="flex gap-2 border-b py-0.5">
            {target ? (
              <button
                type="button"
                className="shrink-0 cursor-pointer text-primary hover:underline"
                onClick={() => onShowNode(target)}
              >
                {placeOf(decoration)}
              </button>
            ) : (
              <span className="shrink-0 text-muted-foreground">{placeOf(decoration)}</span>
            )}
            <span>{decoration.kind}</span>
            {decoration.note != null && (
              <span className="truncate text-muted-foreground">{decoration.note}</span>
            )}
          </li>
        );
      })}
    </ul>
  </section>
);
