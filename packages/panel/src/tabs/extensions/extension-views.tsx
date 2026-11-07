import type { ExtensionNode, Path } from "@stesura/wordgard-dev-tools";
import { cn } from "cn";
import { ChevronDownIcon, ChevronRightIcon, CommandLineIcon } from "#icons";
import { Tag } from "#components/ui/badge";
import { Button } from "#components/ui/button";
import { CopyButton } from "#components/copy-button";
import { Field } from "#components/node-pane";
import type { Line } from "./extension-tree.ts";
import type { RowValues } from "./extensions-source.ts";

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

/** The selected row: what it is, its values now, its links and actions. */
export const ExtensionPane = ({
  node,
  values,
  onLog,
  onShowField,
  onShowNode,
}: {
  node: ExtensionNode | null;
  values: RowValues;
  onLog: (resolved: boolean) => void;
  onShowField: (index: number) => void;
  /** The Structure, with decorations on: a node, or the document. */
  onShowNode: (path: Path) => void;
}) => {
  if (!node) {
    return (
      <aside aria-label="Extension" className="h-full overflow-auto p-2 text-xs">
        <p className="text-muted-foreground">Select an extension to see it here.</p>
      </aside>
    );
  }
  const { field, source } = node;
  const output = values.output;
  return (
    <aside aria-label="Extension" className="h-full overflow-auto p-2 font-mono text-xs">
      <h3 className="mb-1 font-sans font-medium">{node.label}</h3>
      <p className="mb-2 font-sans text-muted-foreground">{KIND_TEXT[node.kind]}</p>
      <Field label="kind">{node.kind}</Field>
      <Field label="precedence">{node.prec}</Field>
      {node.value != null && <Field label="value">{node.value}</Field>}
      {values.values?.value != null && <Field label="now">{values.values.value}</Field>}
      {node.facet != null && values.values?.resolved != null && (
        <Field label="resolved">{values.values.resolved}</Field>
      )}
      {values.error != null && <p className="text-destructive">{values.error}</p>}
      <div className="my-2 flex flex-wrap gap-1 font-sans">
        <Button variant="outline" size="xs" onClick={() => onLog(false)}>
          <CommandLineIcon /> Log to console
        </Button>
        {node.facet != null && (
          <Button variant="outline" size="xs" onClick={() => onLog(true)}>
            <CommandLineIcon /> Log its facet&apos;s value
          </Button>
        )}
        {field != null && (
          <Button variant="outline" size="xs" onClick={() => onShowField(field)}>
            Show in Fields
          </Button>
        )}
        <CopyButton label="Copy as JSON" text={() => JSON.stringify(node, null, 2)} />
      </div>
      {source != null && output && (
        <section aria-label="Decorations">
          <h4 className="mt-2 mb-1 font-sans text-muted-foreground">
            Decorations: {output.source?.count ?? output.decorations.length}
            {output.source?.exact === false && "+"}
          </h4>
          {output.source?.error != null && (
            <p className="text-destructive">{output.source.error}</p>
          )}
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
      )}
    </aside>
  );
};
