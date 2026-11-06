import type { FlushDecorations, FlushSource, Path } from "@stesura/wordgard-dev-tools";
import { cn } from "cn";
import { Tag } from "#components/ui/badge";
import { Tip } from "#components/tip";
import { SetVerdictBadge } from "#components/set-view";
import { Timing } from "./log-rows.tsx";

const MATCH: Record<FlushSource["match"], string | null> = {
  same: null,
  slot: "new function, same slot",
  added: "added",
  removed: "removed",
};

const amber = "shrink-0 bg-amber-500/20 text-amber-800 dark:text-amber-300";
const linkClass = "cursor-pointer text-primary hover:underline";

const place = ({ from, to }: { from: number; to: number }) =>
  from == to ? `${from}` : `${from}–${to}`;

const Source = ({
  source,
  onShowNode,
}: {
  source: FlushSource;
  /** Null when the flush's document isn't the editor's current one. */
  onShowNode: ((path: Path) => void) | null;
}) => {
  const { set, changed } = source;
  const more = (set?.changed?.count ?? 0) - changed.length;
  return (
    <li className="border-b py-1" data-flush-source={source.index}>
      <div className="flex flex-wrap items-center gap-1">
        <span>
          #{source.index + 1}{" "}
          {source.name ?? <span className="text-muted-foreground">anonymous</span>}
        </span>
        <span className="text-muted-foreground">{source.kind}</span>
        {MATCH[source.match] && <Tag>{MATCH[source.match]}</Tag>}
        {set && <SetVerdictBadge verdict={set} />}
        {source.wasted && (
          <Tip label="Rebuilt for nothing: the editor can't tell the new set from the old one mapped">
            <Tag tabIndex={0} data-wasted className={amber}>
              wasted
            </Tag>
          </Tip>
        )}
        {source.ms != null && (
          <Tip label="Calling it on the flush's last state, measured when shown: not when the editor ran it">
            <span tabIndex={0} className="text-muted-foreground">
              <Timing value={source.ms} unit=" ms" />
            </span>
          </Tip>
        )}
      </div>
      {source.error != null && <p className="text-destructive">{source.error}</p>}
      {set?.changed == null && set != null && (
        <p className="font-sans text-muted-foreground">Its values can't be compared (no eq).</p>
      )}
      {changed.length > 0 && (
        <p>
          <span className="font-sans text-muted-foreground">redrawn: </span>
          {changed.map((range, i) => (
            <span key={i}>
              {i > 0 && ", "}
              {onShowNode && range.path ? (
                <Tip label="Show in the Structure, with decorations">
                  <button
                    type="button"
                    className={linkClass}
                    onClick={() => range.path && onShowNode(range.path)}
                  >
                    {place(range)}
                  </button>
                </Tip>
              ) : (
                place(range)
              )}
            </span>
          ))}
          {more > 0 && <span className="text-muted-foreground"> …and {more} more</span>}
        </p>
      )}
    </li>
  );
};

/** What the entry's flush did to each decoration source. */
export const FlushDecorationsView = ({
  flush,
  onShowNode,
}: {
  flush: FlushDecorations | null;
  onShowNode: ((path: Path) => void) | null;
}) => {
  if (!flush) return <p className="font-sans text-muted-foreground">Not drawn yet.</p>;
  return (
    <div>
      <p className="font-sans text-muted-foreground">
        Flush #{flush.flush}, of {flush.rows.length} transaction{flush.rows.length == 1 ? "" : "s"}
        {flush.rows.length > 1 && ` (${flush.rows.join(", ")})`}.
        {!onShowNode && " Positions in its document, no longer the editor's."}
      </p>
      {flush.gapBefore && (
        <p className={cn("font-sans", "text-amber-800 dark:text-amber-300")}>
          A transaction the Log didn&apos;t record came before it: the editor may have drawn another
          state last.
        </p>
      )}
      {flush.error != null ? (
        <p className="text-destructive">{flush.error}</p>
      ) : flush.sources.length ? (
        <ul aria-label="Decoration sources">
          {flush.sources.map((source) => (
            <Source
              key={`${source.match}:${source.index}`}
              source={source}
              onShowNode={onShowNode}
            />
          ))}
        </ul>
      ) : (
        <p className="font-sans text-muted-foreground">No decoration sources.</p>
      )}
    </div>
  );
};
