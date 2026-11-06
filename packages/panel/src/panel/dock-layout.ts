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
export const vertical = (side: DockSide) => side == "top" || side == "bottom";

export const DEFAULT_SIZE = { vertical: 280, horizontal: 420 };

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

export const saveLayout = (layout: DockLayout) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(layout));
  } catch {
    // Storage blocked: the layout lasts until reload.
  }
};

export const clamp = (side: DockSide, size: number) => {
  const [min, max] = vertical(side)
    ? [120, window.innerHeight - 40]
    : [240, window.innerWidth - 40];
  return Math.round(Math.max(min, Math.min(max, size)));
};

// The dock's place, its resize handle on the edge facing the page, and which way the pointer
// grows it.
export const placement: Record<
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

// The keys that grow the dock, per side (the others shrink it).
export const growKeys: Record<DockSide, [grow: string, shrink: string]> = {
  bottom: ["ArrowUp", "ArrowDown"],
  top: ["ArrowDown", "ArrowUp"],
  right: ["ArrowLeft", "ArrowRight"],
  left: ["ArrowRight", "ArrowLeft"],
};

export const cornerPlace: Record<Corner, string> = {
  "top-left": "top-3 left-3",
  "top-right": "top-3 right-3",
  "bottom-left": "bottom-3 left-3",
  "bottom-right": "bottom-3 right-3",
};
