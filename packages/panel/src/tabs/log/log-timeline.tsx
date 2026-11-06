import { cn } from "cn";
import { useState } from "react";
import { SLOW_MS, type LogRow } from "@stesura/wordgard-dev-tools";
import { isSlow, ms } from "./log-format.ts";

// Square root: a 1 ms update still shows, and two frames' budget fills the strip.
const barHeight = (total: number) =>
  Math.max(6, Math.min(100, Math.sqrt(total / (2 * SLOW_MS)) * 100));

const barOf = (target: EventTarget) => {
  const index = target instanceof Element ? target.getAttribute("data-bar") : null;
  return index == null ? null : Number(index);
};

/**
 * One bar per entry, its height the update's time (dispatch and flush); the line is a frame's
 * budget. The hovered bar's times show in a corner (one readout, not a tooltip per bar).
 */
export const Timeline = ({
  rows,
  selected,
  onSelect,
}: {
  rows: LogRow[];
  selected: number | null;
  onSelect: (index: number) => void;
}) => {
  const [hovered, setHovered] = useState<number | null>(null);
  const shown = rows.find((row) => row.index == hovered);
  return (
    <div aria-hidden="true" className="relative h-10 shrink-0 border-b px-2 py-1">
      {shown && (
        <span className="pointer-events-none absolute top-0.5 right-2 z-10 rounded bg-popover px-1 font-mono text-[11px] text-popover-foreground shadow-sm">
          #{shown.index} · dispatch {ms(shown.dispatchMs)} ms · flush {ms(shown.flushMs)} ms
        </span>
      )}
      <div
        className="relative flex h-full items-end gap-px overflow-hidden"
        onClick={(event) => {
          const index = barOf(event.target);
          if (index != null) onSelect(index);
        }}
        onPointerOver={(event) => setHovered(barOf(event.target))}
        onPointerLeave={() => setHovered(null)}
      >
        <div
          className="pointer-events-none absolute inset-x-0 border-t border-dashed border-destructive/50"
          style={{ bottom: `${barHeight(SLOW_MS)}%` }}
        />
        {rows.map((row) => (
          <div
            key={row.index}
            data-bar={row.index}
            className={cn(
              "max-w-2 min-w-px flex-1 cursor-pointer rounded-t-sm",
              isSlow(row) ? "bg-destructive" : "bg-primary/60",
              selected == row.index && "bg-foreground"
            )}
            style={{ height: `${barHeight((row.dispatchMs ?? 0) + (row.flushMs ?? 0))}%` }}
          />
        ))}
      </div>
    </div>
  );
};
