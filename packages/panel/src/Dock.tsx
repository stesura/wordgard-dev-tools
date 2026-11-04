import {cn} from "cn"
import {ChevronDownIcon} from "lucide-react"
import {useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent} from "react"
import {Button} from "#components/ui/button"
import {IconButton, Panel} from "./Panel.tsx"
import type {PanelStore} from "./store.ts"
import type {ThemeStore} from "./theme.ts"

export type DockLayout = {height: number; collapsed: boolean}

const KEY = "wordgard-devtools:dock"
const MIN_HEIGHT = 120

export const readLayout = (): DockLayout => {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "null")
    return {
      height: typeof stored?.height == "number" ? stored.height : 280,
      collapsed: stored?.collapsed === true,
    }
  } catch {
    return {height: 280, collapsed: false}
  }
}

const saveLayout = (layout: DockLayout) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(layout))
  } catch {
    // Storage blocked: the layout lasts until reload.
  }
}

const clamp = (height: number) => Math.round(Math.max(MIN_HEIGHT, Math.min(window.innerHeight - 40, height)))

export type DockProps = {
  store: PanelStore
  theme: ThemeStore
  initial: DockLayout
  /** Called on collapse and expand: a collapsed dock stops listening to the page. */
  setActive: (active: boolean) => void
}

export const Dock = ({store, theme, initial, setActive}: DockProps) => {
  const {dark} = useSyncExternalStore(theme.subscribe, theme.get)
  const [height, setHeight] = useState(() => clamp(initial.height))
  const [collapsed, setCollapsed] = useState(initial.collapsed)
  const drag = useRef<{y: number; height: number} | null>(null)

  const collapse = (value: boolean) => {
    setCollapsed(value)
    setActive(!value)
    saveLayout({height, collapsed: value})
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = {y: event.clientY, height}
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current) setHeight(clamp(drag.current.height + drag.current.y - event.clientY))
  }
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return
    // From the event: the last pointermove's height may not have rendered yet.
    const next = clamp(drag.current.height + drag.current.y - event.clientY)
    drag.current = null
    setHeight(next)
    saveLayout({height: next, collapsed})
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key == "ArrowUp" ? 20 : event.key == "ArrowDown" ? -20 : 0
    if (!step) return
    event.preventDefault()
    const next = clamp(height + step)
    setHeight(next)
    saveLayout({height: next, collapsed})
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
      className="fixed inset-x-0 bottom-0 z-2147483647 flex flex-col border-t shadow-lg"
      style={{height}}
      role="region"
      aria-label="Wordgard DevTools"
    >
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize Wordgard DevTools"
        aria-valuenow={height}
        tabIndex={0}
        className="absolute inset-x-0 -top-1 z-10 h-2 cursor-row-resize touch-none focus-visible:bg-ring/50"
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
        actions={
          <IconButton label="Collapse" onClick={() => collapse(true)}>
            <ChevronDownIcon />
          </IconButton>
        }
      />
    </div>
  )
}
