import { CommandLineIcon, RecordIcon } from "#icons";
import { useSyncExternalStore } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#components/ui/tabs";
import { GuideButton } from "#components/guide-popover";
import { IconButton } from "#components/icon-button";
import type { PanelStore } from "#stores/panel-store.ts";
import { GUIDES } from "../guides/guides.ts";
import { TAB_COMPONENTS } from "../tabs/registry.tsx";
import { SelectionBar } from "../tabs/selection/selection-bar.tsx";
import { TABS, isTab } from "../tabs/tabs.ts";

// As in VS Code: square tabs, full height, split by a line; the active one takes the toolbar's
// colour below and covers the bar's bottom border (-mb-px), so the two join.
const tabClass =
  "-mb-px h-7 flex-none rounded-none border-0 border-r border-r-border px-3 text-xs text-muted-foreground hover:text-foreground focus-visible:border-r-border focus-visible:ring-2 focus-visible:ring-inset data-active:bg-strip data-active:text-foreground dark:data-active:bg-strip dark:data-active:border-r-border group-data-[variant=default]/tabs-list:data-active:shadow-none";

export const Body = ({ store }: { store: PanelStore }) => {
  const { editors, selected, tab, recording } = useSyncExternalStore(store.subscribe, store.get);
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
      value={tab}
      onValueChange={(value) => {
        if (isTab(value)) store.setTab(value);
      }}
      className="min-h-0 flex-1 gap-0"
    >
      {/* Wraps rather than hiding tabs. The button sits outside the tablist, which holds only tabs. */}
      <div className="flex shrink-0 items-start border-b bg-muted">
        <TabsList className="h-auto min-w-0 flex-1 flex-wrap items-stretch justify-start gap-0 rounded-none bg-muted p-0 group-data-horizontal/tabs:h-auto">
          {TABS.map(({ id, label }) => (
            <TabsTrigger key={id} value={id} className={tabClass}>
              {label}
              {/* Seen from any tab: the log is recording. */}
              {id == "log" && recording && (
                <>
                  <RecordIcon aria-hidden className="size-2 text-destructive" />
                  <span className="sr-only">(recording)</span>
                </>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
        <span className="flex h-7 shrink-0 items-center gap-0.5 px-1">
          <GuideButton guide={GUIDES[tab]} />
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
      {TABS.map(({ id }) => {
        const Content = TAB_COMPONENTS[id];
        return (
          <TabsContent
            key={id}
            value={id}
            keepMounted
            className="flex min-h-0 flex-col data-hidden:hidden"
          >
            <Content key={selected} store={store} editorId={selected} />
          </TabsContent>
        );
      })}
      <SelectionBar store={store} editorId={selected} />
    </Tabs>
  );
};
