import { expect, it } from "vitest";
import { createPromiseCache } from "../promise-cache.ts";

it("gives the same promise for a key, loading it once", () => {
  const cache = createPromiseCache<number>();
  let loads = 0;
  const load = () => Promise.resolve(++loads);
  const first = cache.get("a", load);
  expect(cache.get("a", load)).toBe(first);
  expect(loads).toBe(1);
  expect(cache.get("b", load)).not.toBe(first);
  expect(loads).toBe(2);
});

it("keeps the last `size` keys, the oldest dropped first", () => {
  const cache = createPromiseCache<string>(2);
  const a = cache.get("a", () => Promise.resolve("a"));
  const b = cache.get("b", () => Promise.resolve("b"));
  cache.get("c", () => Promise.resolve("c"));
  expect(cache.get("b", () => Promise.resolve("b again"))).toBe(b);
  expect(cache.get("a", () => Promise.resolve("a again"))).not.toBe(a);
});

it("forgets a key, or all of them", () => {
  const cache = createPromiseCache<number>();
  const a = cache.get("a", () => Promise.resolve(1));
  const b = cache.get("b", () => Promise.resolve(2));
  cache.delete("a");
  expect(cache.get("a", () => Promise.resolve(3))).not.toBe(a);
  cache.clear();
  expect(cache.get("b", () => Promise.resolve(4))).not.toBe(b);
});
