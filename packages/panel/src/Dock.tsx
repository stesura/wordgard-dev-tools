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
import { ChoiceMenu, IconButton, Panel, type Choice } from "./Panel.tsx";
import type { PanelStore } from "./store.ts";
import type { ThemeStore } from "./theme.ts";

export type DockSide = "bottom" | "right" | "top" | "left";

export type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

/**
 * `size` is the height for top and bottom, the width for left and right. The reopen button, shown
 * while closed, sits in `corner`, as a cog when `minimized`.
 */
export type DockLayout = {
  side: DockSide;
  size: number;
  collapsed: boolean;
  corner: Corner;
  minimized: boolean;
};

const KEY = "wordgard-devtools:dock";
const SIDES: readonly DockSide[] = ["bottom", "right", "top", "left"];
const isSide = (value: unknown): value is DockSide => SIDES.some((side) => side == value);
const CORNERS: readonly Corner[] = ["top-left", "top-right", "bottom-left", "bottom-right"];
const isCorner = (value: unknown): value is Corner => CORNERS.some((corner) => corner == value);
const vertical = (side: DockSide) => side == "top" || side == "bottom";

const DEFAULT_SIZE = { vertical: 280, horizontal: 420 };

export const readLayout = (): DockLayout => {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "null");
    const side = isSide(stored?.side) ? stored.side : "bottom";
    return {
      side,
      size:
        typeof stored?.size == "number"
          ? stored.size
          : DEFAULT_SIZE[vertical(side) ? "vertical" : "horizontal"],
      collapsed: stored?.collapsed === true,
      corner: isCorner(stored?.corner) ? stored.corner : "bottom-right",
      minimized: stored?.minimized === true,
    };
  } catch {
    return {
      side: "bottom",
      size: DEFAULT_SIZE.vertical,
      collapsed: false,
      corner: "bottom-right",
      minimized: false,
    };
  }
};

const saveLayout = (layout: DockLayout) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(layout));
  } catch {
    // Storage blocked: the layout lasts until reload.
  }
};

const clamp = (side: DockSide, size: number) => {
  const [min, max] = vertical(side)
    ? [120, window.innerHeight - 40]
    : [240, window.innerWidth - 40];
  return Math.round(Math.max(min, Math.min(max, size)));
};

// The dock's place, its resize handle on the edge facing the page, and which way the pointer
// grows it.
const placement: Record<
  DockSide,
  { dock: string; handle: string; grow: (dx: number, dy: number) => number }
> = {
  bottom: {
    dock: "inset-x-0 bottom-0 border-t",
    handle: "inset-x-0 -top-1 h-2 cursor-row-resize",
    grow: (_, dy) => -dy,
  },
  top: {
    dock: "inset-x-0 top-0 border-b",
    handle: "inset-x-0 -bottom-1 h-2 cursor-row-resize",
    grow: (_, dy) => dy,
  },
  right: {
    dock: "inset-y-0 right-0 border-l",
    handle: "inset-y-0 -left-1 w-2 cursor-col-resize",
    grow: (dx) => -dx,
  },
  left: {
    dock: "inset-y-0 left-0 border-r",
    handle: "inset-y-0 -right-1 w-2 cursor-col-resize",
    grow: (dx) => dx,
  },
};

const sides: Choice<DockSide>[] = [
  { value: "bottom", label: "Bottom", icon: <DockBottomIcon /> },
  { value: "right", label: "Right", icon: <DockRightIcon /> },
  { value: "top", label: "Top", icon: <DockTopIcon /> },
  { value: "left", label: "Left", icon: <DockLeftIcon /> },
];

// The keys that grow the dock, per side (the others shrink it).
const growKeys: Record<DockSide, [grow: string, shrink: string]> = {
  bottom: ["ArrowUp", "ArrowDown"],
  top: ["ArrowDown", "ArrowUp"],
  right: ["ArrowLeft", "ArrowRight"],
  left: ["ArrowRight", "ArrowLeft"],
};

const cornerPlace: Record<Corner, string> = {
  "top-left": "top-3 left-3",
  "top-right": "top-3 right-3",
  "bottom-left": "bottom-3 left-3",
  "bottom-right": "bottom-3 right-3",
};

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
  initial: DockLayout;
  /** Called on collapse and expand: a collapsed dock stops listening to the page. */
  setActive: (active: boolean) => void;
};

export const Dock = ({ store, theme, initial, setActive }: DockProps) => {
  const { dark } = useSyncExternalStore(theme.subscribe, theme.get);
  const [side, setSide] = useState(initial.side);
  const [size, setSize] = useState(() => clamp(initial.side, initial.size));
  const [collapsed, setCollapsed] = useState(initial.collapsed);
  const [corner, setCorner] = useState(initial.corner);
  const [reopenRoot, setReopenRoot] = useState<HTMLDivElement | null>(null);
  const [minimized, setMinimized] = useState(initial.minimized);
  const save = (patch: Partial<DockLayout>) =>
    saveLayout({ side, size, collapsed, corner, minimized, ...patch });
  const drag = useRef<{ x: number; y: number; size: number } | null>(null);
  const place = placement[side];

  const collapse = (value: boolean) => {
    setCollapsed(value);
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
    setSide(next);
    setSize(nextSize);
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
    if (next != null) setSize(next);
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    // From the event: the last pointermove's size may not have rendered yet.
    const next = resized(event);
    drag.current = null;
    if (next == null) return;
    setSize(next);
    save({ size: next });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const [grow, shrink] = growKeys[side];
    const step = event.key == grow ? 20 : event.key == shrink ? -20 : 0;
    if (!step) return;
    event.preventDefault();
    const next = clamp(side, size + step);
    setSize(next);
    save({ size: next });
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
            onCorner={(value) => {
              setCorner(value);
              save({ corner: value });
            }}
            onMinimized={(value) => {
              setMinimized(value);
              save({ minimized: value });
            }}
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
