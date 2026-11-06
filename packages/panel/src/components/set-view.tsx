import type { Path, SetChangeDetail, SetEntry, SetVerdict } from "@stesura/wordgard-dev-tools";
import { cn } from "cn";
import { Tag } from "#components/ui/badge";
import { Tip } from "#components/tip";
import { placeOf, type SetValue } from "#lib/set-value.ts";

const valueText = (value: unknown) => JSON.stringify(value) ?? String(value);

const linkClass = "cursor-pointer text-primary hover:underline";

/** A Wordgard set's entries; with `onPos`, a position shows its node. */
export const SetView = ({ set, onPos }: { set: SetValue; onPos?: (pos: number) => void }) => (
  <div>
    <p className="mb-1 font-sans text-muted-foreground">
      {set.kind == "point" ? "PointSet" : "RangeSet"}: {set.entries.length + set.more}
      {set.exact ? "" : "+"} {set.kind == "point" ? "points" : "ranges"}
    </p>
    <ol aria-label="Entries">
      {set.entries.map((entry, i) => (
        <li key={i} className="flex gap-2 border-b py-0.5">
          {onPos ? (
            <Tip label="Show its node in the Structure">
              <button
                type="button"
                className={cn("shrink-0", linkClass)}
                onClick={() => onPos(entry.from)}
              >
                {placeOf(entry)}
              </button>
            </Tip>
          ) : (
            <span className="shrink-0 text-muted-foreground">{placeOf(entry)}</span>
          )}
          <span className="min-w-0 wrap-break-word">{valueText(entry.value)}</span>
        </li>
      ))}
    </ol>
    {set.more > 0 && (
      <p className="font-sans text-muted-foreground">
        …and {set.more}
        {set.exact ? "" : "+"} more
      </p>
    )}
  </div>
);

const LABEL: Record<SetVerdict["verdict"], string> = {
  same: "The same set; nothing it holds moved.",
  moved:
    "The same set, kept across a change that moved or removed what it holds: usually a field that forgot to map it. Fine only if its positions aren't the document's, or are mapped where they're read.",
  updated:
    "A new set sharing entries with the old one: mapped, modified, or rebuilt from the same values.",
  recreated: "A new set sharing nothing with the old one.",
};

const redrawn = (changed: SetVerdict["changed"]) =>
  changed == null
    ? "Its values can't be compared (no eq)."
    : changed.count
      ? `The editor sees ${changed.count} change${changed.count == 1 ? "" : "s"}.`
      : "Nothing for the editor to redraw.";

/** How a set changed: same, kept while it moved (amber), updated, recreated. `tabIndex`: -1 inside a
 * composite that moves focus to it by arrows. */
export const SetVerdictBadge = ({
  verdict: v,
  tabIndex = 0,
}: {
  verdict: SetVerdict;
  tabIndex?: number;
}) => {
  const text =
    v.verdict == "same"
      ? "same set"
      : v.verdict == "moved"
        ? "kept, not mapped"
        : v.verdict == "updated"
          ? `updated +${v.added} −${v.dropped}`
          : "recreated";
  return (
    <Tip
      label={
        <>
          {LABEL[v.verdict]} {v.verdict == "updated" && `Kept ${v.kept}. `}
          {v.verdict != "same" && v.verdict != "moved" && redrawn(v.changed)}
          {v.partial && " Counted up to 20 000 entries."}
        </>
      }
    >
      <Tag
        tabIndex={tabIndex}
        data-set-verdict={v.verdict}
        className={cn(
          "shrink-0",
          v.verdict == "moved" && "bg-amber-500/20 text-amber-800 dark:text-amber-300"
        )}
      >
        {text}
      </Tag>
    </Tip>
  );
};

const Entries = ({
  title,
  entries,
  onPath,
  tabIndex,
}: {
  title: string;
  entries: SetEntry[];
  onPath?: (path: Path) => void;
  tabIndex?: number;
}) =>
  entries.length ? (
    <div className="mb-2">
      <h4 className="font-sans text-muted-foreground">{title}</h4>
      <ol aria-label={title}>
        {entries.map((entry, i) => (
          <li key={i} className="flex gap-2 border-b py-0.5">
            {onPath && entry.path ? (
              <button
                type="button"
                tabIndex={tabIndex}
                className={cn("shrink-0", linkClass)}
                onClick={() => entry.path && onPath(entry.path)}
              >
                {placeOf(entry)}
              </button>
            ) : (
              <span className="shrink-0 text-muted-foreground">{placeOf(entry)}</span>
            )}
            <span className="min-w-0 wrap-break-word">{entry.value}</span>
          </li>
        ))}
      </ol>
    </div>
  ) : null;

/** What a change to a set added and dropped; a dropped entry's position is in the old document.
 * `tabIndex`: its links', as the badge's. */
export const SetChange = ({
  detail,
  onPath,
  tabIndex,
}: {
  detail: SetChangeDetail;
  onPath?: (path: Path) => void;
  tabIndex?: number;
}) => (
  <div className="mb-2">
    <Entries title="Added" entries={detail.addedEntries} onPath={onPath} tabIndex={tabIndex} />
    <Entries title="Dropped" entries={detail.droppedEntries} />
  </div>
);
