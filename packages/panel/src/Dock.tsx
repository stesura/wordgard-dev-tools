import {cn} from "cn"
import {
  PanelBottomIcon,
  PanelLeftIcon,
  PanelRightIcon,
  PanelTopIcon,
  XIcon,
} from "lucide-react"
import {useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent} from "react"
import {Button} from "#components/ui/button"
import {ChoiceMenu, IconButton, Panel, type Choice} from "./Panel.tsx"
import type {PanelStore} from "./store.ts"
import type {ThemeStore} from "./theme.ts"

export type DockSide = "bottom" | "right" | "top" | "left"

/** `size` is the height for top and bottom, the width for left and right. */
export type DockLayout = {side: DockSide; size: number; collapsed: boolean}

const KEY = "wordgard-devtools:dock"
const SIDES: readonly DockSide[] = ["bottom", "right", "top", "left"]
const isSide = (value: unknown): value is DockSide => SIDES.some(side => side == value)
const vertical = (side: DockSide) => side == "top" || side == "bottom"

const DEFAULT_SIZE = {vertical: 280, horizontal: 420}

export const readLayout = (): DockLayout => {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "null")
    const side = isSide(stored?.side) ? stored.side : "bottom"
    return {
      side,
      size: typeof stored?.size == "number" ? stored.size : DEFAULT_SIZE[vertical(side) ? "vertical" : "horizontal"],
      collapsed: stored?.collapsed === true,
    }
  } catch {
    return {side: "bottom", size: DEFAULT_SIZE.vertical, collapsed: false}
  }
}

const saveLayout = (layout: DockLayout) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(layout))
  } catch {
    // Storage blocked: the layout lasts until reload.
  }
}

const clamp = (side: DockSide, size: number) => {
  const [min, max] = vertical(side) ? [120, window.innerHeight - 40] : [240, window.innerWidth - 40]
  return Math.round(Math.max(min, Math.min(max, size)))
}

// The dock's place, its resize handle on the edge facing the page, and which way the pointer
// grows it.
const placement: Record<DockSide, {dock: string; handle: string; grow: (dx: number, dy: number) => number}> = {
  bottom: {dock: "inset-x-0 bottom-0 border-t", handle: "inset-x-0 -top-1 h-2 cursor-row-resize", grow: (_, dy) => -dy},
  top: {dock: "inset-x-0 top-0 border-b", handle: "inset-x-0 -bottom-1 h-2 cursor-row-resize", grow: (_, dy) => dy},
  right: {dock: "inset-y-0 right-0 border-l", handle: "inset-y-0 -left-1 w-2 cursor-col-resize", grow: dx => -dx},
  left: {dock: "inset-y-0 left-0 border-r", handle: "inset-y-0 -right-1 w-2 cursor-col-resize", grow: dx => dx},
}

const sides: Choice<DockSide>[] = [
  {value: "bottom", label: "Bottom", icon: <PanelBottomIcon />},
  {value: "right", label: "Right", icon: <PanelRightIcon />},
  {value: "top", label: "Top", icon: <PanelTopIcon />},
  {value: "left", label: "Left", icon: <PanelLeftIcon />},
]

// The keys that grow the dock, per side (the others shrink it).
const growKeys: Record<DockSide, [grow: string, shrink: string]> = {
  bottom: ["ArrowUp", "ArrowDown"],
  top: ["ArrowDown", "ArrowUp"],
  right: ["ArrowLeft", "ArrowRight"],
  left: ["ArrowRight", "ArrowLeft"],
}

export type DockProps = {
  store: PanelStore
  theme: ThemeStore
  initial: DockLayout
  /** Called on collapse and expand: a collapsed dock stops listening to the page. */
  setActive: (active: boolean) => void
}

export const Dock = ({store, theme, initial, setActive}: DockProps) => {
  const {dark} = useSyncExternalStore(theme.subscribe, theme.get)
  const [side, setSide] = useState(initial.side)
  const [size, setSize] = useState(() => clamp(initial.side, initial.size))
  const [collapsed, setCollapsed] = useState(initial.collapsed)
  const drag = useRef<{x: number; y: number; size: number} | null>(null)
  const place = placement[side]

  const collapse = (value: boolean) => {
    setCollapsed(value)
    setActive(!value)
    saveLayout({side, size, collapsed: value})
  }

  const move = (next: DockSide) => {
    if (next == side) return
    // Each axis starts at its own default: a height makes a poor width.
    const nextSize = vertical(next) == vertical(side) ? size : clamp(next, DEFAULT_SIZE[vertical(next) ? "vertical" : "horizontal"])
    setSide(next)
    setSize(nextSize)
    saveLayout({side: next, size: nextSize, collapsed})
  }

  const resized = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current
    return start && clamp(side, start.size + place.grow(event.clientX - start.x, event.clientY - start.y))
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = {x: event.clientX, y: event.clientY, size}
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const next = resized(event)
    if (next != null) setSize(next)
  }
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    // From the event: the last pointermove's size may not have rendered yet.
    const next = resized(event)
    drag.current = null
    if (next == null) return
    setSize(next)
    saveLayout({side, size: next, collapsed})
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const [grow, shrink] = growKeys[side]
    const step = event.key == grow ? 20 : event.key == shrink ? -20 : 0
    if (!step) return
    event.preventDefault()
    const next = clamp(side, size + step)
    setSize(next)
    saveLayout({side, size: next, collapsed})
  }

  if (collapsed) {
    return (
      <div className={cn("fixed right-3 bottom-3 z-2147483647 font-sans text-sm", dark && "dark")}>
        <Button size="sm" variant="outline" className="shadow-md" onClick={() => collapse(false)}>
          Wordgard DevTools
        </Button>
      </div>
    )
  }

  return (
    <div
      className={cn("fixed z-2147483647 flex flex-col shadow-lg", place.dock)}
      style={vertical(side) ? {height: size} : {width: size}}
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
        actions={
          <>
            <ChoiceMenu label="Dock" value={side} choices={sides} onChange={move} />
            <IconButton label="Close" onClick={() => collapse(true)}>
              <XIcon />
            </IconButton>
          </>
        }
      />
    </div>
  )
}
