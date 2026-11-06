import { cn } from "cn";
import { ClipboardDocumentIcon, CommandLineIcon, XMarkIcon } from "#icons";
import { useCallback, useState, useSyncExternalStore, type ReactNode } from "react";
import type {
  MarkPreview,
  Path,
  ResolvedPos,
  SliceInfo,
  SliceToken,
  TreeNode,
} from "@stesura/wordgard-dev-tools";
import { Button } from "#components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "#components/ui/context-menu";
import type { ColourKind } from "./colours.ts";
import { GuidePopover } from "./guide.tsx";
import { RESOLVED_POSITIONS, SELECTION } from "./guides.ts";
import { CopySelection, copy, useMenuSelection } from "./node-menu.tsx";
import { Field, json, selectionType } from "./node-pane.tsx";
import { createSelectionSource } from "./selection-source.ts";
import type { PanelStore } from "./store.ts";
import { Tip } from "./tip.tsx";
import { TypeLink } from "./type-link.tsx";

type Links = { onNode: (path: Path) => void; onType: (kind: ColourKind, name: string) => void };

const pathLink =
  "cursor-pointer underline decoration-dotted underline-offset-2 hover:decoration-solid";

/** A node: its type (a link to the Schema), its path (a link to the Structure), its range. */
const NodeRef = ({ node, links }: { node: TreeNode | null; links: Links }) =>
  node ? (
    <span className="inline-flex flex-wrap items-center gap-x-2">
      <TypeLink kind="node" name={node.name} onShow={links.onType} />
      <Tip label="Show it in the Structure">
        <button type="button" className={pathLink} onClick={() => links.onNode(node.path)}>
          [{node.path.join(", ")}]
        </button>
      </Tip>
      <span className="text-muted-foreground">
        {node.from}–{node.to}
      </span>
    </span>
  ) : (
    <span className="text-muted-foreground">none</span>
  );

const Marks = ({ marks, links }: { marks: MarkPreview[]; links: Links }) =>
  marks.length ? (
    <span className="inline-flex flex-wrap items-center gap-x-2">
      {marks.map((mark) => (
        <span key={mark.name}>
          <TypeLink kind="mark" name={mark.name} onShow={links.onType} />
          {mark.preview != null && <span className="text-muted-foreground"> = {mark.preview}</span>}
        </span>
      ))}
    </span>
  ) : (
    <span className="text-muted-foreground">none</span>
  );

/** A card's menu: log the live object in the page's console, copy its JSON (null: too large to
 * send), clear (the typed position). */
type CardMenu = { onLog: () => void; copied: (() => string) | null; onClear?: () => void };

/** A card, with its context menu (focusable: Shift+F10 opens it too). `code`: the expression
 * giving what it shows. `fixed`: a set height, its content scrolling, so a change in it doesn't
 * move what's below. */
