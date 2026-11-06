import {afterEach, expect, it, vi} from "vitest"
import type {Wordgard} from "wordgard/editor"
import {wordgardDevtools} from "../src/index.ts"
import type * as Production from "../src/production.ts"
import {editor} from "./helpers.ts"

const env = vi.hoisted(() => ({production: false}))
vi.mock("../src/production.ts", () => ({isProduction: () => env.production}))

const editors: Wordgard[] = []

const open = (...args: Parameters<typeof editor>) => {
  const wg = editor(...args)
  editors.push(wg)
  return wg
}

afterEach(() => {
  env.production = false
  for (const wg of editors.splice(0)) wg.dom.remove()
})

const registered = (wg: Wordgard) => window.__WORDGARD_DEVTOOLS__?.editors.has(wg) ?? false

it("does nothing in production", () => {
  env.production = true
  expect(wordgardDevtools()).toEqual([])
  expect(registered(open(wordgardDevtools()))).toBe(false)
})

it("registers in production when enabled", () => {
  env.production = true
  expect(registered(open(wordgardDevtools({enabled: true})))).toBe(true)
})

it("registers outside production", () => {
  expect(registered(open(wordgardDevtools()))).toBe(true)
})

it("does nothing when disabled", () => {
  expect(wordgardDevtools({enabled: false})).toEqual([])
  expect(registered(open(wordgardDevtools({enabled: false})))).toBe(false)
})

it("reads the bundler's NODE_ENV", async () => {
  const actual = await vi.importActual<typeof Production>("../src/production.ts")
  expect(actual.isProduction()).toBe(false)
})
