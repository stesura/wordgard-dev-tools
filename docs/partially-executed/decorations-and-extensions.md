# Decorations, Extensions tab and keymap — plan

Status: PARTIALLY EXECUTED. Phase 9b done on 2026-11-06, see
[its implementation notes](#implementation-notes-phase-9b-2026-11-06), phase 10, see
[its notes](#implementation-notes-phase-10-2026-11-06), and phase 10b on 2026-11-07, see
[its notes](#implementation-notes-phase-10b-2026-11-07), and phase 11 on 2026-11-07, see
[its notes](#implementation-notes-phase-11-2026-11-07); phase 12 not started.
Drafted 2026-11-06, revised the same day after Fable reviews (see [Review](#review-2026-11-06)).
Follows the main plan ([plan.md](plan.md)), whose scope listed "facet inspector"
and "decorations view" as out of scope; the user asked for them (2026-11-06). Phases 9b–12
continue the main plan's numbering. Paths follow the current layout (CONTRIBUTING.md): the panel's
`tabs/<tab>/`, `lib/`, `guides/*.md`; unit tests in `__tests__/`, integration tests in `test/`.

## Why

Compared with `prosemirror-dev-tools`, what's missing is what the editor _adds_ to the document
and schema: decorations, the extensions behind them, the key bindings. None of it is in
`state.toJSON()`, the Structure or the Schema:

- Decorations aren't part of the doc or the schema. The schema has `spec.shape` (the default
  drawing); decorations are editor extensions (`wordgard/editor`, facet values in `state.config`).
  The DOM tab shows their output (widgets as "chrome", wrappers and attributes as plain DOM) but
  not where it comes from.
- Wordgard has four kinds ([decoration.ts](../../../wordgard/src/editor/decoration.ts)):

  | Kind         | What                                                                                                                              | Registered through                                                                                                         | Readable                                                                 |
  | ------------ | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
  | Tag          | Per node type: `Tag.shape`, `Tag.wrapper`, `Tag.widget` (before, after, start, end), `Tag.attribute`; per mark type: `Mark.shape` | Private facets (`tagShape`, `tagWrapper`, `tagWidget`, `tagAttribute`, `markShape`)                                        | Internals only                                                           |
  | Point        | At a position: `Point.widget`, `Point.attributes`, `Point.shape`, `Point.wrapper`                                                 | `Decoration.Point.source`: functions `state => PointSet` (its `combine` appends Wordgard's own node-selection source last) | Public: call each source, walk with `set.cursor()` until `value == null` |
  | Range        | Over a range: `Range.wrapper`, `Range.attribute`, with `query`, `scope`, `inclusive`                                              | `Decoration.Range.source`: functions `state => RangeSet`                                                                   | Public, the same way                                                     |
  | Widget shape | A node drawn as a widget (an image)                                                                                               | The node type's shape                                                                                                      | The node is in the Structure already                                     |

  `decoratePlots` (`plotdeco.ts`) is point and range sources over a private field each.

- Facets and widget types have no names. Sources are functions: `fn.name` names them when the app
  defined them as named consts (dev builds), otherwise "source #n". Logging one to the console
  lets Chrome jump to its definition: the best answer to "where does this come from?".

## Decisions

- **No Decorations tab.** Decorations go where the question is asked:

  | Question                                                                           | Where                                                   |
  | ---------------------------------------------------------------------------------- | ------------------------------------------------------- |
  | What's decorated now, and where?                                                   | Structure (phase 10)                                    |
  | What is this editor made of?                                                       | Extensions tab (phase 11), sources listing their output |
  | How do they behave over time (kept, updated or recreated; what the editor redrew)? | Log, per flush (phase 10b)                              |
  | What does the editor apply to this node type?                                      | Schema, Effective view (phase 12)                       |

  Revisit only if users want one flat list across sources. A Decorations tab with a per-update
  history was considered (2026-11-06) and folded into the Log: the history is per flush, the
  Log already keeps each transaction's states and numbers flushes, and its user events, timing and filters give the
  context.

- **Fields stays a tab** (its history). Extensions links to it.
- **One set module** (`sets.ts`, phase 9b): walking, comparing and serialising `PointSet` /
  `RangeSet`, shared by the Fields history (9b), the Structure (10) and the Log (10b). Sets are a
  general data structure in Wordgard, not only decorations.
- **On demand only**, as everything else: sources are called only while the Structure's
  decoration toggle is on or an Extensions source is expanded, once per state change (coalesced
  per frame by the store, as the selection is). That's the editor's own cost per update, once more.
- **Never call app code with made-up arguments.** Tag shape, widget and attribute functions are
  called only with a real node's tag (see phase 12).
- **Page side**: Wordgard values through namespace imports (`import * as wordgardEditor`), as the
  `imports.test.ts` rule requires; a missing export degrades that feature, it doesn't throw.
- **Internals are isolated** in one module (`internals.ts`), each read guarded (`in`, `typeof`),
  failing to "unknown", and listed under the main plan's open question 3:
  - Phase 10: the point/range value classes' fields (`widget`, `side`, `trackMode`, `attrs`,
    `elt`, `selector`, `shape`; ranges' `attribute`, `value`, `rank`, `spanning`, `query`, `scope`);
    `Elt.Selector` (`tag`, `classes`).
  - Phase 11: `FacetProvider` (`facet`, `value`, `flags`, `id`), `PrecExtension` (`inner`,
    `prec`), `CompartmentInstance` (`compartment`, `inner`), `Field.provides`,
    `Facet.extensions`, `Field.Derived`'s value.
  - Phase 12: the tag facets and `Command.Bound` (`command`, `param`).
- **Own HTML renderer** for decoration elements: `Elt.toHTML()` throws on an element holding a
  widget (it reads `attrs` on the widget). `renderElt` recurses over `children`: string, `0`
  (the hole, "…"), `Elt`, `Widget` ("⟨widget⟩"); guarded, "element" on failure.

## Phase 9b: sets

**Executed (2026-11-06)**, with deviations: see
[its implementation notes](#implementation-notes-phase-9b-2026-11-06).

Wordgard's `wordgard/set` module (`PointSet`, `RangeSet`) holds decorations, but also "other
data": Wordgard's own placeholder ([placeholder.ts:24](../../../wordgard/src/editor/placeholder.ts#L24))
and table cell selection ([cellselection.ts:9](../../../wordgard/src/table/cellselection.ts#L9))
fields, one field per `decoratePlots` call, and app fields (comments, search results, collab
cursors, tracked changes). Today `toSafe` has no case for them: the Fields tab's values and
previews and the Log's effect and annotation values show their internal chunk arrays. (The State
tab only sees a set when a field's own `toJSON` returns one.) Cheap, and phases 10 and 10b build
on it. Revised after a Fable review (see [Review of phase 9b](#review-of-phase-9b-2026-11-06)).

### Page side: `sets.ts`

One module for every set-aware feature, lazy with the serialisers (namespace import of
`wordgard/set`, exported by the package through `"./*"`; `instanceof` is safe: `wordgard/editor`
imports the same module instance). Add `"wordgard/set"` to `optimizeDeps.include` in
`packages/devtools/vitest.config.ts` and `packages/panel/vite.config.ts`.

- `isSet(value)`: `instanceof PointSet` / `RangeSet`.
- `walkSet(set, cap)`: entries through `cursor()` until `value == null` (a `RangeSet`'s layers
  come out merged), `{pos, side, value}` for points, `{from, to, value}` for ranges, and
  `{more: number, exact: boolean}`: the rest counted up to a bound (10× the cap), `exact: false`
  past it. Phase 10 calls it with its own cap.
- `compareSets(old, new, changes)`: **the** verdict, used per field change (here) and per flush
  and source (phase 10b):

  | Case                                                                                                  | Verdict                                                                                            |
  | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
  | same object, empty                                                                                    | **same set**                                                                                       |
  | same object, non-empty, `old.map(changes)` equal to `old` entry for entry (positions, value identity) | **same set** (nothing it holds moved: a mark-only change, changes past its end)                    |
  | same object, non-empty, otherwise                                                                     | **kept across a change that moved its positions** (amber)                                          |
  | new object, either side empty                                                                         | **updated** +a or −d (nothing could be shared)                                                     |
  | new object, values shared (`===`), counted by position                                                | **updated**: kept k, added a, dropped d (a `map`, a `modify`, or a rebuild from hoisted constants) |
  | new object, none shared                                                                               | **recreated**                                                                                      |

  The amber case is usually a bug (a field or source that forgot to `map`), but not always: sets
  whose positions aren't doc positions, or that are remapped where they're read. The verdict
  says what happened; the guide lists those cases. `map` returns the same set only for empty
  changes, and `PointSet.create([])` / `RangeSet.create([])` return the shared `empty`.

  - Changes: `changes.iterGaps((fromA, toA, fromB) => old.compareRange(fromA, new, fromB, toA -
fromA, add))`, the editor's own method, in a `try` (`compareRange` calls the values' `eq`;
    app values may lack it): `changes: null` on failure.
  - Bound: both sets are walked whole up to 20 000 entries each; past that, the counts are marked
    partial.

- `setPaths(doc, entry)`: the node an entry falls in (`pathAt` of a point, of a range's `from`),
  or `null` when the position is outside the document or resolving throws (bounds checked first,
  as `resolvePos` does): a stale set must not fail a reply. At a boundary between text leaves
  that's the parent plot, at 0 the doc; phase 10 adds the decoration rules on top.

### Page side: serialising and the Fields history

- `toSafe`: a set case after the `depth <= 0` branch, before `hasToJSON` and the generic object
  branch: `{"[PointSet]": [[pos, side, value]…], more, exact}` / `{"[RangeSet]": [[from, to,
value]…], more, exact}` (positions first, then the value; Wordgard's own tuples are `[value,
from, to]`, mind it in tests), capped at 200 entries, values at `depth - 1` as `Map` and `Set`
  entries are. `preview` (one line in the Fields list and every history row) shows a set as
  `PointSet(n)` / `RangeSet(n)`, without walking it past its count. Console logging stays live.
- Fields history: each change's verdict is `compareSets(tr.startState.field(field, false), value,
tr.changes)`. The previous value is the transaction's start state's, not the previous history
  entry (wrong after the 50-change cap, for the first entry, after a clear, or when a change was
  missed). `set: null` when either side isn't a set of the same kind (a field added by a
  reconfigure starts `undefined`). Computed once and stored on the `Change` (values and
  transactions are immutable): `fields` requests run on every state change while the tab is
  shown. Sets inside an object field aren't compared (its value only shows them).
- `fieldChange`'s result becomes `{value, set: SetChangeDetail | null}`: the added entries with
  paths against `tr.state.doc`, the dropped ones against `tr.startState.doc` (capped). Types in
  `protocol.ts` (`SetVerdict`, `SetChangeDetail`; phase 10b's `FlushDecorations` reuses
  `SetVerdict`). The result's shape changes, so `PROTOCOL` goes to 2 (an old panel would show the
  object as the value). The extension transport needs no change: no request gains a parameter.

### Panel

- Values: a set shows as a list of its entries (position or range, value) instead of JSON chunks;
  the JSON view shows the `toSafe` form. In the **live** value, clicking an entry's position
  sends the existing `resolve {id, pos}` (`parent.path`, plus `index` in text, is `pathAt`) and
  shows the node; a failed resolve says "outside the document". History values link only through
  the paths `fieldChange` sends (they refer to that transaction's documents).
- Fields history: a badge per change: "updated +2 −1", "recreated", "moved positions kept"
  (amber), "same set"; the change's pane lists what was added and dropped, linked.
- The set view goes in `components/set-view.tsx` (`lib/sets.ts` already exists: a `Set` toggle
  helper). Pure rendering of `value` / `FieldChange`; resolve on click is an event handler.
- Guides: the Fields guide explains the set view, the verdicts and the amber case's legitimate
  exceptions; then `npm run readme`.

### Tests

- Unit (`__tests__/sets.spec.ts`, Chromium): walk, cap, `more`/`exact`; `toSafe` on both kinds,
  nested in an object, past the cap, at depth 0; `preview`; `compareSets` on a mapped set, a
  `modify`, a recreated set, a set emptied by `map`, `empty` to non-empty, the same set after a
  doc change before its entries (amber), after a mark-only change and after a change past its
  end (same set), values without `eq` (`changes: null`); `setPaths` in text, between nodes, at 0,
  out of range (`null`).
- Integration (`test/`): a field holding a `RangeSet` mapped on each transaction and one that
  forgets to map: the set view, live entry links, history badges (amber on the second after
  typing before its ranges, not after typing past them), the `fieldChange` detail's linked
  added/dropped entries; the first history entry and one past the 50 cap have verdicts.

## Phase 10: decorations in the Structure

**Executed (2026-11-06)**, with deviations: see
[its implementation notes](#implementation-notes-phase-10-2026-11-06).

### Page side

- `decorations.ts` (lazy, with the serialisers): `decorations(state): DecorationsInfo`.
  - `state.facet(wordgardEditor.Decoration.Point.source)` and `…Range.source`: arrays of
    functions. Call each in a `try` (an error is reported per source, not thrown). Walk each set
    with `walkSet(set, 2000)` (phase 9b), so a runaway source isn't walked whole.
  - Kind: compare `value.constructor` with the constructors of decorations built once through
    the public factories: `Point.attributes({})`, `Point.wrapper(Elt.create("span",
Attributes.none, Elt.hole))`, `Point.shape(…)`, `Range.attribute("x", "")`,
    `Range.wrapper("span", {})`; widget: `"widget" in value && value.widget instanceof Widget`.
    The factories only allocate. No class names (minified builds). Unknown → `"decoration"`.
  - Details, each guarded: widget (`side`, `trackMode`, its param's `preview` with the usual
    depth and cycle limits), attributes (pairs), wrapper (`renderElt`, the target selector),
    shape (`renderElt`, or "widget"), range wrapper (tag, attrs, rank, spanning), range attribute
    (name, value), and for ranges `query` (named as the Schema names queries), `scope` (the const
    enum: Atom 1, InlineAtom 2, All 4, shown by name), `inclusiveStart`/`End`. A point's side
    `1e9` (`Side.After`) shows as "after".
  - Where, as Wordgard applies them (`DecoWalker.walk`, decoration.ts ~910):
    - **Widget point**: `pos` and `side`; the innermost node holding it (`pathAt`) and, inside a
      text leaf, the offset into its text.
    - **Attributes, shape, wrapper point**: applies to the node _starting_ at `pos`, and never to a
      text leaf. So only when `resolved.inText == 0 && nodeAfter && !nodeAfter.isText`; then its
      path is `[...plotPath(parent), index]` (not `pathFrom`, which double-counts in text and
      points past the end at a content end). Otherwise "applies to no node", a diagnostic worth
      showing. Several shapes at one position: the first within a source wins; across sources, not by
      source order (corrected in phase 10's notes);
      points inside an atom are skipped; both noted on the decoration.
    - **Range**: applies to nodes whose _start_ is in `[from, to)` (a parent that began before
      `from` is never decorated), that pass `scope` (Atom: `state.isAtom(type)`; InlineAtom: an
      inline atom; All: any) and `query` (`schema.matchNode(type, query)`); both public. A
      default `Range.attribute` over a paragraph decorates its text leaves, not the paragraph.
      Inexact only where a point or tag shape changes a node's atom-ness: the guide says so.
      Matched paths capped per decoration.
  - Sources: index, kind (point/range), `fn.name || null`, count, `more`, error. The last point
    source is Wordgard's node selection (`combine` appends it): `builtIn: true`, named "node
    selection" by position, not by function name.
- Requests: `decorations {id}`, `logDecoration {id, source, index?}` (the source function, or the
  live decoration value; `index` is its order in that source's walk, re-walked, so a changed
  state between list and log logs what's there now, labelled with its position).
- Extension transport: route both (`frames-transport.ts`).

### Panel

- `decorations-source.ts`: loads while the toggle is on; reloads on every `stateChanged` (not
  only `docChanged`: a source can depend on the selection), coalesced by the store's frame.
- Structure toolbar: a "Decorations" toggle (pressed button), saved like the dock. Off: nothing
  requested.
- On, in the boxes:
  - Widgets between nodes: small chips between child boxes, at their position (◆, side on hover).
  - Widgets inside a text leaf (cursor widgets, inline markers): the text box is split at the
    widget's offset and the chip drawn there; the leaf stays one box (one path) for selection,
    search and the menu.
  - Point attributes, shape, wrapper: a badge on the box of the node they apply to.
  - Ranges: a badge on each node they apply to.
  - Hovering a chip or badge highlights what it decorates (see open question 2).
- Node pane: a "Decorations" section listing those on the node (kind, source with its name,
  details), each with log and copy. Points that apply to no node are listed on the node holding
  their position, marked so.
- Status: "n decorations from m sources" in the toolbar while on; a source's error shows there.
- Guide: the Structure guide gets the toggle, and that ranges apply to nodes starting in them by
  scope and query.

### Tests

- Page side: a test editor with a named point source (widget, attributes, wrapper, shape), a range
  source (attribute with the default scope, wrapper with a query), `decoratePlots`, a source that
  throws. Cases: kinds and details; a point before a text leaf, mid-text and at a content end
  (applies to no node); a default-scope range over a paragraph (its text leaves); a wrapper and a
  shape holding a widget (rendered, no throw); two shapes at one position; names; the error; the
  node-selection source; the cap and `more`.
- Panel: toggle off → no request; on → chips (between nodes and mid-text) and badges, node pane
  section, reload after a selection-only change (a node selection's built-in decoration appears).

## Phase 10b: decorations in the Log

**Executed (2026-11-07)**, with deviations: see
[its implementation notes](#implementation-notes-phase-10b-2026-11-07).

Per flush, per source: did the source keep its set, update it, or recreate it, and what did the
editor have to redraw because of it. Needs phase 10's source walk and phase 9b's `compareSets`; independent of 11 and 12.
Revised after a Fable review (see [Review of phase 10b](#review-of-phase-10b-2026-11-06)).

### What the editor does (and so what we measure)

- The editor calls the sources **once per flush**, not per transaction (`DocTile.update`,
  tile.ts ~358: `getDecoSet(state)`), and compares with the sets it last drew
  (`findChangedRanges`, decoration.ts ~693). Transactions dispatched in one frame, appended ones
  included, share a flush: their intermediate states never reach the sources.
- It compares only over the **gaps** the changes left untouched: for each unchanged section,
  `old.compareRange(posA, new, posB, len, …)` (by `eq`, identical chunks skipped); a point counts
  as one position, widened to `pos + 1` unless it's a widget. Changed sections are redrawn anyway.
  It never maps the old set.
- So the unit is the **flush**: rows sharing `row.flush` (the Log already numbers them). From
  the flush's first recorded row's `startState` to its last row's `state`, with the changes
  composed over the flush's transactions. A row not yet drawn (`flush == null`) has no verdict
  yet. Rows the Log skipped (`select.pointer`, focus changes, while not recording) can make the
  first `startState` later than what the editor last drew: the verdict says so when the previous
  recorded row isn't in the previous flush.

### Verdict (public API)

- Per source, matched across the two states by function identity. Fallback: when a removed and
  an added source share index and kind and both lists have the same length, pair them ("same
  slot, new function": `derive` providers, a reconfigure calling `decoratePlots` again);
  otherwise "added" / "removed".
- The verdict and counts are `compareSets(old, new, flushChanges)` (phase 9b): same set, kept
  across a change that moved its positions (amber), updated (kept, added, dropped), recreated.

- **Changes**: what the editor redraws because of this source: `flushChanges.iterGaps((fromA,
toA, fromB) => old.compareRange(fromA, new, fromB, toA - fromA, add))`, the editor's own method
  (and so what range sets' layers do to it is what the editor sees too). Reported as a count and
  capped ranges, linking to the Structure.
- **Wasted**: updated or recreated, no decorations added or dropped, 0 changes. Wordgard's own
  node-selection source recreates a one-point set on each call while a node is selected: never
  counted as wasted (a one-point rebuild is cheaper than mapping).
- **Time**: shown only for updated and recreated sources (a field-backed source is ~0 here: its
  work is in the field's update, which dispatch timing covers), labelled "measured when shown,
  not when the editor ran it" (off-frame, cold).
- Caveats, in the guide: a source reading anything outside the state (a closure variable, `wg`,
  the DOM) gives today's answer for an old flush; field-backed sources are exact (fields are
  computed when a state is created, so calling them later has no side effect). The editor redraws
  everything when one of its global decoration facets changes; that's internal and not shown.

### Page side

- `entry` detail gains `decorations: FlushDecorations | null` (the flush's rows, and per source:
  name/index, kind, verdict, kept, added, dropped, changes (capped), `ms`, `error`), for the
  opened entry's flush only. Each source in its own `try`: a source that throws on an old state is
  "error" for that flush only.
- Row summaries are opt-in: `log {id, from, to, decorations?: boolean}` adds
  `decorationSummary: {wasted, updated, recreated, notMapped} | "pending"` to rows (a different
  name from the detail's `decorations`: `LogEntryDetail` extends `LogRow`). At most 100 flushes
  computed per request; the rest come back `"pending"` and the panel asks again.
- Cache the derived verdicts per flush, not the sets (500 retained sets of a rebuilding source on
  a big doc is too much); sets live only for the computation.
- `logEntry` part `"decorations"`: logs each source's sets before and after the flush, live.
- Extension transport: `frames-transport.ts` rebuilds the `log` request field by field: forward
  `decorations`.

### Panel

- Entry detail: a "Decorations" section for the entry's flush ("flush of n transactions"), one
  line per source: name, verdict, counts, changes (positions, link to the Structure with the
  toggle on), time.
- Log toolbar: a "Decorations" toggle, off by default (no cost). On: a full reload of the rows
  (kept rows have no summaries), then a badge on the flush's last row when a source was wasted
  ("↻ 0") or not mapped ("stale"), and filter flags "wasted decoration work" and "decorations not
  mapped". A row still `"pending"` is unknown to the filter, not a "no"; the status says
  "decorations checked for n of m flushes" until done.
- Guide: per flush, the verdicts, reference identity, changes in gaps only, the closure caveat,
  what the time measures.

### Tests

- Page side: sources that (a) keep a set in a field and map it, (b) recreate it each call,
  (c) rebuild from hoisted constants, (d) depend on the selection, (e) throw, (f) return the same
  non-empty set after a doc change (not mapped), (g) `decoratePlots` with a refresh predicate on a
  selection change (updated, 0 changes). Cases: a selection-only flush and a doc-change flush;
  two transactions in one flush (one verdict, changes over the composed changes); a node selection
  kept across a selection-only flush (not wasted); a skipped `select.pointer` row inside a flush;
  a reconfigure adding a source, and one re-creating its function (paired); counts by position;
  the 100-flush cap and `"pending"`; one throwing source doesn't fail the slice.
- Panel: the section on an opened entry; toggle off → no summaries requested; on → full reload,
  badge, filters, pending status.
- E2E (extension): toggle on → badge (the transport forwards `decorations`).

## Phase 11: Extensions tab

**Executed (2026-11-07)**, with deviations: see
[its implementation notes](#implementation-notes-phase-11-2026-11-07).

### Page side

- `extensions.ts`: `extensions(state): ExtensionNode`, the tree from `state.config.base`, walked
  as Wordgard's `flatten` does ([state.ts:787](../../../wordgard/src/state/state.ts#L787)).
  - **Two passes.** `flatten` keeps an extension's highest-precedence occurrence and drops the
    others (ties: the first); a later, higher one removes an earlier one. Pass 1 replays that
    (`known <= prec`) to find each extension's winning occurrence; pass 2 renders, labelling the
    others "duplicate (kept at high precedence)" and not walking them.
  - **Precedence as Wordgard propagates it**: `PrecExtension` sets it for its `inner`;
    `Field.provides` inherits the field's; `facet.extensions` (what a facet enables) is walked at
    default precedence whatever the provider's.
  - **Check order**: `PrecExtension`, `CompartmentInstance`, `GardState.Field`,
    `GardState.Field.Derived`, `FacetProvider` first, an object's `extension` last and only when
    non-null. `PrecExtension`, `CompartmentInstance` and `FacetProvider` all carry an own
    `extension: undefined`, and `Field.extension` returns the field itself. Anything else:
    "unknown extension" (Wordgard would throw; we don't).
  - Rows:
    - Array → a group (collapsed into its parent when it has one child).
    - Precedence → "highest / high / default / low / lowest" (`prec` 0–4).
    - Compartment → "compartment #n" (numbered by first sight) with its current content
      (`compartment.get(state) ?? inner`).
    - Field → its name (devtools `fields` option) or "field #n"; then `provides`, nested.
    - Derived field → "derived field #n".
    - `FacetProvider` → the facet's name if known, else "facet #n"; static (`flags & 1`, not
      `value != null`: `facet.of(null)` is static) with its value previewed, or "computed";
      then `facet.extensions`, nested.
    - An object with `extension` → its content, labelled by `constructor.name` when it isn't
      `Object` (dev builds).
  - **Caching**: the tree's shape on `state.config` (WeakMap, as `fields.ts`); resolved values
    per request (they change per state).
- **Fields link**: `findFields` (Fields tab) walks neither `Field.provides` nor `facet.extensions`.
  Extend it to walk them, so every field the Extensions tab shows has a Fields index (numbering
  stays shared). Derived fields aren't in the Fields tab: their rows show the value here.
- **Known facets**, from namespace imports, each guarded. Public statics:
  `Wordgard.editable`, `contentAttributes`, `editorAttributes`, `styleModule`, `scrollHandler`,
  `transactionListener`, `updateListener`, `cspNonce`, `coveredMargins`; the exported
  `clipboard…` facets, `pasteHandler`, `dropHandler`, `exceptionSink`, `cursorBlinkRate`,
  `mouseSelectionStyle`, `dragMovesSelection`, `colorScheme`; `Decoration.Point.source`,
  `Decoration.Range.source`; `KeyBinding.source`, `KeyBinding.useDefaultKeymap`;
  `GardState.readOnly`, `schemaElement`, `textLTR`, `textblockLTR`, `visualCursorMotion`;
  `Transaction.extender`, `Transaction.appender`; `Panel.show`, `Tooltip.show`, `Menu.source`
  (each where exported). Not exported, so "facet #n" by design: `theme`, `eventHandler`,
  `eventObserver`, `editorPlugin`, `inputRule`, `commandHandler`, `panelConfig`, `tooltipConfig`,
  `placeholderShape`, `barTemplate`; the guide says so. A known facet's resolved value
  (`state.facet(f)`) shows on its first row.
- **Decoration sources**: static `Point.source`/`Range.source` providers map to their index by
  `state.facet(source).indexOf(provider.value)` and expand to that source's output (phase 10's
  walk). Computed providers (`derive`/`from`: `value` null) show "computed", no expansion.
- **The editor's own config**: when the DOM's direction disagrees with the state's, Wordgard
  appends a highest-precedence compartment holding `textLTR` (editor.ts ~341). Reload on
  `reconfigured` picks it up; the guide explains it.
- Requests: `extensions {id}` (the tree, values previewed, size-capped), `logExtension {id, path}`
  (the live extension object, or a known facet's resolved value). Routed in
  `frames-transport.ts`.

### Panel

- Tab "Extensions" after Fields: a tree (the State tab's tree component and search), a pane with
  the selected row's details and log/copy. Reloads on `reconfigured` (the store's
  `configListeners`), and a source's output on `stateChanged` while expanded.
- Links: field rows → Fields tab; source output → Structure (with the toggle on); the Log's
  "reconfigured" entries → this tab.
- Guide in `guides.ts` (and the README via `npm run readme`): precedence, duplicates, why most
  facets are "facet #n", the editor's own direction compartment.

### Tests

- Page side: nested arrays, each precedence, a compartment reconfigured, a field with `provides`,
  a facet with `enables`, `facet.of(null)`, a duplicate kept at a later, higher precedence
  (`[a, prec.high(a)]`: the second is kept), known and unknown facets, an unknown object; the
  cache per configuration with values per state. `findFields` now finds `provides`d fields.
- Panel: the tree, a reconfigure reloads it, links to Fields and Structure.

## Phase 12: tag decorations in the Schema; keymap

### Tag decorations (internals)

- `internals.ts`: get the private facets from a provider built through the public factory:
  `Tag.wrapper(type, Elt.create("span", Attributes.none, Elt.hole))`, `Tag.widget(…)`,
  `Tag.attribute(…)`, `Tag.shape(type, () => widget)` (a function shape: with a constant shape on
  a plot type it returns `[provider, isAtom provider]`), `Decoration.Mark.shape(…)` (needs a mark
  type: the schema's first, or `Mark.Type.define("x", {shape: {element: "span"}})` when it has
  none). Take `.facet`, guarded; an array's first element. A missing one leaves that part out.
- Resolved values with `state.facet(f)`: `tagShape` and `markShape` are `Map`s by type, the
  others arrays of `{type, …}`. A widget's place is a const enum (Before 0, After 1, Start 2,
  End 3).
- **Functions of the tag.** `tagShape` values are always functions (a constant is wrapped
  `() => shape`, a function memoised, and the memo throws on `undefined` after calling the app's
  function with it); `tagAttribute.value` too; `tagWidget.widget` may be. So: find a node of that
  type in the document (`doc.iterate`, first match) and call with its `tag` (memoised per tag:
  harmless); show "for the node at n". No such node: "function (no node of this type to evaluate
  it on)". Never call with a made-up tag.
- `SchemaInfo` gains, per node type, `decorations: {shape?, wrappers[], widgets[], attributes[]}`
  (shapes and wrappers by `renderElt`, widgets as place and param preview) and `atom`
  (`state.isAtom(type)`, public: `Tag.shape` on a plot adds an `isAtom` override); per mark type
  `shape?`.
- Schema: the Effective view adds them, each commented "decoration" (a new note); a shape
  override and a changed atom-ness are highlighted as overrides are. Cards get a "decorated" tag
  (filterable) and a one-line summary. The schema reloads on reconfigure already.
- Extensions tab: tag facet rows get their names ("Decoration.Tag.wrapper" …). This is the only
  part of phase 12 that needs phase 11.

### Keymap (public)

- `state.facet(KeyBinding.source)`, then `KeyBinding.defaultKeymap` when
  `state.facet(KeyBinding.useDefaultKeymap)`: the order of Wordgard's own `keymap` field
  (keymap.ts:109). For a key, the first binding whose command returns true wins.
- Each binding: `key`, the platform's (`mac`/`win`/`linux`) when set; `Mod-` expanded by the
  platform check Wordgard uses (`navigator.platform`: Mac, Win, Linux/X11), since
  `normalizeKeyName` and `currentPlatform` aren't exported; `char` bindings; `any` handlers
  ("any key"); `shift` (the second binding); command name (`fn.name`; a bound command: its
  `command`'s name and `param` preview, internals); `description` and `shiftDescription`
  (strings, or `PhraseSet.Ref`s resolved by calling with the state); `group` (its description,
  resolved the same way); `allowDefault`; from the default keymap or not.
- Shown in the Extensions tab as a "Key bindings" section: searchable by key or command, log the
  command (jump to its definition).

### Tests

- Tag decorations: a constant `Tag.shape` on a plot type (array return), a function shape with
  and without a node of its type in the doc (called with a real tag; never with `undefined`), a
  tag wrapper holding a widget, a tag widget at each place, a tag attribute, `Mark.shape`, a
  schema with no mark types.
- Keymap: custom bindings before the default keymap, `useDefaultKeymap` off, platform keys,
  `Mod-`, `char`, `any`, a bound command, a `PhraseSet.Ref` description.

## Open questions

1. ~~Range decorations: mark the range, or the nodes they apply to?~~ Settled by the review: the
   nodes they apply to, matched with public `isAtom` and `matchNode` (phase 10).
2. Highlighting a widget or a range: `highlight` takes a node path. Add `highlightRange {from, to}`
   (client rects of `domAtPos` ranges, as text leaves already do)?
3. Extensions tab on a big configuration (hundreds of providers): fine for a tree; no
   virtualisation planned.
4. Ask Wordgard's author to export the tag facets (or a debug listing), so phase 12 needs no
   internals.

## Review (2026-11-06)

Fable reviewed the first draft against Wordgard's source. Every finding was checked and accepted;
the plan above includes them:

1. Tag functions were to be called without a tag: the memo calls the app's function with
   `undefined`, then throws. Now called with a real node's tag only.
2. `Tag.shape` with a constant shape on a plot type returns an array, not a provider. Use a
   function shape; `Mark.shape` needs a mark type.
3. `Elt.toHTML()` throws on an element holding a widget. Own renderer.
4. Duplicates: Wordgard keeps the highest-precedence occurrence, not the first. Two passes.
5. Ranges apply to nodes starting in them, by scope (default: atoms) and query, not to every node
   they touch. Matched with public API; settles open question 1.
6. Points apply only to a non-text node starting exactly at them; `pathFrom` was wrong there.
7. Keymap fields: `allowDefault` (not `preventDefault`/`stopPropagation`), `char`, `any`,
   `shiftDescription`, `PhraseSet.Ref` descriptions; `Mod-` needs our own platform check.
8. Fields reached through `provides`/`enables` weren't in the Fields tab: `findFields` extended.
9. Static providers can have a null value: use the flags. Computed sources can't be expanded.
10. Check order: several internal classes carry an own `extension: undefined`.
11. Known facets: `theme`, `eventHandler`, `eventObserver` aren't exported; several were missing.
12. The editor appends its own direction compartment.
13. Widgets inside a text leaf had no place in the boxes: the text box is split at the offset.
14. Cache the tree per configuration but values per state; bound the walk, not only the reply.
15. Minor: side `1e9` shows as "after"; `Elt.Selector` is internal; routing; `isAtom` in the
    Effective view; the missing tests.

## Review of phase 10b (2026-11-06)

Fable reviewed the first draft of phase 10b. Every finding was checked against Wordgard's source
and accepted; the section above includes them:

1. The editor calls sources once per flush, not per transaction: verdicts are per flush.
2. The editor compares only over the changes' gaps, without mapping: `iterGaps` + `compareRange`.
3. "Doc unchanged and a new set ⇒ rebuilt" was wrong: Wordgard's own node-selection source,
   `image.ts`'s resize handles and `decoratePlots`' refresh produce new sets legitimately. New
   verdicts: same set / updated / recreated; the node-selection source is never "wasted".
4. A missing case: the same non-empty set after a doc change is "not mapped" (stale positions).
5. Turning row summaries on must reload kept rows; filters treat pending rows as unknown; at most
   100 flushes per request; cache verdicts, not sets; skipped rows break the state chain (cost
   only).
6. Function identity breaks for `derive` providers and re-run extension functions: pair by slot.
7. Range sets' layers can differ between a mapped and a rebuilt set: with (2) that's what the
   editor redraws too.
8. The extension transport rebuilds the `log` request: forward the flag; the row field is
   `decorationSummary`, not `decorations` (the detail extends the row).
9. Time is ~0 for field-backed sources: shown only for updated and recreated ones.
10. One throwing source mustn't fail the slice; counts by position.
11. The missing tests.

## Review of phase 9b (2026-11-06)

Fable reviewed phase 9b. Every finding was checked against the code and accepted; the section
above includes them:

1. "Not mapped" fired on mark-only changes and changes past a set's end, where keeping the set
   is correct. The rule is now exact (`old.map(changes)` compared entry for entry), worded "kept
   across a change that moved its positions", with its legitimate exceptions in the guide; 10b
   defers to it.
2. Entry links had no source of paths: live values resolve on click; history entries carry
   paths computed against that transaction's documents.
3. `fieldChange`'s result changes shape: new types in `protocol.ts`, `PROTOCOL` 2.
4. Stale positions must not throw: `setPaths` returns `null`.
5. The previous value is `tr.startState`'s, not the previous history entry.
6. `compareRange` calls `eq` (guarded) and the comparison walk is bounded.
7. Emptied or first-filled sets read "updated", not "recreated".
8. `toSafe` form: one order (positions, then value), branch placement, `more`/`exact`; `preview`
   shows only the count.
9. The State tab rarely sees a set (fields' own `toJSON`): claim reworded.
10. Verdicts memoised on the history's `Change`.
11. Phase 10 uses `walkSet` instead of restating it.
12. `lib/sets.ts` exists in the panel (name the view differently); `optimizeDeps`; README
    regeneration.

## Implementation notes: phase 9b (2026-11-06)

**Executed.** Checks: `format:check`, `typecheck`, `lint`, `dependency-check`, `build`,
`compiler:check` pass; tests: devtools 106, panel 204, extension 25, all passing.

### How it works

- Page side `sets.ts` (lazy, with the serialisers): `asSet` (guarded `instanceof` through the
  `wordgard/set` namespace), `walkSet` (cursor walk, cap, count bound, `exact`), `compareSets`
  (the verdict table of phase 9b; changed ranges from `changes.iterGaps` + `compareRange`, sorted
  and merged at the end since a range set's layers are compared one after another), `verdictOf`.
- `serialise.ts`: `toSafe` has a set branch (`{"[RangeSet]": [[from, to, value]…]}`, points
  `[pos, side, value]`, 200 entries) with the cap threaded through its recursion; `preview` shows
  `RangeSet(n)` (counted up to 2000); `pathIn` is `pathAt` returning null outside the document.
- `fields.ts`: each history change's verdict is computed once (`Change.set`), against
  `tr.startState.field(field, false)`. `fieldChange` returns `{value, set}`; `PROTOCOL` is 2.
- Panel: `lib/set-value.ts` (`readSet`, `placeOf`), `components/set-view.tsx` (`SetView`,
  `SetVerdictBadge`, `SetChange`). The Fields value shows a set's entries; a position resolves
  (`resolve`) and shows its node. History rows carry the verdict badge; an expanded set change
  lists added and dropped entries. Guide and README updated.

### Deviations

- **Unmapped set fields are recorded in the history.** It recorded only value changes, so a field
  that forgot to `map` (its value unchanged) never appeared and the amber verdict could never
  show. A doc change that leaves a set field's value identical is recorded when `compareSets`
  says "moved". Cost: a map and two walks per such field per doc-changing transaction, while
  tracking.
- **History entry links only while their document is the current one** (page side checks
  `tr.state.doc === wg.state.doc`; the panel caches a change's detail per load, so the check is
  redone). Dropped entries are never linked (an older document).
- **`more` / `exact` only when a set was cut short.**
- **The amber badge reads "kept, not mapped"**: the rule also covers deletions that should have
  dropped entries, not only moves.

### Audit (Fable)

Accepted and fixed:

1. The panel cached a change's detail forever, so added-entry links went stale after typing: the
   cache key includes the field's load version.
2. Changed ranges from a range set's layers arrived out of order and were counted twice: sorted
   and merged at the end. Tested (overlapping ranges in two layers).
3. A failed position resolve kept showing after selecting another field: the error is kept per
   field.
4. "Moved" also covers removals: reworded (badge, guide, protocol comment).
5. `walkSet(set, 0)` had a zero count bound: at least 10.
6. Test gaps: point sets, a stale set whose positions don't fit, the walk's partial bound,
   `toSafe`'s `exact: false`, a mark-only change not recorded, `last` carrying the verdict, the
   node a panel link selects.

Not acted on: the cost notes (within the scope: huge documents are out of it), and the badge's
`tabIndex` on a role-less element (it gives the tooltip to keyboard users).

### Open points

- Phase 10's `walkSet` call and 10b's `compareSets` call are ready; 10b's flush-level comparison
  passes the flush's composed changes.

## Implementation notes: phase 10 (2026-11-06)

**Executed.** Checks: `format:check`, `lint`, `dependency-check`, `build`, `compiler:check` pass;
tests: devtools 110, extension 25, panel 219 of 220. Not from this phase: `typecheck` fails on
`packages/panel/test/log.test.ts` and the panel's `mount.test.ts` expects the Structure guide's old
summary, both from other uncommitted work in progress.

### How it works

- Page side `decorations.ts` (lazy): sources from `Decoration.Point.source` and `…Range.source`
  (guarded; the last point source is Wordgard's node selection), each called in a `try` and walked
  with `walkSet` (2000 decorations per request). Kinds by constructor, from decorations built with
  the public factories. Details from the decorations' internal fields, guarded; elements by
  `renderElt`. Where: a widget's holder and offset; a point's non-text node starting at it; a
  range's nodes starting in it that its scope and query admit (`state.isAtom`,
  `schema.matchNode`), not descending into atoms; notes for no node, inside an atom, several
  shapes. Requests `decorations`, `logDecoration`. `schema.ts`'s naming is `createQueryNamer`,
  shared with the Schema tab.
- Panel: the Structure toolbar's "Decorations" toggle (saved, off by default; nothing requested
  while off) loads on every state change while shown. Boxes: ◆ widgets between children (an empty
  node holding one opens to show it) and inside text at their offset (a text over 200 characters
  keeps its preview, its widgets after it), ◇ n badges. The node pane lists a node's decorations
  (`NodePane` takes children); with none focused, the document's. Toolbar status with source
  errors. Guide and README.

### Deviations

- **No hover highlight** for chips and badges: `highlight` takes a node path (open question 2).
  Clicking a box outlines its node.
- **`DecorationInfo.at`**, the node holding a decoration's position, so one that applies to no
  node is listed there.
- **Several shapes at one position**: within a source the first wins; across sources Wordgard
  keeps the last its cursor yields (`compareSetPrec` is used as a boolean), which isn't source
  order. Noted as such, not as "the earlier source wins" (the plan's assumption).
- The toggle is a text button.

### Audit (Fable)

Accepted and fixed:

1. "An earlier shape here wins" was wrong across sources (see Deviations). Tested both cases.
2. Range nodes descended into atom plots, where Wordgard draws nothing: the walk stops at atoms.
3. A widget in an empty node (a placeholder in an empty paragraph) wasn't drawn: the node opens to
   show it. Tested.
4. Document-level decorations (widgets between blocks, points at the end) were listed nowhere:
   the pane lists them with no node focused. Tested.
5. Widgets inside an atom were drawn as if Wordgard drew them: listed, not drawn.
6. Minor: a long text with a widget printed in full (now truncated); a Wordgard without the
   source facets failed the request (now an empty list).

Not acted on: the frame where a document change's structure and decorations replies land apart
(transient); the badges and chips being hover-only (the pane lists everything, keyboard
included).

### Open points

- Open question 2 (`highlightRange`) stays open.
- No test of an atom plot under a range (basicSchema has none).
- The extension e2e doesn't cover `decorations` / `logDecoration`.

## Implementation notes: phase 10b (2026-11-07)

**Executed.** Checks: `format:check`, `lint`, `typecheck`, `dependency-check`, `build`,
`compiler:check` pass; tests: devtools 129, panel 235, extension 26, e2e 11, all passing.

### How it works

- Page side `flushes.ts` (lazy): `pairSources` (by function; a leftover of one kind in the same
  place pairs as `slot` when both lists are as long; else `added` / `removed`),
  `flushDecorations` (the flush's changes composed; per source, `compareSets` from `sets.ts`;
  changed ranges with paths in the flush's last document; `ms` for new sets), `summaryOf`,
  `logFlushDecorations`. `decorations.ts` exports its source walk (`sourcesOf`, `sourceName`,
  `sourceLabel`); `sets.ts` exports `redrawn` (the editor's gap comparison over several pairs).
- `log.ts`: verdicts cached per flush (not the sets), checked against the flush's first held row
  and the row before it, pruned on trim and clear. `log {decorations: true}` adds
  `decorationSummary` to rows: newest flushes first, 100 uncached per request, the rest
  `"pending"`; `null` for rows not drawn. `entry` carries `decorations`; `logEntry` part
  `"decorations"` logs each source's sets before and after. `PROTOCOL` 3.
- Extension: `frames-transport.ts` forwards `decorations`.
- Panel: the Log's "Decorations" toggle (saved, off by default; switching on reloads every row,
  and the source asks again while rows are pending; status "decorations checked for n of m
  flushes"). Badges `↻ 0` and `stale` on the last shown row of a flush; filter chips `wasted` and
  `stale` (pending rows shown). The entry pane's Decorations section (`flush-decorations.tsx`):
  per source its match, verdict badge, `wasted`, time, error and redrawn positions, which open
  the Structure with its decorations on (`store.showNode(…, {decorations: true})`). Guide
  `log-decorations.md`, shown beside the toggle.
- Demo: the left editor has a source that rebuilds a widget on every call, so the e2e shows a
  wasted badge.

### Deviations

- **The wasted rule.** The plan's "no decorations added or dropped" would never flag a recreated
  set (counted by identity) and would flag a correct `map`. Wasted is now: a new set (updated or
  recreated) of a source matched by function, nothing for the editor to redraw, the old set
  mapped equal to the new one by position and `eq`, and, across a document change, an entry
  rebuilt outside the top-level blocks the changes touched (a rebuild inside them is
  incremental: `decoratePlots` recreates the plots a change falls in). Across a document change,
  a set rebuilt from the same values can't be told from a map: only flushes that change no
  document catch it. The guide says so.
- **`gapBefore`** compares states (the recorded row before the flush leaves the state the flush
  starts from), not flush numbers: flushes are numbered only when they draw a recorded row.
- **A flush whose transactions don't chain** (a doc change between them wasn't recorded) gets no
  verdicts, with an error: its changes are unknown.
- **Slot pairs**: verdicts and counts compare the two sets, but the redrawn positions are the
  editor's (old and new each against empty: it pairs sets by function); never wasted.
- **Added and removed sources** are compared with an empty set (what the editor does), so they
  show as updated with their counts.
- **Links**: `LogSlice.currentFrom` (new) says which rows leave the editor's current document;
  positions link only then, and the page is asked again on click (an edit while not recording
  pushes nothing to the Log).
- The toggle is a text button; filter flags are named `wasted` and `stale`.

### Audit (Fable)

Accepted and fixed:

1. Slot pairs were judged as if the editor compared old with new; it pairs by function and
   redraws both. Fixed and tested (equal sets in a new function: redrawn, not wasted).
2. Wordgard's `decoratePlots` was flagged as wasted on every edit inside a decorated plot (it
   recreates that plot's decorations). Rebuilds inside the touched blocks are spared. Tested.
3. Typing can't tell a same-value rebuild from a map: documented in the guide and here.
4. Badges went missing when a flush's last row was filtered out: they go on its last shown row.
5. Link currency was a snapshot (recording, no later doc change): replaced by `currentFrom`,
   checked again on click. Tested.
6. Test gaps: the cache on trim and clear, the "wasn't recorded" error, slot pairs with equal
   sets, `flushesChecked`.

Not acted on:

- The `PROTOCOL` bump "makes installed extensions refuse un-upgraded pages": nothing was
  published (no tags, version 0.0.0), and both packages ship together.
- A request can work out one flush past the budget (a cached flush whose first row was trimmed is
  recomputed): harmless.
- The status line re-announces on each request round while checking: brief, and it says how far
  it got.
- The panel test that waits for the status to clear doesn't prove it appeared (it's shown for one
  frame between requests); `flushesChecked` is unit-tested instead.

### Open points

- No panel test for a badge moved to the last shown row by a filter.
- The time is measured cold, off-frame: only indicative.

## Implementation notes: phase 11 (2026-11-07)

**Executed.** Checks: `format:check`, `lint`, `typecheck`, `dependency-check`, `readme:check`,
`build`, `compiler:check` pass; tests: devtools 135, panel 241, extension 27, e2e 11, all passing.

### How it works

- Page side `internals.ts`: guarded readers of `PrecExtension`, `CompartmentInstance`,
  `FacetProvider` (static by `flags & 1`), `facet.extensions`, `Field.provides`, and the field
  classes.
- `extensions.ts` (lazy): `keptOccurrences` replays `flatten` (keyed by each occurrence's walk
  path) to find what Wordgard keeps and at which precedence; the tree renders kept occurrences,
  and dropped ones as `duplicate` rows that only walk into what they hold that Wordgard keeps.
  One-item arrays show in their parent's place. Labels: precedence names, `compartment #n`,
  `facet #n`, `derived field #n` (numbered page-wide by first sight), field names (the devtools
  `fields` option, else the Fields tab's `field #n`), exported facets by name, class names of
  objects with an `extension`. Static facet values previewed, else "computed". Static decoration
  sources carry the `decorations` request's source index; an exported facet's first row its name.
  The tree is cached per configuration (and field names), capped at 5000 rows.
- `fields.ts`: `findFields` walks what fields provide and facets enable; `fieldsOf` is the one
  numbering for both tabs.
- Requests `extensions {id}`, `extension {id, path}` (a row's values now: a field's or derived
  field's value, an exported facet's resolved value), `logExtension {id, path, resolved?}`;
  routed in `frames-transport.ts`.
- Panel `tabs/extensions/`: a virtualized tree (search, expand/collapse, keys as in the State
  tab), reloaded on reconfigure; a pane with the row's kind, precedence, values now (reloaded on
  each state change), log, copy, "Show in Fields" (`store.showField`), and a decoration source's
  decorations, each linking to the Structure with decorations on. The Log's reconfigured entries
  link to the tab. Guide `extensions.md`, README regenerated, `docs/screenshots/extensions.png`
  (`scripts/screenshots.ts` takes tab names now).

### Deviations

- **Own tree**, not the State tab's: tabs can't import each other, and moving the State tab's
  into `components/` would have touched other uncommitted work there.
- **Values now in a separate request** (`extension`): the tree depends only on the
  configuration, so it reloads on reconfigure only; the selected row's values on state changes.
- **A source's output in the pane**, not as tree children.
- **Menu.source** is named through `wordgard/command` (already in the bundle through
  `wordgard/editor`).
- An unknown object can't be tested through `Wordgard.create` (Wordgard throws on it); its row is
  "unknown extension" with the value previewed.

### Audit (Fable)

Accepted and fixed:

1. A dropped array holding a kept occurrence recursed forever (stack overflow on
   `[shared, prec.high(shared)]` when `shared` holds something already kept): dropped rows now
   walk their items by the paths the replay recorded. Tested with the audit's cases.
2. A dropped row was described as if kept (value, facet name, source, field link; the kept row
   lost its resolved value): dropped rows now only walk their children. Tested.
3. `as const` (twice): replaced by typed declarations.
4. A failed row's error stayed under the next row selected: cleared.
5. Test gaps: the re-walk cases (a shared array and a nested precedence used at two
   precedences); a misnamed test renamed.

Not acted on: the plan update (done here).

### Open points

- After a reconfigure, the selected row's path may point at another extension: the pane shows
  that one.
- Phase 12's tag facet names in this tab are still to come.