const Section = ({
  name,
  title,
  code,
  menu,
  fixed,
  children,
}: {
  name: string;
  title: ReactNode;
  code?: string;
  menu: CardMenu;
  fixed?: boolean;
  children: ReactNode;
}) => {
  const { selection, onContextMenu } = useMenuSelection();
  return (
    <ContextMenu>
      <ContextMenuTrigger
        onContextMenu={onContextMenu}
        render={
          <section
            data-section={name}
            tabIndex={0}
            className={cn(
              "flex min-w-0 flex-col rounded-md border px-2 py-1 outline-none focus-visible:ring-1 focus-visible:ring-ring",
              fixed && "h-44"
            )}
          />
        }
      >
        <div className="mb-1 flex min-h-6 shrink-0 flex-wrap items-center gap-x-2 font-sans">
          <h3 className="font-medium">{title}</h3>
          {code && <code className="font-mono text-muted-foreground">{code}</code>}
        </div>
        <div className={cn(fixed && "min-h-0 flex-1 overflow-auto")}>{children}</div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <CopySelection text={selection} />
        <ContextMenuItem className="text-xs" onClick={menu.onLog}>
          <CommandLineIcon /> Log to console
        </ContextMenuItem>
        <ContextMenuItem
          className="text-xs"
          disabled={menu.copied == null}
          onClick={() => menu.copied && void copy(menu.copied())}
        >
          <ClipboardDocumentIcon /> Copy JSON
        </ContextMenuItem>
        {menu.onClear && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem className="text-xs" onClick={menu.onClear}>
              <XMarkIcon /> Clear
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
};

/** A resolved position: a `Pos`, from `doc.resolve(pos)`. */
const Position = ({
  name,
  code,
  pos,
  links,
  onLog,
  onClear,
}: {
  name: string;
  code: string;
  pos: ResolvedPos;
  links: Links;
  onLog: (pos: number) => void;
  onClear?: () => void;
}) => (
  <Section
    name={name}
    title={
      <>
        {name} <span className="font-normal text-muted-foreground">· Pos at {pos.pos}</span>
      </>
    }
    code={code}
    menu={{ onLog: () => onLog(pos.pos), copied: () => json(pos), onClear }}
  >
    <Field label="parent">
      <NodeRef node={pos.parent} links={links} />
    </Field>
    <Field label="depth">{pos.depth}</Field>
    <Field label="index">
      {pos.index}
      {pos.inText > 0 && (
        <span className="text-muted-foreground"> · {pos.inText} into the text</span>
      )}
    </Field>
    <Field label="before">
      <NodeRef node={pos.nodeBefore} links={links} />
      {pos.textBefore != null && <span className="block">{JSON.stringify(pos.textBefore)}</span>}
    </Field>
    <Field label="after">
      <NodeRef node={pos.nodeAfter} links={links} />
      {pos.textAfter != null && <span className="block">{JSON.stringify(pos.textAfter)}</span>}
    </Field>
    <Field label="textblock">
      <NodeRef node={pos.textblock} links={links} />
    </Field>
    <Field label="in parent">
      {pos.atStart && pos.atEnd
        ? "at start and end"
        : pos.atStart
          ? "at start"
          : pos.atEnd
            ? "at end"
            : "inside"}
    </Field>
    <Field label="marks">
      <Marks marks={pos.marks} links={links} />
    </Field>
  </Section>
);

const Token = ({ token, links }: { token: SliceToken; links: Links }) =>
  token.kind == "close" ? (
    <Tip label="A plot closes">
      <span className="text-muted-foreground">⟩</span>
    </Tip>
  ) : token.kind == "open" ? (
    <span className="inline-flex items-center gap-0.5">
      <Tip label="A plot opens">
        <span className="text-muted-foreground">⟨</span>
      </Tip>
      <TypeLink kind="node" name={token.name} onShow={links.onType} />
    </span>
  ) : (
    // Boxed: a node's marks don't read as the next one's.
    <span className="inline-flex items-center gap-1 rounded border px-1 py-px">
      <TypeLink kind="node" name={token.name} onShow={links.onType} />
      {token.text != null && <span>{JSON.stringify(token.text)}</span>}
      {token.marks.map((mark) => (
        <TypeLink key={mark} kind="mark" name={mark} onShow={links.onType} />
      ))}
    </span>
  );

/** `selection.toSlice(doc)`: what copying the selection takes. */
const SliceCard = ({
  slice,
  links,
  onLog,
}: {
  slice: SliceInfo;
  links: Links;
  onLog: () => void;
}) => (
  <Section
    name="Slice"
    title={
      <>
        Slice{" "}
        <span className="font-normal text-muted-foreground">
          · {slice.length ? `${slice.length} long` : "empty"}
        </span>
      </>
    }
    code="state.selection.toSlice(state.doc)"
    menu={{ onLog, copied: slice.json == null ? null : () => json(slice.json) }}
  >
    {slice.length > 0 && (
      <>
        <Field label="text">{JSON.stringify(slice.text)}</Field>
        <Field label="tokens">
          <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            {slice.tokens.map((token, index) => (
              <Token key={index} token={token} links={links} />
            ))}
            {slice.more > 0 && <span className="text-muted-foreground">and {slice.more} more</span>}
          </span>
        </Field>
      </>
    )}
    <Field label="context">
      {slice.context.length ? (
        <span className="inline-flex flex-wrap items-center gap-x-1.5">
          {slice.context.map((name, index) => (
            <TypeLink key={index} kind="node" name={name} onShow={links.onType} />
          ))}
        </span>
      ) : (
        <span className="text-muted-foreground">none</span>
      )}
    </Field>
  </Section>
);

/** The selected editor's selection, resolved, and any position typed in. Mounted per editor. */
export const SelectionTab = ({ store, editorId }: { store: PanelStore; editorId: number }) => {
  const [source] = useState(() => createSelectionSource(store.transport, editorId));
  const { detail, error, probe } = useSyncExternalStore(source.subscribe, source.get);
  const { selection } = useSyncExternalStore(store.subscribe, store.get);
  const info = selection?.id == editorId ? selection.info : null;
  const [typed, setTyped] = useState("");
  const links: Links = {
    onNode: (path) => store.showNode(editorId, path),
    onType: (kind, name) => store.showType(editorId, name, kind),
  };
  const logPos = (pos: number) =>
    store.transport.send({ type: "logPos", id: editorId, pos }).catch(() => {});
  const logSelection = () =>
    void store.transport
      .send({ type: "logState", id: editorId, keys: ["selection"] })
      .catch(() => {});

  // Loads while its tab is shown: on showing (when the state changed meanwhile) and on each change.
  const container = useCallback(
    (element: HTMLDivElement | null) => {
      if (!element) return;
      const shown = () => store.get().view == "selection";
      let stale = true;
      const load = () => {
        stale = false;
        void source.load();
      };
      const stopState = store.onStateChanged((id) => {
        if (id != editorId) return;
        if (shown()) load();
        else stale = true;
      });
      const stopStore = store.subscribe(() => {
        if (shown() && stale) load();
      });
      if (shown()) load();
      return () => {
        stopState();
        stopStore();
      };
    },
    [store, editorId, source]
  );

  const onTyped = (value: string) => {
    setTyped(value);
    // The page says what's wrong with a decimal or an out-of-range number.
    void source.probe(value.trim() == "" ? null : Number(value));
  };

  const multiple = detail != null && detail.ranges.length > 1;

  return (
    // A container: cards side by side when there's room.
    <div className="@container flex min-h-0 flex-1 flex-col">
      {error != null && (
        <p role="alert" className="flex items-center gap-2 border-b px-2 py-1 text-destructive">
          Couldn't load the selection: {error}
          <Button variant="outline" size="xs" onClick={() => void source.load()}>
            Retry
          </Button>
        </p>
      )}
      <div ref={container} className="min-h-0 flex-1 overflow-auto font-mono text-xs">
        <div className="flex min-h-8 items-center gap-1 border-b bg-strip px-2 py-1 font-sans">
          <h3 className="font-semibold">Selection</h3>
          <GuidePopover guide={SELECTION} align="start" />
        </div>
        {!info || !detail ? (
          <p className="p-2 font-sans text-muted-foreground">
            {info ? "Loading…" : "No selection"}
          </p>
        ) : (
          <div className="flex flex-col gap-2 p-2">
            <div className="grid gap-2 @lg:grid-cols-2">
              <Section
                name="Selection"
                title="Selection"
                code="state.selection"
                fixed
                menu={{ onLog: logSelection, copied: () => json(info.json) }}
              >
                <Field label="type">{selectionType(info.json)}</Field>
                <Field label="from–to">
                  {info.from}–{info.to}
                  {info.empty && <span className="text-muted-foreground"> · empty</span>}
                </Field>
                {info.nodePath && (
                  <Field label="node">
                    <Tip label="Show it in the Structure">
                      <button
                        type="button"
                        className={pathLink}
                        onClick={() => info.nodePath && links.onNode(info.nodePath)}
                      >
                        [{info.nodePath.join(", ")}]
                      </button>
                    </Tip>
                  </Field>
                )}
                {multiple && (
                  <Field label="ranges">
                    {detail.ranges.map((range) => `${range.from}–${range.to}`).join(", ")}
                  </Field>
                )}
                <Field label="typing">
                  <Marks marks={detail.activeMarks} links={links} />
                </Field>
              </Section>
              <Section
                name="JSON"
                title="JSON"
                code="state.selection.toJSON(state)"
                fixed
                menu={{ onLog: logSelection, copied: () => json(info.json) }}
              >
                <pre className="whitespace-pre-wrap">{json(info.json)}</pre>
              </Section>
            </div>
            <SliceCard
              slice={detail.slice}
              links={links}
              onLog={() =>
                void store.transport.send({ type: "logSlice", id: editorId }).catch(() => {})
              }
            />
          </div>
        )}
        {/* Sticky: the position box stays at hand while the cards scroll. */}
        <div className="sticky top-0 z-10 flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1 border-y bg-strip px-2 py-1 font-sans">
          <span className="flex items-center gap-1">
            <h3 className="font-semibold">Resolved positions</h3>
            <GuidePopover guide={RESOLVED_POSITIONS} align="start" />
          </span>
          <label className="ml-auto flex items-center gap-2">
            <span>Resolve</span>
            <input
              type="number"
              min={0}
              value={typed}
              onChange={(event) => onTyped(event.target.value)}
              onKeyDown={(event) => {
                if (event.key == "Escape") onTyped("");
              }}
              aria-label="Position to resolve"
              placeholder="pos"
              // No spin buttons.
              className="h-5 w-20 [appearance:textfield] rounded border bg-background px-1 font-mono outline-none focus-visible:ring-1 focus-visible:ring-ring [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
          </label>
        </div>
        <div className="grid gap-2 p-2 @lg:grid-cols-2">
          {info &&
            detail &&
            (info.empty ? (
              <Position
                name="Cursor"
                code="state.sel.head"
                pos={detail.head}
                links={links}
                onLog={logPos}
              />
            ) : (
              <>
                <Position
                  name="Anchor"
                  code="state.sel.anchor"
                  pos={detail.anchor}
                  links={links}
                  onLog={logPos}
                />
                <Position
                  name="Head"
                  code="state.sel.head"
                  pos={detail.head}
                  links={links}
                  onLog={logPos}
                />
              </>
            ))}
          {probe &&
            (probe.resolved ? (
              <Position
                name="Position"
                code={`doc.resolve(${probe.pos})`}
                pos={probe.resolved}
                links={links}
                onLog={logPos}
                onClear={() => onTyped("")}
              />
            ) : (
              <p role="alert" className="font-sans text-destructive">
                {probe.error}
              </p>
            ))}
        </div>
      </div>
    </div>
  );
};
