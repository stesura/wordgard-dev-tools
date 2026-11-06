import { whileShown } from "#stores/while-shown.ts";
import { LoadError } from "#components/load-error";
import { fire } from "../../transport.ts";
import { includes } from "#lib/text.ts";
import { toggled } from "#lib/sets.ts";
import { useCallback, useRef, useState } from "react";
import { ClearFilters } from "#components/clear-filters";
import { createMenuAnchor } from "#lib/menu-anchor.ts";
import { createSchemaSource } from "./schema-source.ts";
import type { PanelStore } from "#stores/panel-store.ts";
import { SCHEMA_GROUPS, SCHEMA_MARKS, SCHEMA_NODES } from "../../guides/guides.ts";
import { SplitPane } from "#components/split-pane";
import { scrollInto } from "#lib/dom.ts";
import { useStore } from "@nanostores/react";
import {
  type SchemaFilters,
  noFilters,
  none,
  pressedIn,
  createSchemaFilters,
  tagsOf,
} from "./schema-filters.ts";
import { type JSONView, type Log, SpecPane, jsonOf } from "./spec-pane.tsx";
import { type MenuTarget, SchemaMenu } from "./schema-menu.tsx";
import {
  type Go,
  GroupCard,
  type Kind,
  MarkCard,
  NodeCard,
  groupTags,
  nodeTags,
} from "./schema-cards.tsx";
import { SchemaSection, Toggle, count } from "./schema-heading.tsx";

