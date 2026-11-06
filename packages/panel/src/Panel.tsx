import { cn } from "cn";
import {
  MonitorIcon,
  MoonIcon,
  MousePointerClickIcon,
  PauseIcon,
  PlayIcon,
  SunIcon,
} from "lucide-react";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import type { EditorInfo } from "@stesura/wordgard-dev-tools";
import { PortalContainer } from "#components/portal";
import { Button } from "#components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "#components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "#components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#components/ui/tabs";
import { Log } from "./Log.tsx";
import { Fields } from "./Fields.tsx";
import { Schema } from "./Schema.tsx";
import { State } from "./State.tsx";
import { View as ViewTab } from "./View.tsx";
import type { PanelStore, View } from "./store.ts";
import { Structure } from "./Structure.tsx";
import type { ThemeChoice, ThemeStore } from "./theme.ts";

const editorLabel = (editor: EditorInfo) =>
  `${editor.name} · #${editor.id}` + (editor.frame ? ` · ${editor.frame}` : "");

const EditorPicker = ({ store }: { store: PanelStore }) => {
  const { editors, selected, paused } = useSyncExternalStore(store.subscribe, store.get);
  const items = editors.map((editor) => ({ value: editor.id, label: editorLabel(editor) }));
  return (
    <Select
      items={items}
      value={selected}
      // Base UI also reports changes it makes itself ("none": the selected editor left the list,
      // or the value prop moved): only the user's picks count.
      onValueChange={(id, details) => {
        if (id != null && details.reason != "none") void store.select(id);
      }}
      disabled={!editors.length || paused}
    >
      <SelectTrigger size="sm" aria-label="Editor" className="min-w-40">
        <SelectValue placeholder="No editors" />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} align="start">
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

const PauseButton = ({ store }: { store: PanelStore }) => {
  const { paused } = useSyncExternalStore(store.subscribe, store.get);
  return (
    <IconButton
      label={paused ? "Resume the devtool" : "Pause the devtool"}
      pressed={paused}
      onClick={() => store.pause(!paused)}
    >
      {paused ? <PlayIcon /> : <PauseIcon className="fill-current" />}
    </IconButton>
  );
};

/** Over the panel while paused: nothing it shows is live. */
const PausedOverlay = ({ store }: { store: PanelStore }) => {
  const { paused } = useSyncExternalStore(store.subscribe, store.get);
  if (!paused) return null;
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/80 backdrop-blur-[1px]">
      <Button variant="outline" onClick={() => store.pause(false)}>
        <PlayIcon />
        The devtool is paused
      </Button>
    </div>
  );
};

const PickButton = ({ store }: { store: PanelStore }) => {
  const { picking, editors, paused } = useSyncExternalStore(store.subscribe, store.get);
  if (!editors.length || paused) return null;
  return (
    <IconButton
      label="Pick a node in the page"
      pressed={picking}
      onClick={() => store.pick(!picking)}
    >
      <MousePointerClickIcon className={cn(picking && "text-primary")} />
    </IconButton>
  );
};

export type Choice<T> = { value: T; label: string; icon: ReactNode };

