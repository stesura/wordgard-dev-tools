import { toggled } from "#lib/sets.ts";
import { cn } from "cn";
import { ChevronDownIcon } from "#icons";
import type { ComponentProps } from "react";
import type { LogRow } from "@stesura/wordgard-dev-tools";
import { Button } from "#components/ui/button";
import { ClearFilters } from "#components/clear-filters";
import { Popover, PopoverContent, PopoverTrigger } from "#components/ui/popover";
import type { LogSource, RecordSetting } from "./log-source.ts";
import { Tip } from "#components/tip";
import { asJSON, persistent } from "#stores/persistent.ts";
import { isRecord, stringSet } from "#lib/json.ts";
import { FLAGS, FLAG_TIPS, type Flag, flags, label } from "./log-format.ts";

// Rows without a user event, in the user event filter.
const NONE = "(none)";
const eventOf = (row: LogRow) => row.userEvent ?? NONE;

/**
 * Hidden user events (unticked, so ones first seen later show) and what-changed flags (a row shows
 * while it has one still on, or none at all); the annotations a row must have.
 */
type Filters = {
  events: ReadonlySet<string>;
  hidden: ReadonlySet<Flag>;
  annotations: ReadonlySet<string>;
};
export const noFilters: Filters = { events: new Set(), hidden: new Set(), annotations: new Set() };
const filtering = (filters: Filters) =>
  filters.events.size > 0 || filters.hidden.size > 0 || filters.annotations.size > 0;

// Numbered as first seen, page-wide: "annotation #1" may be another annotation after a reload.
const unnamed = /^annotation #\d+$/;

// Saved, shared by every editor: created by the Log as it mounts. Unnamed annotations last only
// until reload.
export const createLogFilters = () =>
  persistent(
    "wordgard-devtools:log-filters",
    noFilters,
    asJSON(
      (json): Filters => {
        if (!isRecord(json)) return noFilters;
        const hidden = stringSet(json.hidden);
        return {
          events: stringSet(json.events),
          hidden: new Set(FLAGS.filter((flag) => hidden.has(flag))),
          annotations: stringSet(json.annotations),
        };
      },
      (filters) => ({
        events: [...filters.events],
        hidden: [...filters.hidden],
        annotations: [...filters.annotations].filter((name) => !unnamed.test(name)),
      })
    )
  );

const matches = (row: LogRow, { events, hidden, annotations }: Filters) =>
  !events.has(eventOf(row)) &&
  (!flags(row).length || flags(row).some((flag) => !hidden.has(flag))) &&
  [...annotations].every((name) => row.annotations.includes(name));

export const filteredRows = (rows: LogRow[], filters: Filters) =>
  filtering(filters) ? rows.filter((row) => matches(row, filters)) : rows;

/** The rows' user events, sorted, "none" last for rows without one. */
const userEvents = (rows: LogRow[]) => {
  const found = new Set(rows.map(eventOf));
  const none = found.delete(NONE);
  return [...[...found].sort(), ...(none ? [NONE] : [])];
};

const eventLabel = (event: string) => (event == NONE ? "none" : event);

