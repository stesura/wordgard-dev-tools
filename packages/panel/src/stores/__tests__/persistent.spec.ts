import { afterEach, expect, it, vi } from "vitest";
import { asJSON, persistent } from "../persistent.ts";

const KEY = "wordgard-devtools:test";
// A number, anything else read as the fallback's 0.
const count = asJSON((json) => (typeof json == "number" ? json : 0));

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

it("reads what's saved, or the fallback", () => {
  expect(persistent(KEY, 5, count).get()).toBe(5);
  localStorage.setItem(KEY, "7");
  expect(persistent(KEY, 5, count).get()).toBe(7);
  // Recognised by `read`, not JSON's own type: a string falls back through it.
  localStorage.setItem(KEY, '"seven"');
  expect(persistent(KEY, 5, count).get()).toBe(0);
});

it("falls back on what isn't JSON", () => {
  localStorage.setItem(KEY, "{not json");
  expect(persistent(KEY, 5, count).get()).toBe(5);
});

it("reads once, when created, and saves each change", () => {
  const value = persistent(KEY, 5, count);
  localStorage.setItem(KEY, "9");
  expect(value.get()).toBe(5);
  value.set(3);
  expect(localStorage.getItem(KEY)).toBe("3");
  expect(persistent(KEY, 5, count).get()).toBe(3);
});

it("keeps the value in memory when storage is blocked", () => {
  const blocked = () => {
    throw new DOMException("Blocked", "SecurityError");
  };
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(blocked);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(blocked);
  const value = persistent(KEY, 5, count);
  expect(value.get()).toBe(5);
  expect(() => value.set(4)).not.toThrow();
  expect(value.get()).toBe(4);
});
