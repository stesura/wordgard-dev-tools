import { useStore } from "@nanostores/react";
import type { WritableAtom } from "nanostores";
import { cn } from "cn";
import {
  ArrowDownLeftIcon,
  ArrowDownRightIcon,
  ArrowUpLeftIcon,
  ArrowUpRightIcon,
  DockBottomIcon,
  DockLeftIcon,
  DockRightIcon,
  DockTopIcon,
  Cog6ToothIcon,
  XMarkIcon,
} from "#icons";
import {
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { PortalContainer } from "#components/portal";
import { Button } from "#components/ui/button";
import {
  DropdownMenuCheckboxItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from "#components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "#components/ui/tooltip";
import { Panel } from "./panel.tsx";
import { IconButton } from "#components/icon-button";
import { ChoiceMenu, type Choice } from "#components/choice-menu";
import type { PanelStore } from "#stores/panel-store.ts";
import type { ThemeStore } from "#stores/theme.ts";
import {
  type Corner,
  DEFAULT_SIZE,
  type DockLayout,
  type DockSide,
  clamp,
  cornerPlace,
  growKeys,
  placement,
  vertical,
} from "./dock-layout.ts";

const sides: Choice<DockSide>[] = [
  { value: "bottom", label: "Bottom", icon: <DockBottomIcon /> },
  { value: "right", label: "Right", icon: <DockRightIcon /> },
  { value: "top", label: "Top", icon: <DockTopIcon /> },
  { value: "left", label: "Left", icon: <DockLeftIcon /> },
];

const corners: Choice<Corner>[] = [
  { value: "top-left", label: "Top left", icon: <ArrowUpLeftIcon /> },
  { value: "top-right", label: "Top right", icon: <ArrowUpRightIcon /> },
  { value: "bottom-left", label: "Bottom left", icon: <ArrowDownLeftIcon /> },
  { value: "bottom-right", label: "Bottom right", icon: <ArrowDownRightIcon /> },
];

/** The Settings menu's groups for the reopen button: where it sits while the dock is closed, and whether it's only a cog. */
const ReopenSettings = ({
  corner,
  minimized,
  onCorner,
  onMinimized,
}: {
  corner: Corner;
  minimized: boolean;
  onCorner: (corner: Corner) => void;
  onMinimized: (minimized: boolean) => void;
}) => (
  <>
    <DropdownMenuGroup>
      <DropdownMenuLabel>Reopen button, while closed</DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={corner}
        onValueChange={(value) => {
          const found = corners.find((choice) => choice.value == value);
          if (found) onCorner(found.value);
        }}
      >
        {corners.map((choice) => (
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
    <DropdownMenuSeparator />
    <DropdownMenuGroup>
      <DropdownMenuLabel>DevTools floating button</DropdownMenuLabel>
      <DropdownMenuCheckboxItem
        checked={minimized}
        onCheckedChange={onMinimized}
        closeOnClick
        className="text-xs"
      >
        Show as icon
      </DropdownMenuCheckboxItem>
    </DropdownMenuGroup>
  </>
);

export type DockProps = {
  store: PanelStore;
  theme: ThemeStore;
  /** Saved as it changes; a resize is saved when the drag ends. */
  layout: WritableAtom<DockLayout>;
  /** Called on collapse and expand: a collapsed dock stops listening to the page. */
  setActive: (active: boolean) => void;
};

export const Dock = ({ store, theme, layout, setActive }: DockProps) => {
  const { dark } = useSyncExternalStore(theme.subscribe, theme.get);
  const { side, collapsed, corner, minimized, ...saved } = useStore(layout);
  // While dragging, the size the pointer gives; saved when the drag ends.
  const [dragged, setDragged] = useState<number | null>(null);
  const size = dragged ?? clamp(side, saved.size);
  const [reopenRoot, setReopenRoot] = useState<HTMLDivElement | null>(null);
  const save = (patch: Partial<DockLayout>) => layout.set({ ...layout.get(), size, ...patch });
  const drag = useRef<{ x: number; y: number; size: number } | null>(null);
  const place = placement[side];

  const collapse = (value: boolean) => {
    setActive(!value);
    save({ collapsed: value });
  };

  const move = (next: DockSide) => {
    if (next == side) return;
    // Each axis starts at its own default: a height makes a poor width.
    const nextSize =
      vertical(next) == vertical(side)
        ? size
        : clamp(next, DEFAULT_SIZE[vertical(next) ? "vertical" : "horizontal"]);
    save({ side: next, size: nextSize });
  };

  const resized = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    return (
      start &&
      clamp(side, start.size + place.grow(event.clientX - start.x, event.clientY - start.y))
    );
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, size };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const next = resized(event);
    if (next != null) setDragged(next);
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    // From the event: the last pointermove's size may not have rendered yet.
    const next = resized(event);
    drag.current = null;
    if (next == null) return;
    save({ size: next });
    setDragged(null);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const [grow, shrink] = growKeys[side];
    const step = event.key == grow ? 20 : event.key == shrink ? -20 : 0;
    if (!step) return;
    event.preventDefault();
    save({ size: clamp(side, size + step) });
  };

  if (collapsed) {
    return (
      // Its own portal root: the tooltip renders in it, themed (the panel's root isn't mounted).
      <PortalContainer value={reopenRoot}>
        <div
          ref={setReopenRoot}
          className={cn(
            "fixed z-2147483647 font-sans text-sm",
            cornerPlace[corner],
            dark && "dark"
          )}
        >
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size={minimized ? "icon" : "sm"}
                  aria-label="Open Wordgard DevTools"
                  // Black in both themes, white text (15:1 or more, hovered too); on a dark page a lighter
                  // border and a faint ring keep its edge visible.
                  className="border-neutral-800 bg-neutral-950 text-white shadow-md hover:bg-neutral-800 hover:text-white focus-visible:ring-neutral-400/50 dark:border-neutral-600 dark:bg-neutral-950 dark:ring-1 dark:ring-white/10 dark:hover:bg-neutral-800"
                  onClick={() => collapse(false)}
                />
              }
            >
              {minimized ? <Cog6ToothIcon /> : "Wordgard DevTools"}
            </TooltipTrigger>
            <TooltipContent side={corner.startsWith("top") ? "bottom" : "top"}>
              Open Wordgard DevTools
            </TooltipContent>
          </Tooltip>
        </div>
      </PortalContainer>
    );
  }

  return (
    <div
      className={cn("fixed z-2147483647 flex flex-col shadow-lg", place.dock)}
      style={vertical(side) ? { height: size } : { width: size }}
      role="region"
      aria-label="Wordgard DevTools"
      data-side={side}
    >
      <div
        role="separator"
        aria-orientation={vertical(side) ? "horizontal" : "vertical"}
        aria-label="Resize Wordgard DevTools"
        aria-valuenow={size}
        tabIndex={0}
        className={cn("absolute z-10 touch-none focus-visible:bg-ring/50", place.handle)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      />
      <Panel
        store={store}
        theme={theme}
        className="min-h-0 flex-1"
        titleRow={!vertical(side)}
        settings={
          <ReopenSettings
            corner={corner}
            minimized={minimized}
            onCorner={(value) => save({ corner: value })}
            onMinimized={(value) => save({ minimized: value })}
          />
        }
        actions={
          <>
            <ChoiceMenu label="Dock" value={side} choices={sides} onChange={move} />
            <IconButton label="Close" onClick={() => collapse(true)}>
              <XMarkIcon />
            </IconButton>
          </>
        }
      />
    </div>
  );
};
