import { IconButton } from "#components/icon-button";
import { useStore } from "@nanostores/react";
import { cn } from "cn";
import { ClipboardDocumentIcon, CodeBracketIcon, CommandLineIcon, XMarkIcon } from "#icons";
import { useState } from "react";
import type { EffectiveSpec, SchemaInfo } from "@stesura/wordgard-dev-tools";
import { Button } from "#components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "#components/ui/context-menu";
import { CopyButton } from "#components/copy-button";
import { CopySelection } from "#components/copy-selection";
import { copy } from "#lib/clipboard.ts";
import { createMenuAnchor, type MenuAnchor } from "#lib/menu-anchor.ts";
import { json } from "#lib/json.ts";
import { Tip } from "#components/tip";
import { GuidePopover } from "#components/guide-popover";
import { SPEC_EFFECTIVE_MARK, SPEC_EFFECTIVE_NODE } from "../../guides/guides.ts";
import type { Kind } from "./schema-cards.tsx";
import { Toggle } from "./schema-heading.tsx";

/** A card's id (`node-Paragraph`): its kind and name. */
const parseCard = (card: string) => {
  const dash = card.indexOf("-");
  const kind = card.slice(0, dash);
  return {
    kind: kind == "node" || kind == "mark" || kind == "group" ? kind : null,
    name: card.slice(dash + 1),
  };
};

/** A card's JSON: a type's spec (and what applies, resolved), or a group's data. */
type CardJSON = {
  kind: Kind;
  name: string;
  label: string;
  value: unknown;
  effective: EffectiveSpec | null;
};

export const jsonOf = (schema: SchemaInfo | null, card: string | null): CardJSON | null => {
  const { kind, name } = parseCard(card ?? "");
  if (kind == "node") {
    const type = schema?.nodes.find((t) => t.name == name);
    return type ? { kind, name, label: "node", value: type.spec, effective: type.effective } : null;
  }
  if (kind == "mark") {
    const type = schema?.marks.find((t) => t.name == name);
    return type ? { kind, name, label: "mark", value: type.spec, effective: type.effective } : null;
  }
  const group = kind == "group" ? schema?.groups.find((g) => g.name == name) : undefined;
  return group ? { kind: "group", name, label: "node group", value: group, effective: null } : null;
};

export type JSONView = "spec" | "effective";

const noteText: Record<EffectiveSpec["notes"][string], string> = {
  default: "default",
  override: "override",
  schema: "from the schema",
};

/** What applies to a type, as JSON, each value that isn't the spec's with a comment saying why. */
const EffectiveJSON = ({ effective }: { effective: EffectiveSpec }) => {
  const entries = Object.entries(effective.value);
  return (
    <pre className="min-h-0 flex-1 overflow-auto p-2 font-mono text-xs whitespace-pre-wrap">
      <span className="block">{"{"}</span>
      {entries.map(([key, value], index) => {
        const note = effective.notes[key];
        return (
          <span key={key} className={cn("block", note == "override" && "bg-amber-500/15")}>
            {`  ${JSON.stringify(key)}: ${(JSON.stringify(value, null, 2) ?? "undefined").replace(/\n/g, "\n  ")}${index < entries.length - 1 ? "," : ""}`}
            {note && <span className="text-muted-foreground">{`  // ${noteText[note]}`}</span>}
          </span>
        );
      })}
      <span className="block">{"}"}</span>
    </pre>
  );
};

/** Logs a type (the live object), or with `json` its JSON; a group always as JSON. */
export type Log = (kind: Kind, name: string, json: boolean) => void;

