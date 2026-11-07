import { cn } from "cn";
import {
  ArrowTopRightOnSquareIcon,
  ClipboardDocumentIcon,
  CommandLineIcon,
  XMarkIcon,
} from "#icons";
import type { ReactNode } from "react";
import type {
  MarkPreview,
  Path,
  ResolvedPos,
  SliceInfo,
  SliceToken,
  TreeNode,
} from "@stesura/wordgard-dev-tools";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "#components/ui/context-menu";
import type { ColourKind } from "#lib/colours.ts";
import { CopySelection, useMenuSelection } from "#components/copy-selection";
import { copy } from "#lib/clipboard.ts";
import { Field } from "#components/node-pane";
import { json } from "#lib/json.ts";
import { Tip } from "#components/tip";
import { TypeLink } from "#components/type-link";
import { GuidePopover } from "#components/guide-popover";
import { SELECTION_SLICE, type Guide } from "../../guides/guides.ts";

export type Links = {
  onNode: (path: Path) => void;
  onType: (kind: ColourKind, name: string) => void;
};

export const pathLink =
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

export const Marks = ({ marks, links }: { marks: MarkPreview[]; links: Links }) =>
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
type CardMenu = {
  onLog: () => void;
  copied: (() => string) | null;
  onClear?: () => void;
  /** Shows the node holding the selection in the Structure. */
  onShowNode?: () => void;
};

/** A card, with its context menu (focusable: Shift+F10 opens it too). `code`: the expression
 * giving what it shows. `fixed`: a set height, its content scrolling, so a change in it doesn't
 * move what's below. */
export const Section = ({
  name,
  title,
  code,
  guide,
  menu,
  fixed,
  children,
}: {
  name: string;
  title: ReactNode;
  code?: string;
  guide?: Guide;
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
              fixed && "h-32"
            )}
          />
        }
      >
        <div className="mb-1 flex min-h-6 shrink-0 flex-wrap items-center gap-x-2 font-sans">
          <h3 className="font-medium">{title}</h3>
          {code && <code className="font-mono text-muted-foreground">{code}</code>}
          {guide && <GuidePopover guide={guide} align="start" />}
        </div>
        <div className={cn(fixed && "min-h-0 flex-1 overflow-auto")}>{children}</div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-auto min-w-48">
        <CopySelection text={selection} />
        {menu.onShowNode && (
          <ContextMenuItem onClick={menu.onShowNode}>
            <ArrowTopRightOnSquareIcon /> Show the node holding the selection
          </ContextMenuItem>
        )}
        <ContextMenuItem onClick={menu.onLog}>
          <CommandLineIcon /> Log to console
        </ContextMenuItem>
        <ContextMenuItem
          disabled={menu.copied == null}
          onClick={() => menu.copied && void copy(menu.copied())}
        >
          <ClipboardDocumentIcon /> Copy JSON
        </ContextMenuItem>
        {menu.onClear && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={menu.onClear}>
              <XMarkIcon /> Clear
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
};

/** A resolved position: a `Pos`, from `doc.resolve(pos)`. */
export const Position = ({
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
export const SliceCard = ({
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
    guide={SELECTION_SLICE}
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
