import { CommandLineIcon, RecordIcon } from "#icons";
import { useSyncExternalStore } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#components/ui/tabs";
import { Log } from "../tabs/log/log.tsx";
import { Fields } from "../tabs/fields/fields.tsx";
import { Schema } from "../tabs/schema/schema.tsx";
import { State } from "../tabs/state/state.tsx";
import { View as ViewTab } from "../tabs/dom/dom.tsx";
import { GuideButton } from "#components/guide-popover";
import { isView, type PanelStore } from "#stores/panel-store.ts";
import { SelectionBar } from "../tabs/selection/selection-bar.tsx";
import { SelectionTab } from "../tabs/selection/selection.tsx";
import { Structure } from "../tabs/structure/structure.tsx";
import { IconButton } from "#components/icon-button";

// As in VS Code: square tabs, full height, split by a line; the active one takes the toolbar's
// colour below and covers the bar's bottom border (-mb-px), so the two join.
const tabClass =
  "-mb-px h-7 flex-none rounded-none border-0 border-r border-r-border px-3 text-xs text-muted-foreground hover:text-foreground focus-visible:border-r-border focus-visible:ring-2 focus-visible:ring-inset data-active:bg-strip data-active:text-foreground dark:data-active:bg-strip dark:data-active:border-r-border group-data-[variant=default]/tabs-list:data-active:shadow-none";

export const Body = ({ store }: { store: PanelStore }) => {
  const { editors, selected, view, recording } = useSyncExternalStore(store.subscribe, store.get);
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
      {/* Wraps rather than hiding tabs. The button sits outside the tablist, which holds only tabs. */}
      <div className="flex shrink-0 items-start border-b bg-muted">
        <TabsList className="h-auto min-w-0 flex-1 flex-wrap items-stretch justify-start gap-0 rounded-none bg-muted p-0 group-data-horizontal/tabs:h-auto">
          <TabsTrigger value="structure" className={tabClass}>
            Structure
          </TabsTrigger>
          <TabsTrigger value="selection" className={tabClass}>
            Selection
          </TabsTrigger>
          <TabsTrigger value="state" className={tabClass}>
            State
          </TabsTrigger>
          <TabsTrigger value="view" className={tabClass}>
            DOM
          </TabsTrigger>
          <TabsTrigger value="schema" className={tabClass}>
            Schema
          </TabsTrigger>
          <TabsTrigger value="fields" className={tabClass}>
            Fields
          </TabsTrigger>
          <TabsTrigger value="log" className={tabClass}>
            Log
            {/* Seen from any tab: the log is recording. */}
            {recording && (
              <>
                <RecordIcon aria-hidden className="size-2 text-destructive" />
                <span className="sr-only">(recording)</span>
              </>
            )}
          </TabsTrigger>
        </TabsList>
        <span className="flex h-7 shrink-0 items-center gap-0.5 px-1">
          <GuideButton view={view} />
          <IconButton
            label="Log the editor to the page's console"
            onClick={() =>
              void store.transport.send({ type: "logEditor", id: selected }).catch(() => {})
            }
          >
            <CommandLineIcon />
          </IconButton>
        </span>
      </div>
      <TabsContent
        value="structure"
        keepMounted
        className="flex min-h-0 flex-col data-hidden:hidden"
      >
        <Structure key={selected} store={store} editorId={selected} />
      </TabsContent>
      <TabsContent
        value="selection"
        keepMounted
        className="flex min-h-0 flex-col data-hidden:hidden"
      >
        <SelectionTab key={selected} store={store} editorId={selected} />
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
      <SelectionBar store={store} editorId={selected} />
    </Tabs>
  );
};
