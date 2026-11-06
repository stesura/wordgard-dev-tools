import { ChevronDownIcon, ChevronUpIcon } from "#icons";
import { useMemo, useState } from "react";
import { Button } from "#components/ui/button";
import { Tip } from "./tip.tsx";

/** Matches' ids in display order, for a query; null while there's nothing to search. */
export type Find = ((query: string) => string[]) | null;

/** A tab's search: the matches of its query, and the one stepped to, revealed on each step and on typing. */
export const useSearch = (find: Find, reveal: (id: string) => void) => {
  const [query, setQuery] = useState("");
  const [current, setCurrent] = useState(0);
  // Kept: the compiler would also key it on `current` and `reveal`, and the uncompiled tabs pass
  // a new `reveal` on every render (every scroll frame): the whole search would rerun.
  const matches = useMemo(() => (find && query ? find(query) : []), [find, query]);
  // -1 with no matches; clamped when a reload leaves fewer.
  const index = Math.min(current, matches.length - 1);
  const go = (next: number) => {
    const at = (next + matches.length) % matches.length;
    const id = matches[at];
    if (id == null) return;
    setCurrent(at);
    reveal(id);
  };
  const onQuery = (value: string) => {
    setQuery(value);
    setCurrent(0);
    const first = find && value ? find(value)[0] : undefined;
    if (first != null) reveal(first);
  };
  return {
    query,
    matches,
    index,
    current: matches[index] ?? null,
    all: new Set(matches),
    go,
    onQuery,
  };
};

export type Search = ReturnType<typeof useSearch>;

/** Scrolls a virtualized list's row to the middle, when it's out of view. After a frame: the rows opened to it render first. */
export const centreRow = (scroller: HTMLElement | null, position: number, height: number) =>
  requestAnimationFrame(() => {
    if (!scroller || position < 0) return;
    const top = position * height;
    if (top >= scroller.scrollTop && top + height <= scroller.scrollTop + scroller.clientHeight)
      return;
    scroller.scrollTop = Math.max(0, top - (scroller.clientHeight - height) / 2);
  });

export const includes = (haystack: string, needle: string) =>
  haystack.toLowerCase().includes(needle.toLowerCase());

// In dark, a yellow tint strong enough to see drowns the text: a ring marks the match instead.
export const matchClass = (
  id: string,
  search: { all: ReadonlySet<string>; current: string | null }
) =>
  search.current == id
    ? "bg-yellow-500/40 dark:bg-yellow-500/15 dark:ring-2 dark:ring-yellow-500"
    : search.all.has(id)
      ? "bg-yellow-500/20 dark:bg-yellow-500/10 dark:ring-1 dark:ring-yellow-500/60"
      : "";

/** The search input, its count and its previous/next buttons: Enter and Shift+Enter step, Escape clears. */
export const SearchBox = ({
  search,
  label,
  placeholder,
}: {
  search: Search;
  label: string;
  placeholder: string;
}) => (
  <>
    <input
      type="search"
      value={search.query}
      onChange={(event) => search.onQuery(event.target.value)}
      onKeyDown={(event) => {
        if (event.key == "Enter") {
          event.preventDefault();
          search.go(search.index + (event.shiftKey ? -1 : 1));
        } else if (event.key == "Escape") search.onQuery("");
      }}
      aria-label={label}
      placeholder={placeholder}
      className="h-6 min-w-0 flex-1 bg-transparent outline-none"
    />
    {search.query && (
      <span className="shrink-0 text-muted-foreground" aria-live="polite">
        {search.matches.length ? `${search.index + 1}/${search.matches.length}` : "No matches"}
      </span>
    )}
    <Tip label="Previous match (Shift+Enter)">
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Previous match"
        disabled={!search.matches.length}
        onClick={() => search.go(search.index - 1)}
      >
        <ChevronUpIcon />
      </Button>
    </Tip>
    <Tip label="Next match (Enter)">
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Next match"
        disabled={!search.matches.length}
        onClick={() => search.go(search.index + 1)}
      >
        <ChevronDownIcon />
      </Button>
    </Tip>
  </>
);