/** Ticked: shown. "All" ticks every one, or, when all are ticked, unticks them. */
const UserEventFilter = ({
  events,
  hidden,
  disabled,
  onChange,
}: {
  events: string[];
  hidden: ReadonlySet<string>;
  disabled: boolean;
  onChange: (hidden: ReadonlySet<string>) => void;
}) => {
  const shown = events.filter((event) => !hidden.has(event));
  const all = shown.length == events.length;
  const [only] = shown;
  const summary = all
    ? "all"
    : only == null
      ? "none"
      : shown.length == 1
        ? eventLabel(only)
        : `${shown.length} of ${events.length}`;
  const check = "size-3 cursor-pointer accent-primary";
  const row = "flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-0.5 hover:bg-accent";
  return (
    <Popover>
      <PopoverTrigger
        disabled={disabled}
        render={
          <Button
            variant="outline"
            size="xs"
            aria-label="Filter by user event"
            className="h-5 min-w-24 justify-between font-mono"
          />
        }
      >
        {summary}
        <ChevronDownIcon className="text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="max-h-80 w-auto min-w-40 gap-0 overflow-auto p-1 font-mono text-xs"
      >
        <label className={cn(row, "border-b pb-1 font-sans font-medium")}>
          <input
            type="checkbox"
            checked={all}
            // Some ticked: shown as a dash.
            ref={(box) => {
              if (box) box.indeterminate = !all && shown.length > 0;
            }}
            onChange={() => onChange(all ? new Set(events) : new Set())}
            className={check}
          />
          All
        </label>
        <div role="group" aria-label="User events" className="pt-1">
          {events.map((event) => (
            <label key={event} className={cn(row, event == NONE && "text-muted-foreground")}>
              <input
                type="checkbox"
                checked={!hidden.has(event)}
                onChange={() => onChange(toggled(hidden, event))}
                className={check}
              />
              {eventLabel(event)}
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

/** Every annotation in the rows but the time stamp, which all have. */
const annotationTypes = (rows: LogRow[]) =>
  [...new Set(rows.flatMap((row) => row.annotations))].filter((name) => name != "time").sort();

/** A filter toggle. Passes other props on: a tooltip's trigger adds its own. */
const FilterToggle = ({
  pressed,
  className,
  ...props
}: ComponentProps<"button"> & { pressed: boolean }) => (
  <button
    type="button"
    aria-pressed={pressed}
    {...props}
    className={cn(
      "h-5 cursor-pointer rounded px-1.5 font-mono text-xs disabled:cursor-default disabled:opacity-50",
      pressed
        ? "bg-primary text-primary-foreground"
        : "bg-secondary text-muted-foreground enabled:hover:text-foreground",
      className
    )}
  />
);

type FilterUpdate = (update: (filters: Filters) => Filters) => void;

export const FilterBar = ({
  rows,
  filters,
  onChange,
}: {
  rows: LogRow[];
  filters: Filters;
  onChange: FilterUpdate;
}) => {
  // A saved one stays listed, pressed, until a row has it: it can be switched off.
  const annotations = [...new Set([...annotationTypes(rows), ...filters.annotations])].sort();
  // Nothing to filter yet.
  const disabled = !rows.length;
  return (
    <div
      role="group"
      aria-label="Filters"
      className="flex min-h-7 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b bg-strip px-2 py-1 text-xs"
    >
      <span className={label(disabled)}>Filters</span>
      <span className="flex items-center gap-1">
        <span className={label(disabled)}>userEvent:</span>
        <UserEventFilter
          events={userEvents(rows)}
          hidden={filters.events}
          disabled={disabled}
          onChange={(events) => onChange((f) => ({ ...f, events }))}
        />
      </span>
      <span role="group" aria-label="Filter by what changed" className="flex items-center gap-1">
        <span className={label(disabled)}>changed:</span>
        {FLAGS.map((flag) => (
          <Tip
            key={flag}
            label={`${FLAG_TIPS[flag]}: ${filters.hidden.has(flag) ? "hidden, unless something else shown changed too" : "shown"}`}
          >
            <FilterToggle
              pressed={!filters.hidden.has(flag)}
              disabled={disabled}
              onClick={() => onChange((f) => ({ ...f, hidden: toggled(f.hidden, flag) }))}
            >
              {flag}
            </FilterToggle>
          </Tip>
        ))}
      </span>
      {annotations.length > 0 && (
        <span
          role="group"
          aria-label="Filter by annotation"
          className="flex flex-wrap items-center gap-1"
        >
          <span className={label(disabled)}>annotations:</span>
          {annotations.map((name) => (
            <FilterToggle
              key={name}
              disabled={disabled}
              pressed={filters.annotations.has(name)}
              onClick={() => onChange((f) => ({ ...f, annotations: toggled(f.annotations, name) }))}
            >
              {name}
            </FilterToggle>
          ))}
        </span>
      )}
      {filtering(filters) && <ClearFilters onClick={() => onChange(() => noFilters)} />}
    </div>
  );
};

/** A recording setting's checkbox: what the log leaves out, unticked. */
export const SettingBox = ({
  source,
  setting,
  on,
  label,
  tip,
}: {
  source: LogSource;
  setting: RecordSetting;
  on: boolean;
  label: string;
  tip: string;
}) => (
  <Tip label={<span className="block max-w-72">{tip}</span>}>
    <label className="flex cursor-pointer items-center gap-1 font-mono text-muted-foreground hover:text-foreground">
      <input
        type="checkbox"
        checked={on}
        onChange={(event) => void source.setSetting(setting, event.target.checked)}
        className="size-3 cursor-pointer accent-primary"
      />
      {label}
    </label>
  </Tip>
);
