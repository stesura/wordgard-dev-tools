// A registry made by a copy of the package this one can't read. Its own file: each test file gets
// a fresh window, and the copy warns once per page.
import { expect, it, vi } from "vitest";
import { Leaf } from "wordgard/doc";
import { REGISTRY_VERSION, wordgardDevtools, type Registry } from "../src/index.ts";
import { editor } from "./helpers.ts";

it("leaves a newer registry alone, with one warning, and the editors working", () => {
  const register = vi.fn<Registry["register"]>();
  const unregister = vi.fn<Registry["unregister"]>();
  const newer: Registry = {
    registryVersion: REGISTRY_VERSION + 1,
    editors: new Map(),
    register,
    unregister,
    subscribe: () => () => {},
    agent: null,
  };
  window.__WORDGARD_DEVTOOLS__ = newer;
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

  const a = editor(wordgardDevtools({ name: "a" }));
  const b = editor(wordgardDevtools({ name: "b" }));
  a.dispatch({ changes: { from: 1, insert: [Leaf.text("x")] } });
  a.flush();
  expect(a.contentDOM.textContent).toContain("xTitle");
  a.dom.remove();
  b.dom.remove();

  expect(window.__WORDGARD_DEVTOOLS__).toBe(newer);
  expect(register).not.toHaveBeenCalled();
  expect(unregister).not.toHaveBeenCalled();
  expect(warn.mock.calls).toEqual([
    [
      `wordgard-devtools: the page's registry is version ${REGISTRY_VERSION + 1}, this copy needs ${REGISTRY_VERSION}. Its editors won't show in the panel.`,
    ],
  ]);
  warn.mockRestore();
});
