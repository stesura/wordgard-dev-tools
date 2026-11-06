import { useStore } from "@nanostores/react";
import { cn } from "cn";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { PortalContainer } from "#components/portal";
import { PanelSettingsContext, createPanelSettings } from "#components/panel-settings";
import type { PanelStore } from "#stores/panel-store.ts";
import type { ThemeStore } from "#stores/theme.ts";
import { EditorPicker } from "./editor-picker.tsx";
import { Notices, PauseButton, PausedOverlay, PickButton } from "./panel-controls.tsx";
import { SettingsMenu, ThemeMenu } from "./settings-menu.tsx";
import { Body } from "./panel-body.tsx";

export type PanelProps = {
  store: PanelStore;
  theme: ThemeStore;
  /** Extra toolbar buttons, at its end (the dock's collapse button). */
  actions?: ReactNode;
  /** Extra groups in the Settings menu (the dock's reopen button). */
  settings?: ReactNode;
  /** The title on a row of its own (the dock on the left or right, where the toolbar is narrow). */
  titleRow?: boolean;
  className?: string;
};

const TITLE = "Wordgard DevTools";

export const Panel = ({ store, theme, actions, settings, titleRow, className }: PanelProps) => {
  const { dark } = useSyncExternalStore(theme.subscribe, theme.get);
  const { editors, paused } = useStore(store.state);
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  // Read as the panel mounts: what's saved now.
  const [saved] = useState(createPanelSettings);
  return (
    <PanelSettingsContext value={saved}>
      <PortalContainer value={root}>
        <div
          ref={setRoot}
          className={cn(
            "flex h-full flex-col bg-background font-sans text-sm text-foreground antialiased",
            dark && "dark",
            className
          )}
        >
          {titleRow && (
            <div className="shrink-0 border-b bg-muted px-2 py-1 font-semibold">{TITLE}</div>
          )}
          <header className="flex min-h-8 shrink-0 flex-wrap items-center gap-x-2 border-b bg-muted px-2">
            {!titleRow && <span className="font-semibold whitespace-nowrap">{TITLE}</span>}
            {/* The editor's controls and the panel's buttons, together: on the title's line when they
              fit, else on a line of their own under it (wrapping again at the narrowest). */}
            {/* flex-auto, not flex-1: sized by its content, it moves under the title rather than squeezing. */}
            <div className="flex min-h-8 flex-auto flex-wrap items-center gap-x-2">
              <EditorPicker store={store} />
              <span className="text-xs whitespace-nowrap text-muted-foreground">
                {editors.length} editor{editors.length == 1 ? "" : "s"}
              </span>
              <PickButton store={store} />
              <PauseButton store={store} />
              <div className="ml-auto flex items-center gap-1">
                <ThemeMenu theme={theme} />
                <SettingsMenu extra={settings} />
                {actions}
              </div>
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
    </PanelSettingsContext>
  );
};
