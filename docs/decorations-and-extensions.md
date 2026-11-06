# Decorations, Extensions tab and keymap — plan

Status: NOT EXECUTED. Drafted 2026-11-06. Follows the main plan
([partially-executed/plan.md](partially-executed/plan.md)), whose scope listed "facet inspector"
and "decorations view" as out of scope; the user asked for them (2026-11-06).

## Why

Compared with `prosemirror-dev-tools`, what's missing is what the editor _adds_ to the document
and schema: decorations, the extensions behind them, the key bindings. None of it is in
`state.toJSON()`, the Structure or the Schema:

- Decorations aren't part of the doc or the schema. The schema has `spec.shape` (the default
  drawing); decorations are editor extensions (`wordgard/editor`, facet values in `state.config`).
  The DOM tab shows their output (widgets as "chrome", wrappers and attributes as plain DOM) but
  not where it comes from.
- Wordgard has four kinds ([decoration.ts](../../wordgard/src/editor/decoration.ts)):

  | Kind | What | Registered through | Readable |
  |---|---|---|---|
  | Tag | Per node type: `Tag.shape`, `Tag.wrapper`, `Tag.widget` (before, after, start, end), `Tag.attribute`; per mark type: `Mark.shape` | Private facets (`tagShape`, `tagWrapper`, `tagWidget`, `tagAttribute`, `markShape`) | Internals only |
  | Point | At a position: `Point.widget`, `Point.attributes`, `Point.shape`, `Point.wrapper` | `Decoration.Point.source`: functions `state => PointSet` (its `combine` appends Wordgard's own node-selection source) | Public: call each source, walk with `set.cursor()` |
  | Range | Over a range: `Range.wrapper`, `Range.attribute`, with `query`, `scope`, `inclusive` | `Decoration.Range.source`: functions `state => RangeSet` | Public, the same way |
  | Widget shape | A node drawn as a widget (an image) | The node type's shape | The node is in the Structure already |

  `decoratePlots` (`plotdeco.ts`) is point and range sources over a private field each.
- Facets and widget types have no names. Sources are functions: `fn.name` names them when the app
  defined them as named consts (dev builds), otherwise "source #n". Logging one to the console
  lets Chrome jump to its definition: the best answer to "where does this come from?".

## Decisions

- **No Decorations tab.** Decorations go where the question is asked:

  | Question | Where |
  |---|---|
  | What's decorated now, and where? | Structure (phase 10) |
  | What is this editor made of? | Extensions tab (phase 11), sources listing their output |
  | What does the editor apply to this node type? | Schema, Effective view (phase 12) |

  Revisit only if users want one flat list across sources.
- **Fields stays a tab** (its history). Extensions links to it.
- **On demand only**, as everything else: sources are called only while the Structure's
  decoration toggle is on or an Extensions source is expanded, once per state change (coalesced
  per frame by the store, as the selection is). That's the editor's own cost per update, once more.
- **Page side**: Wordgard values through namespace imports (`import * as wordgardEditor`), as the
  `imports.test.ts` rule requires; a missing export degrades that feature, it doesn't throw.
- **Internals are isolated** in one module (`internals.ts`), each read guarded (`in`, `typeof`),
  failing to "unknown", and listed under the main plan's open question 3. Phases 10 and 11 need
  only: the point/range value classes' fields, `FacetProvider` (`facet`, `value`),
  `PrecExtension` (`inner`, `prec`), `CompartmentInstance` (`compartment`, `inner`),
  `Command.Bound` (`command`, `param`). Phase 12 adds the tag facets.

## Phase 10: decorations in the Structure

Public API, plus the value classes' fields.

### Page side

- `decorations.ts` (lazy, with the serialisers): `decorations(state): DecorationsInfo`.
  - `state.facet(wordgardEditor.Decoration.Point.source)` and `…Range.source`: arrays of
    functions. Call each in a `try` (an error is reported per source, not thrown). Walk the set
    with `cursor()` until `value == null`.
  - Kind: compare `value.constructor` with the constructors of decorations built once through
    the public factories (`Point.attributes({})`, `Point.wrapper(Elt…)`, `Point.shape(…)`,
    `Range.attribute("x", "")`, `Range.wrapper("span", {})`; widget: `"widget" in value &&
    value.widget instanceof Widget`). No class names (minified builds). Unknown → `"decoration"`.
  - Details, each guarded: widget (side, trackMode, its param's `preview`), attributes (pairs),
    wrapper (`elt.toHTML()`, the target selector), shape (`toHTML()` for an `Elt`, "widget" for a
    widget), range wrapper (tag, attrs, rank, spanning), range attribute (name, value), and for
    ranges `query` (as the Schema names queries), `scope`, `inclusiveStart`/`End`.
  - Where: a point's `pos` and `side`, with the path of the node after it (`pathFrom`, for
    attributes, shape and wrapper, which apply to it) or of the innermost node holding it (for a
    widget: `pathAt`). A range's `from`/`to`, with the paths of the nodes it touches, outermost
    first, capped.
  - Sources: index, kind (point/range), `fn.name || null`, count, error. The last point source is
    Wordgard's node selection (`combine` appends it): `builtIn: true`, named "node selection".
  - Cap: 2000 decorations per request, `more` counting the rest. Huge documents are out of scope
    (memory: developer tool).
- Requests: `decorations {id}`, `logDecoration {id, source, index?}` (the source function, or the
  live decoration value; `index` is its order in that source's walk, so it's re-walked: a
  changed state between list and log logs what's there now, labelled with its position).
- Extension transport: route both (`frames-transport.ts`).

### Panel

- `decorations-source.ts`: loads while the toggle is on; reloads on every `stateChanged` (not
  only `docChanged`: a source can depend on the selection), coalesced by the store's frame.
- Structure toolbar: a "Decorations" toggle (pressed button), saved like the dock. Off: nothing
  requested.
- On, in the boxes:
  - Widgets: small chips between child boxes, at their position (◆, side shown on hover), in
    the parent's content; inline widgets inline, between text leaves.
  - Point attributes, shape, wrapper: a badge on the box of the node after the point.
  - Ranges: a badge on each node they touch, and a thin band along the touched boxes.
  - Hover a chip or badge: `highlight` the node (widgets: the node holding them, until a
    `highlight` by position exists; see open points).
- Node pane: a "Decorations" section listing those on the node (kind, source with its name,
  details), each with log and copy.
- Guide: the Structure guide gets a line about the toggle.
- Status: "n decorations from m sources" in the toolbar while on; a source's error shows there.

### Tests

- Page side: a test editor with one named point source (widget, attributes, wrapper, shape), one
  range source (attribute, wrapper with a query), `decoratePlots`, a source that throws: kinds,
  details, paths, names, error, the node-selection source, the cap.
- Panel: toggle off → no request; on → chips and badges, node pane section, reload after a
  selection-only change (a node selection's built-in decoration appears).

## Phase 11: Extensions tab

### Page side

- `extensions.ts`: `extensions(state): ExtensionNode` — the tree from `state.config.base`, walked
  the way Wordgard's `flatten` does ([state.ts:787](../../wordgard/src/state/state.ts#L787)), cached
  per configuration:
  - Array → a group (collapsed into its parent when it has one child).
  - `PrecExtension` → "precedence: highest / high / default / low / lowest" (`prec` 0–4).
  - `CompartmentInstance` → "compartment #n" (numbered by first sight) with its current content
    (`compartment.get(state) ?? inner`).
  - `GardState.Field` → its name (devtools `fields` option) or "field #n", linking to the Fields
    tab; then `provides`, nested.
  - `GardState.Field.Derived` → "derived field #n".
  - `FacetProvider` → the facet's name if known, else "facet #n"; a static `value` previewed,
    else "computed"; then `facet.extensions` (what the facet enables), nested.
  - An object with `extension` → its content, labelled by `constructor.name` when it isn't
    `Object` (dev builds).
  - Already seen → "duplicate" (Wordgard keeps the highest-precedence one), not walked again.
- Known facets: a table built from namespace imports, each guarded: `Wordgard.editable`,
  `contentAttributes`, `editorAttributes`, `styleModule`, `scrollHandler`, `transactionListener`,
  `updateListener`, `cspNonce`, `coveredMargins`, `Decoration.Point.source`,
  `Decoration.Range.source`, `KeyBinding.source`, `KeyBinding.useDefaultKeymap`, and the exported
  clipboard, input and theme facets (`theme`, `colorScheme`, `cursorBlinkRate`,
  `clipboard…`, `eventHandler`, `eventObserver`, `pasteHandler`, `dropHandler`, `exceptionSink`
  where exported). For a known facet, its resolved value `state.facet(f)` is shown on the facet's
  first row.
- Decoration sources are facet rows of `Point.source`/`Range.source`: expanding one lists its
  current output (phase 10's walk for that source).
- Requests: `extensions {id}` (the tree, values previewed, size-capped), `logExtension {id, path}`
  (the live extension object, or a known facet's resolved value).

### Panel

- Tab "Extensions" after Fields: a tree (the State tab's tree component and search), a pane with
  the selected row's details and log/copy. Reloads on `reconfigured` (the store's
  `configListeners`), and a source's output on `stateChanged` while expanded.
- Links: field rows → Fields tab; source output → Structure (with the toggle on); the Log's
  "reconfigured" entries → this tab.
- Guide in `guides.ts` (and the README via `npm run readme`).

### Tests

- Page side: an editor with nested arrays, each precedence, a compartment reconfigured, a field
  with `provides`, a facet with `enables`, a duplicate, known and unknown facets: the tree, names,
  resolved values, the cache per configuration.
- Panel: the tree, a reconfigure reloads it, links to Fields and Structure.

## Phase 12: tag decorations in the Schema; keymap

### Tag decorations (internals)

- `internals.ts`: get the private facets by building an extension through the public factory
  and reading its provider's `facet` (`Decoration.Tag.wrapper(schema.nodes[0], Elt with a hole)`,
  `Tag.widget(…)`, `Tag.attribute(…)`, `Tag.shape(…)`, `Decoration.Mark.shape(…)`). Each guarded;
  a missing one leaves that part out.
- Read the resolved values with `state.facet(f)`: `tagShape` and `markShape` are `Map`s by type,
  the others arrays of `{type, …}`. A widget's place is a const enum (Before 0, After 1, Start 2,
  End 3).
- `SchemaInfo` gains, per node type, `decorations: {shape?, wrappers[], widgets[], attributes[]}`
  (wrappers and shapes as HTML where they're `Elt`s, "function" otherwise, widgets as place and
  param preview), per mark type `shape?`.
- Schema: the Effective view adds them, each commented "decoration" (a new note); a shape
  override is highlighted as overrides are. Cards get a "decorated" tag (filterable) and a
  one-line summary. The schema reloads on reconfigure already.
- Extensions tab: tag facet rows get their names ("Decoration.Tag.wrapper" …).

### Keymap (public)

- `state.facet(KeyBinding.source)`, plus `KeyBinding.defaultKeymap` when
  `state.facet(KeyBinding.useDefaultKeymap)`: Wordgard's own `keymap` derived field is internal,
  so this rebuilds its order (sources first, then the default keymap).
- Each binding: the key for this platform (`mac`/`win`/`linux` else `key`), `shift` variant,
  command name (`fn.name`; a bound command: its `command`'s name and `param` preview,
  internals), description, group, `preventDefault`/`stopPropagation`, from the default keymap or
  not. Several bindings on one key: listed in order, the first that returns true wins.
- Shown in the Extensions tab as a "Key bindings" section: searchable by key or command, log the
  command (jump to its definition).

## Open questions

1. Range decorations: mark the nodes in the range, or only those it applies to (`scope`, `query`)?
   The latter means re-implementing Wordgard's matching (or reading the DOM). Phase 10 marks the
   range and states scope and query.
2. Highlighting a widget or a range: `highlight` takes a node path. Add `highlightRange {from, to}`
   (client rects of `domAtPos` ranges, as text leaves already do)?
3. Widget params can be large or circular: `preview` with the usual depth and cycle limits.
4. Extensions tab on a big configuration (hundreds of providers): fine for a tree; no
   virtualisation planned.
5. Ask Wordgard's author to export the tag facets (or a debug listing), so phase 12 needs no
   internals.
