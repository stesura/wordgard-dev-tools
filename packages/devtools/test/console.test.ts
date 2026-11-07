import { afterEach, expect, it } from "vitest";
import { Leaf } from "wordgard/doc";
import type { Wordgard } from "wordgard/editor";
import { wordgardDevtools } from "../src/index.ts";
import { ask, editor, registry } from "./helpers.ts";

const editors: Wordgard[] = [];
afterEach(async () => {
  await ask({ type: "select", id: null });
  for (const wg of editors.splice(0)) wg.dom.remove();
});

const open = () => {
  const wg = editor(wordgardDevtools());
  editors.push(wg);
  return { wg, id: registry().editors.get(wg)?.id ?? 0 };
};

const global = (name: string): unknown => Reflect.get(window, name);

it("points $wg at the editor a panel shows, and $tr at the transaction it opened", async () => {
  const first = open();
  const second = open();
  await ask({ type: "select", id: first.id });
  expect(global("$wg")).toBe(first.wg);
  expect(global("$tr")).toBeUndefined();
  await ask({ type: "record", id: first.id, on: true });
  first.wg.dispatch({ changes: { from: 1, insert: [Leaf.text("x")] } });
  const { rows } = await ask({ type: "log", id: first.id, from: 0, to: 10 });
  const [row] = rows;
  if (!row) throw new Error("No row");
  await ask({ type: "setConsole", id: first.id, index: row.index });
  const tr = global("$tr");
  expect(tr).toBeDefined();
  expect(tr).toHaveProperty("docChanged", true);
  // Selected again (a reconnect): the same editor keeps its transaction.
  await ask({ type: "select", id: first.id });
  expect(global("$tr")).toBe(tr);
  await ask({ type: "select", id: second.id });
  expect(global("$wg")).toBe(second.wg);
  expect(global("$tr")).toBeUndefined();
  await ask({ type: "select", id: null });
  expect(global("$wg")).toBeUndefined();
  await expect(ask({ type: "setConsole", id: first.id, index: 999 })).rejects.toThrow(
    "no longer in the log"
  );
});

it("leaves the page's own $wg alone, and lets the page take ours over", async () => {
  // Ours, installed by the test above: gone, so the page's comes first.
  Reflect.deleteProperty(window, "$wg");
  const page = { mine: true };
  Object.defineProperty(window, "$wg", { configurable: true, writable: true, value: page });
  try {
    const { id } = open();
    await ask({ type: "select", id });
    expect(global("$wg")).toBe(page);
  } finally {
    Reflect.deleteProperty(window, "$wg");
  }
  const { wg, id } = open();
  await ask({ type: "select", id });
  expect(global("$wg")).toBe(wg);
  Reflect.set(window, "$wg", 5);
  expect(global("$wg")).toBe(5);
  Reflect.deleteProperty(window, "$wg");
});
