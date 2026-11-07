import { useStore } from "@nanostores/react";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "#components/ui/resizable";
import { usePanelSettings } from "./panel-settings.tsx";

export type Orientation = "horizontal" | "vertical";
export type Sizes = Record<Orientation, number>;

/** A kind of split: where its sizes are saved, from what width (px) it's side by side, its pane's sizes (px). */
export type SplitKind = { key: string; wide: number; defaults: Sizes; min: Sizes };

// Side by side from Tailwind's @2xl, the pane under the content below it.
const MAIN: SplitKind = {
  key: "wordgard-devtools:pane",
  wide: 672,
  defaults: { horizontal: 352, vertical: 192 },
  min: { horizontal: 200, vertical: 80 },
};

/**
 * The content and a side pane, resizable (never collapsed): side by side when wide, stacked when
 * narrow, or as `orientation` says. `pane` can be given the orientation (for a split inside it);
 * null or false removes it (its panel and handle, not only its content).
 */
export const SplitPane = ({
  children,
  pane,
  kind = MAIN,
  orientation: fixed,
}: {
  children: ReactNode;
  pane: ReactNode | ((orientation: Orientation) => ReactNode);
  kind?: SplitKind;
  orientation?: Orientation;
}) => {
  const [measured, setOrientation] = useState<Orientation | null>(null);
  const orientation = fixed ?? measured;
  const paneSize = useRef(0);
  // Per kind, shared by every tab and editor: a pane keeps the size the user gave it.
  const sizes = usePanelSettings().paneSizes(kind);
  const saved = useStore(sizes);
  const measure = useCallback(
    (element: HTMLDivElement | null) => {
      if (!element) return;
      const observer = new ResizeObserver(() => {
        // A hidden tab measures 0: keep its layout (flipping would remount its content).
        if (!element.clientWidth) return;
        setOrientation(element.clientWidth >= kind.wide ? "horizontal" : "vertical");
      });
      observer.observe(element);
      return () => observer.disconnect();
    },
    [kind]
  );
  return (
    <div ref={measure} className="flex min-h-0 min-w-0 flex-1">
      {orientation && (
        <ResizablePanelGroup
          key={orientation}
          orientation={orientation}
          onLayoutChanged={(_, meta) => {
            if (meta.isUserInteraction && paneSize.current)
              sizes.set({ ...sizes.get(), [orientation]: Math.round(paneSize.current) });
          }}
        >
          <ResizablePanel id="content" minSize={120} className="flex min-h-0 min-w-0 flex-col">
            {children}
          </ResizablePanel>
          {/* No pane: the content alone, not remounted (it keeps its scroll and state). */}
          {pane != null && pane !== false && (
            <>
              <ResizableHandle />
              <ResizablePanel
                id="pane"
                defaultSize={saved[orientation]}
                minSize={kind.min[orientation]}
                onResize={(size) => {
                  paneSize.current = size.inPixels;
                }}
                className="min-h-0 min-w-0"
              >
                {typeof pane == "function" ? pane(orientation) : pane}
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      )}
    </div>
  );
};
