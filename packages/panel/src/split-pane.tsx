import {useCallback, useRef, useState, type ReactNode} from "react"
import {ResizableHandle, ResizablePanel, ResizablePanelGroup} from "#components/ui/resizable"

type Orientation = "horizontal" | "vertical"

const KEY = "wordgard-devtools:pane"
// Side by side from this width (Tailwind's @2xl), the pane under the content below it.
const WIDE = 672
const DEFAULT: Record<Orientation, number> = {horizontal: 352, vertical: 192}
const MIN: Record<Orientation, number> = {horizontal: 200, vertical: 80}

const load = (): Record<Orientation, number> => {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "null")
    const size = (orientation: Orientation) =>
      typeof stored?.[orientation] == "number" ? stored[orientation] : DEFAULT[orientation]
    return {horizontal: size("horizontal"), vertical: size("vertical")}
  } catch {
    return {...DEFAULT}
  }
}

// Shared by every tab and editor: the pane keeps the size the user gave it.
let sizes: Record<Orientation, number> | null = null
const sizeOf = (orientation: Orientation) => (sizes ??= load())[orientation]
const save = (orientation: Orientation, size: number) => {
  sizes = {...(sizes ??= load()), [orientation]: Math.round(size)}
  try {
    localStorage.setItem(KEY, JSON.stringify(sizes))
  } catch {
    // Storage blocked: the size lasts until reload.
  }
}

/** The content and a side pane, resizable (never collapsed): side by side when wide, stacked when narrow. */
export const SplitPane = ({children, pane}: {children: ReactNode; pane: ReactNode}) => {
  const [orientation, setOrientation] = useState<Orientation | null>(null)
  const paneSize = useRef(0)
  const measure = useCallback((element: HTMLDivElement | null) => {
    if (!element) return
    const observer = new ResizeObserver(() => {
      // A hidden tab measures 0: keep its layout (flipping would remount its content).
      if (!element.clientWidth) return
      setOrientation(element.clientWidth >= WIDE ? "horizontal" : "vertical")
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return (
    <div ref={measure} className="flex min-h-0 min-w-0 flex-1">
      {orientation && (
        <ResizablePanelGroup
          key={orientation}
          orientation={orientation}
          onLayoutChanged={(_, meta) => {
            if (meta.isUserInteraction && paneSize.current) save(orientation, paneSize.current)
          }}
        >
          <ResizablePanel minSize={120} className="flex min-h-0 min-w-0 flex-col">
            {children}
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel
            defaultSize={sizeOf(orientation)}
            minSize={MIN[orientation]}
            onResize={size => {
              paneSize.current = size.inPixels
            }}
            className="min-h-0 min-w-0"
          >
            {pane}
          </ResizablePanel>
        </ResizablePanelGroup>
      )}
    </div>
  )
}
