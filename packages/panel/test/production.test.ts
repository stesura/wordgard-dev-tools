import {afterEach, expect, it, vi} from "vitest"
import {mountDevtools, type MountedDevtools} from "../src/index.ts"

const env = vi.hoisted(() => ({production: false}))
vi.mock("@stesura/wordgard-dev-tools", async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isProduction: () => env.production,
}))

let mounted: MountedDevtools | null = null

afterEach(() => {
  env.production = false
  mounted?.unmount()
  mounted = null
})

it("mounts nothing in production", async () => {
  env.production = true
  mounted = mountDevtools()
  await mounted.ready
  expect(mounted.host.isConnected).toBe(false)
  expect(mounted.host.shadowRoot).toBe(null)
  expect(document.querySelector("wordgard-devtools")).toBe(null)
})

it("mounts in production when enabled", async () => {
  env.production = true
  mounted = mountDevtools({enabled: true})
  await mounted.ready
  expect(mounted.host.isConnected).toBe(true)
  expect(mounted.host.shadowRoot?.childElementCount).toBeGreaterThan(0)
})

it("mounts nothing when disabled", async () => {
  mounted = mountDevtools({enabled: false})
  await mounted.ready
  expect(mounted.host.isConnected).toBe(false)
  expect(document.querySelector("wordgard-devtools")).toBe(null)
})
