import { cn } from "cn";
import { useId, type ReactNode } from "react";
import type {
  SchemaGroup,
  SchemaMarkType,
  SchemaNodeType,
  SchemaParam,
} from "@stesura/wordgard-dev-tools";
import { Tag } from "#components/ui/badge";
import { json } from "#lib/json.ts";
import { Tip } from "#components/tip";
import { hue, markColour, typeColour, type ColourKind } from "#lib/colours.ts";

export type Kind = "node" | "mark" | "group";
export type Go = (kind: Kind, name: string) => void;

/** A term and its value: a group in the card's `<dl>`. */
const Line = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="grid grid-cols-[4.5rem_1fr] gap-2 py-0.5">
    <dt className="text-muted-foreground">{label}</dt>
    <dd className="min-w-0 wrap-break-word">{children}</dd>
  </div>
);

// `contents`: the tags stay items of the title row. The explicit roles keep the list for screen
// readers (list-style none and display: contents can drop it).
const TagList = ({ children }: { children: ReactNode }) => (
  <ul role="list" aria-label="tags" className="contents">
    {children}
  </ul>
);

const TagItem = ({ children }: { children: ReactNode }) => (
  <li role="listitem" className="contents">
    {children}
  </li>
);

const Tags = ({ items }: { items: string[] }) =>
  items.length > 0 && (
    <TagList>
      {items.map((item) => (
        <TagItem key={item}>
          <Tag>{item}</Tag>
        </TagItem>
      ))}
    </TagList>
  );

const linkName: Record<Kind, string> = {
  node: "node type",
  mark: "mark type",
  group: "node group",
};

/** Keyboard focus on a link or tag in a card: an outline, apart from the card's selection ring. */
const itemFocus =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid";

// Selection: a ring, and in forced colours (which drop box shadows) an outline. Keyboard focus on
// the card itself: an outline outside the ring, so it shows apart from focus on what's inside.
const cardClass = (selected: boolean) =>
  cn(
    "mb-1.5 rounded border border-l-4 px-2 py-1 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
    selected &&
      "ring-2 ring-ring forced-colors:outline-2 forced-colors:outline-offset-1 forced-colors:outline-[Highlight] forced-colors:outline-solid"
  );

const CardTitle = ({ children }: { children: ReactNode }) => (
  <h4 className="font-semibold">{children}</h4>
);

// Groups have no colour of their own: a dotted underline marks the link.
const groupLink = "underline decoration-dotted underline-offset-2 hover:decoration-solid";

/** Type or group names, each a link to its card. Reached with the arrows from the card, not Tab. */
const Links = ({ kind, names, onGo }: { kind: Kind; names: string[]; onGo: Go }) =>
  names.length ? (
    <span className="flex flex-wrap gap-x-2">
      {names.map((name) => (
        <button
          key={name}
          type="button"
          tabIndex={-1}
          data-card-item
          // The visible name first (label in name), then what it links to.
          aria-label={`${name} ${linkName[kind]}`}
          className={cn(
            "cursor-pointer rounded",
            itemFocus,
            kind == "mark"
              ? cn(markColour, "px-1 hover:underline")
              : kind == "node"
                ? cn(typeColour, "hover:underline")
                : groupLink
          )}
          style={kind == "group" ? undefined : hue(kind, name)}
          onClick={(event) => {
            // The target card is the one ringed, not the one holding the link.
            event.stopPropagation();
            onGo(kind, name);
          }}
        >
          {name}
        </button>
      ))}
    </span>
  ) : (
    <span className="text-muted-foreground">none</span>
  );

const Param = ({ param }: { param: SchemaParam }) =>
  param.validate == null && param.default === undefined ? null : (
    <Line label="param">
      {param.validate ?? "any"}
      {param.default !== undefined && (
        <span className="text-muted-foreground"> · default {json(param.default)}</span>
      )}
    </Line>
  );

// A node's tags that name the automatic group it's in.
const tagGroups = new Map([
  ["plot", "Plot"],
  ["leaf", "Leaf"],
  ["inline", "Inline"],
  ["block", "Block"],
  ["textblock", "Textblock"],
]);

