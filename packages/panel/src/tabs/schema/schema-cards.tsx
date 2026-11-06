import { cn } from "cn";
import type { ReactNode } from "react";
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

const Line = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="grid grid-cols-[4.5rem_1fr] gap-2 py-0.5">
    <span className="text-muted-foreground">{label}</span>
    <span className="min-w-0 wrap-break-word">{children}</span>
  </div>
);

const Tags = ({ items }: { items: string[] }) => items.map((item) => <Tag key={item}>{item}</Tag>);

// Groups have no colour of their own: a dotted underline marks the link.
const groupLink = "underline decoration-dotted underline-offset-2 hover:decoration-solid";

/** Type or group names, each a link to its card. */
const Links = ({ kind, names, onGo }: { kind: Kind; names: string[]; onGo: Go }) =>
  names.length ? (
    <span className="flex flex-wrap gap-x-2">
      {names.map((name) => (
        <button
          key={name}
          type="button"
          className={cn(
            "cursor-pointer rounded",
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
  tags: string[];
  shape: string;
  selected: boolean;
  children: ReactNode;
}) => (
  <section
    data-type={`${kind}-${name}`}
    aria-label={`${name} ${kind}`}
    aria-current={selected || undefined}
    className={cn(
      "mb-1.5 rounded border border-l-4 border-l-[hsl(var(--hue)_60%_50%)] px-2 py-1",
      selected && "ring-2 ring-ring"
    )}
    style={hue(kind, name)}
  >
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="font-semibold">{name}</span>
      <Tags items={tags} />
      <span className="ml-auto text-muted-foreground">{shape}</span>
    </div>
    {children}
  </section>
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
  <Card kind="node" name={type.name} tags={nodeTags(type)} shape={type.shape} selected={selected}>
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
    tags={[...type.flags, ...(type.rank == null ? [] : [`rank ${type.rank}`])]}
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

/** A group's tags; "automatic" says what it means on hover. */
const GroupTags = ({ group }: { group: SchemaGroup }) =>
  groupTags(group).map((tag) =>
    tag == AUTOMATIC ? (
      <Tip
        key={tag}
        label={
          <span className="block max-w-72">
            Not declared: Wordgard puts a type in it by what it is (a leaf or a plot, inline or
            block, a textblock). Node cards don't list it.
          </span>
        }
      >
        <Tag className="cursor-help">{tag}</Tag>
      </Tip>
    ) : (
      <Tag key={tag}>{tag}</Tag>
    )
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
  <section
    data-type={`group-${group.name}`}
    aria-label={`${group.name} group`}
    aria-current={selected || undefined}
    className={cn(
      "mb-1.5 rounded border border-l-4 border-l-muted-foreground/40 px-2 py-1",
      selected && "ring-2 ring-ring"
    )}
  >
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="font-semibold">{group.name}</span>
      <GroupTags group={group} />
    </div>
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
  </section>
);