/** The editor's node and mark types. Mounted per editor. */
export const Schema = ({ store, editorId }: { store: PanelStore; editorId: number }) => {
  const [source] = useState(() => createSchemaSource(store.transport, editorId));
  const { value: schema, error } = useStore(source.state);
  const [savedFilters] = useState(createSchemaFilters);
  const filters = useStore(savedFilters);
  const { query, open } = filters;
  const setFilters = (patch: Partial<SchemaFilters>) =>
    savedFilters.set({ ...savedFilters.get(), ...patch });
  const [byRank, setByRank] = useState(false);
  // The card clicked or shown last (a "show type" from the Structure): ringed.
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  const [paneOpen, setPaneOpen] = useState(true);
  // Kept from card to card.
  const [jsonView, setJSONView] = useState<JSONView>("spec");
  const showJSON = (card: string) => {
    setSelectedCard(card);
    setPaneOpen(true);
  };
  const logCard: Log = (kind, name, json) =>
    fire(store.transport, { type: "logType", id: editorId, kind, name, json });
  // The card a context menu opens on is selected.
  const [menu] = useState(() =>
    createMenuAnchor<MenuTarget>(
      "[data-type]",
      (row) => ({ card: row.getAttribute("data-type") ?? "" }),
      (_, target) => setSelectedCard(target.card)
    )
  );

  // Clears the filters so the card is there, rings it, then scrolls to it once drawn.
  // Stable: the list's ref callback takes reveals with it.
  const go: Go = useCallback(
    (kind, name) => {
      setSelectedCard(`${kind}-${name}`);
      savedFilters.set(noFilters);
      requestAnimationFrame(() => {
        const container = scroller.current;
        const card = container?.querySelector(`[data-type='${kind}-${CSS.escape(name)}']`);
        const heading = card?.closest("[data-list]")?.querySelector("[data-heading]");
        if (container && card)
          scrollInto(container, card, heading instanceof HTMLElement ? heading.offsetHeight : 0);
      });
    },
    [savedFilters]
  );

  // Loads while its tab is shown: on showing (when the configuration changed meanwhile) and on
  // each configuration change.
  const container = useCallback(
    (element: HTMLDivElement | null) => {
      scroller.current = element;
      if (!element) return;
      const stop = whileShown(store, {
        tab: "schema",
        editorId,
        on: "config",
        load: () => void source.load(),
        // A context menu's "show type": once the schema is in, the card is scrolled to.
        onReveal: () => {
          const type = store.takeTypeReveal(editorId);
          if (type) void source.ready().then(() => go(type.kind, type.name));
        },
      });
      return () => {
        stop();
        scroller.current = null;
      };
    },
    [store, editorId, source, go]
  );

  const allNodes = schema?.nodes ?? [];
  const allMarks = schema?.marks ?? [];
  const allGroups = schema?.groups ?? [];
  const nodeTagList = tagsOf(allNodes, nodeTags);
  const markTagList = tagsOf(allMarks, (type) => type.flags);
  const groupTagList = tagsOf(allGroups, groupTags);
  const nodeFilter = pressedIn(filters.nodes, nodeTagList);
  const markFilter = pressedIn(filters.marks, markTagList);
  const groupFilter = pressedIn(filters.groups, groupTagList);
  const groups = allGroups.filter(
    (group) =>
      includes(group.name, query) &&
      groupTags(group).filter((tag) => groupFilter.has(tag)).length == groupFilter.size
  );
  const nodes = allNodes.filter(
    (type) =>
      includes(type.name, query) &&
      nodeTags(type).filter((tag) => nodeFilter.has(tag)).length == nodeFilter.size
  );
  const filteredMarks = allMarks.filter(
    (type) =>
      includes(type.name, query) &&
      type.flags.filter((tag) => markFilter.has(tag)).length == markFilter.size
  );
  // By rank, unranked last; otherwise in the schema's order.
  const marks = byRank
    ? filteredMarks.toSorted((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity))
    : filteredMarks;
  // From the latest: two clicks can land before a render.
  const toggleOpen = (kind: Kind) => {
    const latest = savedFilters.get();
    savedFilters.set({ ...latest, open: { ...latest.open, [kind]: !latest.open[kind] } });
  };
  // A collapsed section counts as a filter.
  const filtered =
    query != "" ||
    nodeFilter.size > 0 ||
    markFilter.size > 0 ||
    groupFilter.size > 0 ||
    !(open.node && open.group && open.mark);
  const clearAll = () => savedFilters.set(noFilters);

  return (
    <div className="@container flex min-h-0 flex-1 flex-col">
      <LoadError what="the schema" error={error} onRetry={() => void source.load()} />
      {/* Narrow: the filter on its own line, its buttons under it. */}
      <div className="flex min-h-7 shrink-0 flex-wrap items-center gap-x-2 border-b bg-strip px-2 pb-1 text-xs @md:flex-nowrap @md:pb-0">
        <input
          type="search"
          value={query}
          onChange={(event) => setFilters({ query: event.target.value })}
          onKeyDown={(event) => {
            if (event.key == "Escape") setFilters({ query: "" });
          }}
          aria-label="Filter the types"
          placeholder="Filter node types, mark types and groups"
          className="h-6 min-w-0 flex-1 basis-full bg-transparent outline-none @md:basis-0"
        />
        {filtered && <ClearFilters onClick={clearAll} />}
        {schema && (
          <span className="flex shrink-0 gap-1">
            <Toggle pressed={open.node} onClick={() => toggleOpen("node")}>
              {schema.nodes.length} nodes
            </Toggle>
            <Toggle pressed={open.mark} onClick={() => toggleOpen("mark")}>
              {schema.marks.length} marks
            </Toggle>
            <Toggle pressed={open.group} onClick={() => toggleOpen("group")}>
              {schema.groups.length} groups
            </Toggle>
          </span>
        )}
      </div>
      <SplitPane
        pane={
          paneOpen ? (
            <SpecPane
              shown={jsonOf(schema, selectedCard)}
              view={jsonView}
              onView={setJSONView}
              onLog={logCard}
              onClose={() => setPaneOpen(false)}
            />
          ) : null
        }
      >
        <div
          ref={container}
          className="min-h-0 flex-1 overflow-auto font-mono text-xs"
          onClick={(event) => {
            const card =
              event.target instanceof Element ? event.target.closest("[data-type]") : null;
            if (card) setSelectedCard(card.getAttribute("data-type"));
          }}
          onDoubleClick={(event) => {
            const card =
              event.target instanceof Element
                ? event.target.closest("[data-type]")?.getAttribute("data-type")
                : null;
            if (card) showJSON(card);
          }}
          onContextMenu={menu.onContextMenu}
        >
          <SchemaSection
            title="Nodes"
            guide={SCHEMA_NODES}
            count={count(nodes.length, allNodes.length)}
            open={open.node}
            onToggleOpen={() => toggleOpen("node")}
            tags={nodeTagList}
            pressed={nodeFilter}
            onToggle={(tag) => setFilters({ nodes: toggled(nodeFilter, tag) })}
            onClear={() => setFilters({ nodes: none })}
            empty={schema && !nodes.length ? "No node types match." : null}
          >
            {nodes.map((type) => (
              <NodeCard
                key={type.name}
                type={type}
                selected={selectedCard == `node-${type.name}`}
                onGo={go}
              />
            ))}
          </SchemaSection>
          <SchemaSection
            title="Marks"
            guide={SCHEMA_MARKS}
            count={count(marks.length, allMarks.length)}
            open={open.mark}
            onToggleOpen={() => toggleOpen("mark")}
            tags={markTagList}
            pressed={markFilter}
            onToggle={(tag) => setFilters({ marks: toggled(markFilter, tag) })}
            onClear={() => setFilters({ marks: none })}
            empty={schema && !marks.length ? "No mark types match." : null}
            actions={
              <>
                <span className="text-muted-foreground">order</span>
                <Toggle pressed={!byRank} onClick={() => setByRank(false)}>
                  schema
                </Toggle>
                <Toggle pressed={byRank} onClick={() => setByRank(true)}>
                  rank
                </Toggle>
              </>
            }
          >
            {marks.map((type) => (
              <MarkCard
                key={type.name}
                type={type}
                selected={selectedCard == `mark-${type.name}`}
                onGo={go}
              />
            ))}
          </SchemaSection>
          <SchemaSection
            title="Node groups"
            guide={SCHEMA_GROUPS}
            count={count(groups.length, allGroups.length)}
            open={open.group}
            onToggleOpen={() => toggleOpen("group")}
            tags={groupTagList}
            pressed={groupFilter}
            onToggle={(tag) => setFilters({ groups: toggled(groupFilter, tag) })}
            onClear={() => setFilters({ groups: none })}
            empty={schema && !groups.length ? "No groups match." : null}
            last
          >
            {groups.map((group) => (
              <GroupCard
                key={group.name}
                group={group}
                selected={selectedCard == `group-${group.name}`}
                onGo={go}
              />
            ))}
          </SchemaSection>
        </div>
      </SplitPane>
      <SchemaMenu
        schema={schema}
        anchor={menu}
        paneOpen={paneOpen}
        onShow={showJSON}
        onLog={logCard}
      />
    </div>
  );
};