/** A node's tags, those naming a group linked to its card (reached with the arrows, as the links). */
const NodeTags = ({ items, onGo }: { items: string[]; onGo: Go }) => (
  <TagList>
    {items.map((item) => {
      const group = tagGroups.get(item);
      return (
        <TagItem key={item}>
          {group == null ? (
            <Tag>{item}</Tag>
          ) : (
            <Tag
              render={
                <button
                  type="button"
                  tabIndex={-1}
                  data-card-item
                  aria-label={`${item} ${linkName.group}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onGo("group", group);
                  }}
                />
              }
              className={cn("cursor-pointer", groupLink, itemFocus)}
            >
              {item}
            </Tag>
          )}
        </TagItem>
      );
    })}
  </TagList>
);

const Card = ({
  kind,
  name,
  tags,
  shape,
  selected,
  children,
}: {
  kind: ColourKind;
  name: string;
  tags: ReactNode;
  shape: string;
  selected: boolean;
  children: ReactNode;
}) => (
  <article
    data-type={`${kind}-${name}`}
    aria-label={`${name} ${kind}`}
    aria-current={selected || undefined}
    tabIndex={0}
    className={cn(cardClass(selected), "border-l-[hsl(var(--hue)_60%_50%)]")}
    style={hue(kind, name)}
  >
    <div className="flex flex-wrap items-center gap-1.5">
      <CardTitle>{name}</CardTitle>
      {tags}
      <span className="ml-auto text-muted-foreground">
        <span className="sr-only">shape </span>
        {shape}
      </span>
    </div>
    <dl>{children}</dl>
  </article>
);

export const nodeTags = (type: SchemaNodeType) => [
  type.kind,
  type.inline ? "inline" : "block",
  ...type.flags,
];

export const NodeCard = ({
  type,
  selected,
  onGo,
}: {
  type: SchemaNodeType;
  selected: boolean;
  onGo: Go;
}) => (
  <Card
    kind="node"
    name={type.name}
    tags={<NodeTags items={nodeTags(type)} onGo={onGo} />}
    shape={type.shape}
    selected={selected}
  >
    {type.groups.length > 0 && (
      <Line label="groups">
        <Links kind="group" names={type.groups} onGo={onGo} />
      </Line>
    )}
    {type.roles.length > 0 && <Line label="roles">{type.roles.join(", ")}</Line>}
    {type.content != null && (
      <Line label="content">
        {type.content} <span className="text-muted-foreground">(spec)</span>
      </Line>
    )}
    {type.kind == "plot" && (
      <Line label="holds">
        <Links kind="node" names={type.holds} onGo={onGo} />
      </Line>
    )}
    <Line label="marks">
      <Links kind="mark" names={type.marks} onGo={onGo} />
    </Line>
    <Param param={type.param} />
  </Card>
);

export const MarkCard = ({
  type,
  selected,
  onGo,
}: {
  type: SchemaMarkType;
  selected: boolean;
  onGo: Go;
}) => (
  <Card
    kind="mark"
    name={type.name}
    tags={<Tags items={[...type.flags, ...(type.rank == null ? [] : [`rank ${type.rank}`])]} />}
    shape={type.shape}
    selected={selected}
  >
    {type.target != null && (
      <Line label="target">
        {type.target} <span className="text-muted-foreground">(spec)</span>
      </Line>
    )}
    <Line label="goes on">
      <Links kind="node" names={type.targets} onGo={onGo} />
    </Line>
    <Param param={type.param} />
  </Card>
);

const AUTOMATIC = "automatic";

export const groupTags = (group: SchemaGroup) => [
  group.builtIn ? "Wordgard's" : "the schema's",
  ...(group.implied ? [AUTOMATIC] : []),
];

const AUTOMATIC_MEANS =
  "Not declared: Wordgard puts a type in it by what it is (a leaf or a plot, inline or block, a textblock). Node cards show it as a tag, not among their groups.";

/** "automatic", with what it means: on hover or focus, and as its description. Reached with the
 * arrows, as the links. */
const AutomaticTag = () => {
  const id = useId();
  return (
    <>
      <Tip label={<span className="block max-w-72">{AUTOMATIC_MEANS}</span>}>
        <Tag
          className={cn("cursor-help", itemFocus)}
          tabIndex={-1}
          data-card-item
          aria-describedby={id}
        >
          {AUTOMATIC}
        </Tag>
      </Tip>
      {/* A description can come from a hidden element: not read twice. */}
      <span id={id} hidden>
        {AUTOMATIC_MEANS}
      </span>
    </>
  );
};

/** A group's tags. */
const GroupTags = ({ group }: { group: SchemaGroup }) => (
  <TagList>
    {groupTags(group).map((tag) => (
      <TagItem key={tag}>{tag == AUTOMATIC ? <AutomaticTag /> : <Tag>{tag}</Tag>}</TagItem>
    ))}
  </TagList>
);

/** A node group: its types, and the content and mark targets that name it. */
export const GroupCard = ({
  group,
  selected,
  onGo,
}: {
  group: SchemaGroup;
  selected: boolean;
  onGo: Go;
}) => (
  <article
    data-type={`group-${group.name}`}
    aria-label={`${group.name} group`}
    aria-current={selected || undefined}
    tabIndex={0}
    className={cn(cardClass(selected), "border-l-muted-foreground/40")}
  >
    <div className="flex flex-wrap items-center gap-1.5">
      <CardTitle>{group.name}</CardTitle>
      <GroupTags group={group} />
    </div>
    <dl>
      <Line label="types">
        <Links kind="node" names={group.members} onGo={onGo} />
      </Line>
      {group.inContentOf.length > 0 && (
        <Line label="content of">
          <Links kind="node" names={group.inContentOf} onGo={onGo} />
        </Line>
      )}
      {group.inTargetOf.length > 0 && (
        <Line label="target of">
          <Links kind="mark" names={group.inTargetOf} onGo={onGo} />
        </Line>
      )}
    </dl>
  </article>
);
