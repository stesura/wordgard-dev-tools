import {afterEach, expect, it} from "vitest"
import {userEvent} from "vitest/browser"
import {Wordgard} from "wordgard/editor"
import {basicSchema} from "wordgard/schema"
import {wordgardDevtools} from "wordgard-devtools"
import {mountDevtools, type MountedDevtools} from "../src/index.ts"

let wg: Wordgard | null = null
let mounted: MountedDevtools | null = null

afterEach(() => {
  mounted?.unmount()
  mounted = null
  wg?.dom.remove()
  wg = null
  localStorage.clear()
})

const until = async <T>(get: () => T | null | undefined | false, timeout = 2000): Promise<T> => {
  const start = performance.now()
  for (;;) {
    const value = get()
    if (value) return value
    if (performance.now() - start > timeout) throw new Error("Timed out")
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

const shadow = () => {
  const root = mounted?.host.shadowRoot
  if (!root) throw new Error("No shadow root")
  return root
}

it("resizes the side pane, which never collapses, and keeps its size", async () => {
  wg = Wordgard.create({parent: document.body, doc: "<p>Hi</p>", config: [basicSchema(), wordgardDevtools()]})
  localStorage.setItem("wordgard-devtools:dock", JSON.stringify({side: "bottom", size: 500, collapsed: false}))
  mounted = mountDevtools()
  await mounted.ready
  const handle = await until(() => shadow().querySelector<HTMLElement>("[data-slot='resizable-handle']"))
  const pane = await until(() => shadow().querySelector<HTMLElement>("[aria-label='Node']"))
  const vertical = handle.getAttribute("aria-orientation") == "horizontal"
  const size = () => (vertical ? pane.getBoundingClientRect().height : pane.getBoundingClientRect().width)
  handle.focus()
  // To the end: the content as large as it goes, the pane at its minimum, not collapsed.
  await userEvent.keyboard("{End}")
  await until(() => size() > 0 && size() <= (vertical ? 81 : 201))
  expect(size()).toBeGreaterThanOrEqual(vertical ? 79 : 199)
  await until(() => localStorage.getItem("wordgard-devtools:pane"))
})