/** An icon button opening a menu of choices, the current one checked. */
export const ChoiceMenu = <T extends string>({
  label,
  value,
  choices,
  onChange,
}: {
  label: string;
  value: T;
  choices: Choice<T>[];
  onChange: (value: T) => void;
}) => {
  const current = choices.find((choice) => choice.value == value);
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`${label}: ${current?.label ?? value}`}
                />
              }
            />
          }
        >
          {current?.icon}
        </TooltipTrigger>
        <TooltipContent side="top">{label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-auto">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{label}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={value}
            onValueChange={(next) => {
              const found = choices.find((choice) => choice.value == next);
              if (found) onChange(found.value);
            }}
          >
            {choices.map((choice) => (
              <DropdownMenuRadioItem
                key={choice.value}
                value={choice.value}
                closeOnClick
                className="text-xs"
              >
                {choice.icon}
                {choice.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const themes: Choice<ThemeChoice>[] = [
  { value: "system", label: "System", icon: <MonitorIcon /> },
  { value: "light", label: "Light", icon: <SunIcon /> },
  { value: "dark", label: "Dark", icon: <MoonIcon /> },
];

const ThemeMenu = ({ theme }: { theme: ThemeStore }) => {
  const { choice } = useSyncExternalStore(theme.subscribe, theme.get);
  return <ChoiceMenu label="Theme" value={choice} choices={themes} onChange={theme.set} />;
};

export const IconButton = ({
  label,
  onClick,
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  /** A toggle's state. */
  pressed?: boolean;
  children: ReactNode;
}) => (
  <Tooltip>
    <TooltipTrigger
      render={
        <Button
          variant={pressed ? "secondary" : "ghost"}
          size="icon-xs"
          aria-label={label}
          aria-pressed={pressed}
          onClick={onClick}
        />
      }
    >
      {children}
    </TooltipTrigger>
    <TooltipContent side="top">{label}</TooltipContent>
  </Tooltip>
);

const Notices = ({ store }: { store: PanelStore }) => {
  const { error, notices } = useSyncExternalStore(store.subscribe, store.get);
  return [error, ...notices].map(
    (text, index) =>
      text && (
        <p key={index} role="alert" className="border-b px-2 py-1 text-destructive">
          {text}
        </p>
      ),
  );
};

const tabClass =
  "h-6 flex-none px-2.5 text-xs text-muted-foreground hover:text-foreground data-active:border-border data-active:bg-background data-active:text-foreground";

const isView = (value: unknown): value is View =>
  value == "structure" ||
  value == "state" ||
  value == "view" ||
  value == "schema" ||
  value == "fields" ||
  value == "log";

const Body = ({ store }: { store: PanelStore }) => {
  const { editors, selected, view } = useSyncExternalStore(store.subscribe, store.get);
  if (!editors.length) {
    return (
      <p className="p-2 text-muted-foreground">
        No editors. Add <code className="font-mono">wordgardDevtools()</code> to an editor's
        configuration.
      </p>
    );
  }
  if (selected == null) return null;
  // The tabs stay mounted (each keeps what is collapsed and focused); per editor, so switching starts afresh.
  return (
    <Tabs
      value={view}
      onValueChange={(value) => {
        if (isView(value)) store.setView(value);
      }}
      className="min-h-0 flex-1 gap-0"
    >
      {/* Filled tabs on the bar's grey; the active one on the content's background. Wraps rather than hiding tabs. */}
      <TabsList className="h-auto min-h-8 w-full shrink-0 flex-wrap justify-start gap-0.5 rounded-none border-b bg-muted px-1 py-1 group-data-horizontal/tabs:h-auto">
        <TabsTrigger value="structure" className={tabClass}>
          Structure
        </TabsTrigger>
        <TabsTrigger value="state" className={tabClass}>
          State
        </TabsTrigger>
        <TabsTrigger value="view" className={tabClass}>
          View
        </TabsTrigger>
        <TabsTrigger value="schema" className={tabClass}>
          Schema
        </TabsTrigger>
        <TabsTrigger value="fields" className={tabClass}>
          Fields
        </TabsTrigger>
        <TabsTrigger value="log" className={tabClass}>
          Log
        </TabsTrigger>
      </TabsList>
      <TabsContent
        value="structure"
        keepMounted
        className="flex min-h-0 flex-col data-hidden:hidden"
      >
        <Structure key={selected} store={store} editorId={selected} />
      </TabsContent>
      <TabsContent value="state" keepMounted className="flex min-h-0 flex-col data-hidden:hidden">
        <State key={selected} store={store} editorId={selected} />
      </TabsContent>
      <TabsContent value="view" keepMounted className="flex min-h-0 flex-col data-hidden:hidden">
        <ViewTab key={selected} store={store} editorId={selected} />
      </TabsContent>
      <TabsContent value="schema" keepMounted className="flex min-h-0 flex-col data-hidden:hidden">
        <Schema key={selected} store={store} editorId={selected} />
      </TabsContent>
      <TabsContent value="fields" keepMounted className="flex min-h-0 flex-col data-hidden:hidden">
        <Fields key={selected} store={store} editorId={selected} />
      </TabsContent>
      <TabsContent value="log" keepMounted className="flex min-h-0 flex-col data-hidden:hidden">
        <Log key={selected} store={store} editorId={selected} />
      </TabsContent>
    </Tabs>
  );
};

export type PanelProps = {
  store: PanelStore;
  theme: ThemeStore;
  /** Extra toolbar buttons, at its end (the dock's collapse button). */
  actions?: ReactNode;
  /** The title on a row of its own (the dock on the left or right, where the toolbar is narrow). */
  titleRow?: boolean;
  className?: string;
};

const TITLE = "Wordgard DevTools";

export const Panel = ({ store, theme, actions, titleRow, className }: PanelProps) => {
  const { dark } = useSyncExternalStore(theme.subscribe, theme.get);
  const { editors, paused } = useSyncExternalStore(store.subscribe, store.get);
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  return (
    <PortalContainer value={root}>
      <div
        ref={setRoot}
        className={cn(
          "flex h-full flex-col bg-background font-sans text-sm text-foreground antialiased",
          dark && "dark",
          className,
        )}
      >
        {titleRow && (
          <div className="shrink-0 border-b bg-muted px-2 py-1 font-semibold">{TITLE}</div>
        )}
        <header className="flex min-h-8 shrink-0 flex-wrap items-center gap-x-2 border-b bg-muted px-2">
          {!titleRow && <span className="font-semibold">{TITLE}</span>}
          <EditorPicker store={store} />
          <PickButton store={store} />
          <PauseButton store={store} />
          <span className="text-xs text-muted-foreground">
            {editors.length} editor{editors.length == 1 ? "" : "s"}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <ThemeMenu theme={theme} />
            {actions}
          </div>
        </header>
        <Notices store={store} />
        <main className="relative flex min-h-0 flex-1 flex-col">
          {/* Out of reach while paused: nothing under the overlay is live. */}
          <div inert={paused} className="flex min-h-0 flex-1 flex-col">
            <Body store={store} />
          </div>
          <PausedOverlay store={store} />
        </main>
      </div>
    </PortalContainer>
  );
};
