import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "#components/ui/collapsible";
import { FilterChip } from "#components/filter-chip";
import { cn } from "cn";
import { XMarkIcon } from "#icons";
import type { ReactNode } from "react";
import { Tip } from "#components/tip";
import { GuidePopover } from "#components/guide-popover";
import type { Guide } from "../../guides/guides.ts";

/** Clears a row of filters. */
const Clear = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <Tip label={label}>
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-5 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground [&_svg]:size-3.5"
    >
      <XMarkIcon />
    </button>
  </Tip>
);

/** A section's bar: its title, its count and its tag filters (a type shows when it has every
 * pressed tag). Sticky, so the section scrolling under it stays named. Its title, and the empty
 * stretch after its filters, collapse or expand the section. */
type HeadingProps = {
  title: string;
  count: string;
  guide: Guide;
  open: boolean;
  onToggleOpen: () => void;
  tags: string[];
  pressed: ReadonlySet<string>;
  onToggle: (tag: string) => void;
  onClear: () => void;
  children?: ReactNode;
};

export const Heading = ({
  title,
  count,
  open,
  onToggleOpen,
  tags,
  pressed,
  onToggle,
  onClear,
  guide,
  children,
}: HeadingProps) => (
  <div
    data-heading
    className="sticky top-0 z-10 flex min-h-7 flex-wrap items-center gap-1 border-b bg-strip px-2 py-1 font-sans"
  >
    <h3 className="font-semibold">
      <CollapsibleTrigger
        aria-label={`${open ? "Collapse" : "Expand"} the ${title.toLowerCase()}`}
        className="cursor-pointer rounded hover:underline"
      >
        {title}
      </CollapsibleTrigger>
    </h3>
    <span className="text-muted-foreground">{count}</span>
    <span className="mr-1">
      <GuidePopover guide={guide} label={`About the ${title.toLowerCase()}`} align="start" />
    </span>
    {tags.map((tag) => (
      <FilterChip key={tag} pressed={pressed.has(tag)} onPressedChange={() => onToggle(tag)}>
        {tag}
      </FilterChip>
    ))}
    {pressed.size > 0 && (
      <Clear label={`Clear the ${title.toLowerCase()} filters`} onClick={onClear} />
    )}
    {/* A mouse target only: the title is the keyboard's. */}
    <div
      data-collapse
      aria-hidden
      className="min-w-4 flex-1 cursor-pointer self-stretch"
      onClick={onToggleOpen}
    />
    {children}
  </div>
);

/** "12", or "3 of 12" when filtered. */
export const count = (shown: number, all: number) =>
  shown == all ? String(all) : `${shown} of ${all}`;

/**
 * A collapsible section: its bar (`actions` at its end), then its cards while open, or `empty` when none
 * match. `last`: no line under it. The line above a bar is the section before's: the bar's own
 * would double the toolbar's, stuck under it.
 */
export const SchemaSection = ({
  actions,
  empty,
  last,
  children,
  ...heading
}: Omit<HeadingProps, "children"> & {
  actions?: ReactNode;
  empty: string | null;
  last?: boolean;
  children: ReactNode;
}) => (
  <Collapsible
    open={heading.open}
    onOpenChange={heading.onToggleOpen}
    render={<section data-list aria-label={heading.title} />}
  >
    <Heading {...heading}>{actions}</Heading>
    <CollapsibleContent className={cn("p-2", !last && "border-b")}>
      {children}
      {empty && <p className="font-sans text-muted-foreground">{empty}</p>}
    </CollapsibleContent>
  </Collapsible>
);
