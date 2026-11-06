import { cn } from "cn";
import { CursorArrowRaysIcon, PauseIcon, PlayIcon } from "#icons";
import { useSyncExternalStore } from "react";
import { Button } from "#components/ui/button";
import type { PanelStore } from "#stores/panel-store.ts";
import { IconButton } from "#components/icon-button";

export const PauseButton = ({ store }: { store: PanelStore }) => {
  const { paused } = useSyncExternalStore(store.subscribe, store.get);
  return (
    <IconButton
      label={paused ? "Resume the devtool" : "Pause the devtool"}
      pressed={paused}
      onClick={() => store.pause(!paused)}
    >
      {paused ? <PlayIcon /> : <PauseIcon />}
    </IconButton>
  );
};

/** Over the panel while paused: nothing it shows is live. */
export const PausedOverlay = ({ store }: { store: PanelStore }) => {
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

export const PickButton = ({ store }: { store: PanelStore }) => {
  const { picking, editors, paused } = useSyncExternalStore(store.subscribe, store.get);
  if (!editors.length || paused) return null;
  return (
    <IconButton
      label="Pick a node in the page"
      pressed={picking}
      onClick={() => store.pick(!picking)}
    >
      <CursorArrowRaysIcon className={cn(picking && "text-primary")} />
    </IconButton>
  );
};

export const Notices = ({ store }: { store: PanelStore }) => {
  const { error, notices } = useSyncExternalStore(store.subscribe, store.get);
  return [error, ...notices].map(
    (text, index) =>
      text && (
        <p key={index} role="alert" className="border-b px-2 py-1 text-destructive">
          {text}
        </p>
      )
  );
};