/** The selected card's JSON (a type's spec, or what applies), with log, copy and close buttons. */
export const SpecPane = ({
  shown,
  view,
  onView,
  onLog,
  onClose,
}: {
  shown: CardJSON | null;
  view: JSONView;
  onView: (view: JSONView) => void;
  onLog: Log;
  onClose: () => void;
}) => {
  const effective = view == "effective" ? shown?.effective : null;
  // Overrides, not defaults, make what applies contradict the spec: they're what's flagged.
  const notes = shown?.effective?.notes ?? {};
  const overridden = Object.keys(notes).filter((key) => notes[key] == "override");
  const [menu] = useState(() =>
    createMenuAnchor(
      "[data-spec-json]",
      () => ({}),
      () => {}
    )
  );
  // The effective view copies its values, without the comments.
  const copied = () => (shown ? json(effective ? effective.value : shown.value) : "");
  return (
    <aside aria-label="Spec" className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-7 shrink-0 flex-wrap items-center gap-x-2 border-b bg-strip px-2 font-sans">
        {shown ? (
          <>
            <h3 className="font-medium">{shown.name}</h3>
            <span className="text-muted-foreground">{shown.label}</span>
            {shown.effective && (
              <span className="flex items-center gap-1">
                <Tip label="The spec, as written">
                  <Toggle pressed={view == "spec"} onClick={() => onView("spec")}>
                    Spec
                  </Toggle>
                </Tip>
                <Tip
                  label={
                    overridden.length
                      ? "What applies differs from the spec: an override changes it"
                      : "What applies: defaults filled in, overrides applied, what the schema works out"
                  }
                >
                  <Toggle
                    pressed={view == "effective"}
                    onClick={() => onView("effective")}
                    className={cn(
                      overridden.length > 0 &&
                        (view == "effective"
                          ? "bg-amber-700 text-white"
                          : "bg-amber-500/20 text-amber-800 hover:text-amber-950 dark:text-amber-300 dark:hover:text-amber-100")
                    )}
                  >
                    Effective
                  </Toggle>
                </Tip>
                {/* Only with the switch: a type, not a group. */}
                <GuidePopover
                  guide={shown.kind == "mark" ? SPEC_EFFECTIVE_MARK : SPEC_EFFECTIVE_NODE}
                  label="About spec and effective"
                  align="start"
                />
              </span>
            )}
          </>
        ) : (
          <h3 className="text-muted-foreground">JSON</h3>
        )}
        <span className="ml-auto flex items-center gap-1">
          {shown && shown.kind != "group" && (
            <IconButton
              label={`Log the ${shown.name} ${shown.kind} type to the page's console`}
              onClick={() => onLog(shown.kind, shown.name, false)}
            >
              <CommandLineIcon />
            </IconButton>
          )}
          {shown && <CopyButton label="Copy the JSON" text={copied} />}
          <Tip label="Close">
            <Button variant="ghost" size="icon-xs" aria-label="Close the JSON" onClick={onClose}>
              <XMarkIcon />
            </Button>
          </Tip>
        </span>
      </div>
      {overridden.length > 0 && (
        <p
          role="note"
          className="flex shrink-0 flex-wrap items-center gap-x-2 border-b bg-amber-500/10 px-2 py-1 font-sans text-amber-900 dark:text-amber-200"
        >
          {view == "spec" ? (
            <>
              <span>
                An override changes what applies:{" "}
                <span className="font-mono">{overridden.join(", ")}</span>.
              </span>
              <button
                type="button"
                className="cursor-pointer font-medium underline underline-offset-2"
                onClick={() => onView("effective")}
              >
                See the effective view
              </button>
            </>
          ) : (
            <span>Highlighted: what an override changes, not as the spec says.</span>
          )}
        </p>
      )}
      {shown ? (
        // `contents`: the JSON stays the pane's scrolling flex child.
        <div className="contents" onContextMenu={menu.onContextMenu}>
          <div data-spec-json className="contents">
            {effective ? (
              <EffectiveJSON effective={effective} />
            ) : (
              <pre className="min-h-0 flex-1 overflow-auto p-2 font-mono text-xs whitespace-pre-wrap">
                {json(shown.value)}
              </pre>
            )}
          </div>
          <SpecMenu shown={shown} anchor={menu} onLog={onLog} copied={copied} />
        </div>
      ) : (
        <p className="p-2 text-muted-foreground">
          Select a node type, mark type or group to see its JSON here.
        </p>
      )}
    </aside>
  );
};

/** The JSON pane's context menu: log the type (live) or its JSON, copy the JSON. */
const SpecMenu = ({
  shown,
  anchor,
  onLog,
  copied,
}: {
  shown: CardJSON;
  anchor: MenuAnchor<object>;
  onLog: Log;
  copied: () => string;
}) => {
  const { target: opened, setTrigger } = anchor;
  const target = useStore(opened);
  return (
    <ContextMenu>
      <ContextMenuTrigger className="hidden">
        <span ref={setTrigger} />
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <CopySelection text={target?.selection} />
        {shown.kind != "group" && (
          <ContextMenuItem onClick={() => onLog(shown.kind, shown.name, false)}>
            <CommandLineIcon /> Log to console
          </ContextMenuItem>
        )}
        <ContextMenuItem onClick={() => onLog(shown.kind, shown.name, true)}>
          <CodeBracketIcon /> Log JSON
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => void copy(copied())}>
          <ClipboardDocumentIcon /> Copy JSON
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};
