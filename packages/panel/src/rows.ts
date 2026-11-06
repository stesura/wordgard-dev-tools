import {useSyncExternalStore} from "react"

/**
 * Which of a scroller's fixed-height rows to draw: those in view, and `overscan` more either side.
 * Every list here has rows of one height, so nothing is measured. (TanStack Virtual, used before,
 * can't be memoized by the React Compiler.)
 * `margin`: what sits above the rows inside the scroller, such as a sticky header row.
 */
export const useRows = (scroller: HTMLElement | null, count: number, row: number, {overscan = 20, margin = 0} = {}) => {
  // The first row in view and how many fit: a new snapshot only when a row boundary is crossed.
  // The subscribe arrow stays the same across renders because the React Compiler caches it on
  // `scroller`; uncompiled, it would subscribe again on every render.
  const view = useSyncExternalStore(
    changed => {
      if (!scroller) return () => {}
      scroller.addEventListener("scroll", changed, {passive: true})
      const resized = new ResizeObserver(changed)
      resized.observe(scroller)
      return () => {
        scroller.removeEventListener("scroll", changed)
        resized.disconnect()
      }
    },
    () =>
      scroller
        ? `${Math.floor(Math.max(0, scroller.scrollTop - margin) / row)}:${Math.ceil(scroller.clientHeight / row)}`
        : "0:0",
  )
  const [first = 0, fits = 0] = view.split(":").map(Number)
  // Clamped: a list that just shrank may still be scrolled past its end.
  const start = Math.max(0, Math.min(first, count - fits) - overscan)
  const end = Math.min(count, first + fits + 1 + overscan)
  return {indices: Array.from({length: Math.max(0, end - start)}, (_, i) => start + i), height: count * row}
}

/** Scrolls the least that brings row `position` into view, with `room` rows' height for it. */
export const keepRowInView = (scroller: HTMLElement | null, position: number, row: number, room = 1) => {
  if (!scroller || position < 0) return
  const top = position * row
  if (top < scroller.scrollTop) scroller.scrollTop = top
  else if (top + room * row > scroller.scrollTop + scroller.clientHeight) scroller.scrollTop = top + room * row - scroller.clientHeight
}
