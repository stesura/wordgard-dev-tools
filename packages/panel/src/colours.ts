import type {CSSProperties} from "react"

declare module "react" {
  interface CSSProperties {
    /** A node or mark type's hue, for its colours. */
    "--hue"?: number
  }
}

// Hues that read as different colours (red, orange, amber, lime, green, teal, sky, blue, indigo,
// violet, fuchsia, pink), not evenly spaced degrees: greens span more of the wheel.
const HUES = [0, 25, 45, 85, 140, 175, 200, 225, 250, 275, 305, 335]

export type ColourKind = "node" | "mark"

// For the session: a type keeps its colour across re-renders, tabs and editors.
const assigned = new Map<string, number>()
const taken = new Set<number>()

const hash = (text: string) => [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)

/**
 * A type's hue: the one its name hashes to, or, when another type has that one, the next free
 * one. Once every hue is taken, types share by hash.
 */
export const hueOf = (kind: ColourKind, name: string) => {
  const key = `${kind}:${name}`
  let index = assigned.get(key)
  if (index == null) {
    const start = hash(key) % HUES.length
    index = start
    for (let step = 0; step < HUES.length; step++) {
      const at = (start + step) % HUES.length
      if (!taken.has(at)) {
        index = at
        break
      }
    }
    taken.add(index)
    assigned.set(key, index)
  }
  return HUES[index] ?? 0
}

export const hue = (kind: ColourKind, name: string): CSSProperties => ({"--hue": hueOf(kind, name)})

// Readable on both themes.
export const typeColour = "text-[hsl(var(--hue)_65%_27%)] dark:text-[hsl(var(--hue)_70%_74%)]"
/** A mark's badge: tinted with its hue. */
export const markColour =
  "bg-[hsl(var(--hue)_80%_50%/0.12)] text-[hsl(var(--hue)_65%_27%)] dark:bg-[hsl(var(--hue)_80%_60%/0.16)] dark:text-[hsl(var(--hue)_70%_80%)]"
