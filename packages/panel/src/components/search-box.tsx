import { ChevronDownIcon, ChevronUpIcon } from "#icons";
import { type ComponentProps, useMemo, useState } from "react";
import { cn } from "cn";
import { Button } from "./ui/button.tsx";
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

// In dark, a yellow tint strong enough to see drowns the text: an outline marks the match instead.
// The current match is outlined in light too (not by its tint alone, WCAG 1.4.1). Outlines, inset
// (rows are flush), not rings: forced colours drop box shadows and draw outlines, even transparent
// ones, in the text colour; there the others' is dashed. `search-current` and `search-match` let
// styles.css mark a match that is also selected.
export const matchClass = (
  id: string,
  search: { all: ReadonlySet<string>; current: string | null }
) =>
  search.current == id
    ? "search-current bg-yellow-500/40 outline-2 -outline-offset-2 outline-yellow-700 dark:bg-yellow-500/15 dark:outline-yellow-500"
    : search.all.has(id)
      ? "search-match bg-yellow-500/20 outline-1 -outline-offset-2 outline-transparent forced-colors:outline-dashed dark:bg-yellow-500/10 dark:outline-yellow-500/60"
      : "";

/** The toolbar holding a search box. */
export const searchStrip = "flex h-7 shrink-0 items-center gap-1 border-b bg-strip px-2 text-xs";

// No ring: focus grows an underline from the centre, over the toolbar's border (as Fluent's input).
const underline =
  "relative flex min-w-0 flex-1 self-stretch after:pointer-events-none after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:scale-x-0 after:bg-ring/70 after:transition-transform after:duration-200 after:ease-out focus-within:after:scale-x-100 motion-reduce:after:transition-none";

/** The tab panel's search input nearest to `from`: in its closest ancestor that holds one. */
const nearestSearch = (scope: Element, from: Element) => {
  const inputs = [...scope.querySelectorAll<HTMLInputElement>("input[type='search']")];
  for (let at: Element | null = from; at; at = at == scope ? null : at.parentElement) {
    const here = at;
    const found = inputs.find((input) => here.contains(input));
    if (found) return found;
  }
  return inputs[0] ?? null;
};

/**
 * Ctrl+F (Cmd+F) with focus anywhere in the input's tab panel goes to the input, not the browser's
 * find. A tab with several (a pane with its own search): to the one nearest the focus.
 */
const findShortcut = (input: HTMLInputElement | null) => {
  const scope = input?.closest("[role='tabpanel']");
  if (!input || !scope) return;
  const onKeyDown = (event: Event) => {
    if (
      event instanceof KeyboardEvent &&
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      !event.shiftKey &&
      event.key.toLowerCase() == "f" &&
      nearestSearch(scope, event.target instanceof Element ? event.target : scope) == input
    ) {
      event.preventDefault();
      input.focus();
      input.select();
    }
  };
  scope.addEventListener("keydown", onKeyDown);
  return () => scope.removeEventListener("keydown", onKeyDown);
};

/**
 * A toolbar's search input, without a ring: an underline on focus, and Ctrl+F in its tab focuses it.
 * `className` is the wrapper's, the flex item in the toolbar.
 */
export const SearchInput = ({
  className,
  ...props
}: Omit<ComponentProps<"input">, "type" | "ref" | "className"> & { className?: string }) => (
  <span className={cn(underline, className)}>
    <input
      {...props}
      ref={findShortcut}
      type="search"
      className="min-h-6 min-w-0 flex-1 bg-transparent outline-none"
    />
  </span>
);

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
    <SearchInput
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
