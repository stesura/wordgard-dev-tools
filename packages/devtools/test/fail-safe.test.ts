import { afterEach, expect, it, vi } from "vitest";
import { Leaf } from "wordgard/doc";
import { wordgardDevtools } from "../src/index.ts";
import { agent, ask, editor, registry } from "./helpers.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

// One flow: the first error turns the devtools off for the whole page (this file's frame).
it("turns itself off on an error instead of breaking the app's editor", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const wg = editor(wordgardDevtools());
  const id = registry().editors.get(wg)?.id ?? 0;
  await ask({ type: "select", id });
  await ask({ type: "record", id, on: true });
  // Wordgard doesn't catch transaction listeners' errors: unguarded, this reaches dispatch.
  vi.spyOn(agent(), "recorded").mockImplementation(() => {
    throw new Error("boom");
  });

  const before = wg.state.doc;
  expect(() => wg.dispatch({ changes: { from: 1, insert: [Leaf.text("A")] } })).not.toThrow();
  const after = wg.state.doc;
  expect(() => wg.dispatch({ changes: { from: 1, insert: [Leaf.text("B")] } })).not.toThrow();
  expect(after).not.toBe(before);
  expect(wg.state.doc).not.toBe(after);
  expect(warn).toHaveBeenCalledOnce();
  expect(warn).toHaveBeenCalledWith(
    expect.stringContaining("turned itself off"),
    expect.any(Error)
  );

  expect(wordgardDevtools()).toEqual([]);
  wg.dom.remove();
});
