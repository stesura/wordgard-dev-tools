import { afterEach, expect, it, vi } from "vitest";
import { Decoration, Wordgard } from "wordgard/editor";
import { basicSchema } from "wordgard/schema";
import { GardState, Transaction } from "wordgard/state";
import { wordgardDevtools, type ExtensionNode } from "../src/index.ts";
import { ask, registry } from "./helpers.ts";

const editors: Wordgard[] = [];
afterEach(async () => {
  await ask({ type: "select", id: null });
  for (const wg of editors.splice(0)) wg.dom.remove();
  vi.restoreAllMocks();
});

const open = (config: GardState.Extension, fields?: Record<string, GardState.Field<unknown>>) => {
  const wg = Wordgard.create({
    parent: document.body,
    doc: "<p>Hi</p>",
    config: [config, basicSchema(), wordgardDevtools({ fields })],
  });
  editors.push(wg);
  return { wg, id: registry().editors.get(wg)?.id ?? 0 };
};

/** The rows below a node, by label, depth first. */
const flat = (node: ExtensionNode): ExtensionNode[] => [node, ...node.children.flatMap(flat)];
const find = (root: ExtensionNode, label: string) => flat(root).find((n) => n.label == label);
const pathTo = (root: ExtensionNode, target: ExtensionNode): number[] | null => {
  if (root == target) return [];
  for (const [i, child] of root.children.entries()) {
    const below = pathTo(child, target);
    if (below) return [i, ...below];
  }
  return null;
};

const counter = GardState.Field.define<number>({ create: () => 0, update: (v) => v });
const provided = GardState.Field.define<string>({ create: () => "provided", update: (v) => v });
const host = GardState.Field.define<number>({
  create: () => 1,
  update: (v) => v,
  provide: () => provided,
});
const enabled = GardState.Field.define<string>({ create: () => "enabled", update: (v) => v });
const choices = GardState.Facet.define<string>({ enables: enabled });
const twice = GardState.Facet.define<number>();
const maybe = GardState.Facet.define<string | null>();
const derived = GardState.Field.Derived.define((state) => state.doc.length);
const compartment = GardState.Compartment.define();

class Feature {
  extension = twice.of(7);
}

const points = () => Decoration.Point.none;

it("lists the configuration as Wordgard walks it", async () => {
  const { wg, id } = open(
    [
      [[counter]],
      GardState.prec.highest(host),
      GardState.prec.low(choices.of("a")),
      choices.of("b"),
      maybe.of(null),
      twice.derive(() => 2),
      compartment.of(derived),
      new Feature(),
      GardState.readOnly.of(false),
      Decoration.Point.source.of(points),
      // A duplicate: kept at the later, higher precedence.
      twice.of(1),
    ],
    { counter }
  );
  const { root, capped } = await ask({ type: "extensions", id });
  expect(capped).toBe(false);
  expect(root.kind).toBe("configuration");
  // One-item arrays are shown in their parent's place.
  expect(find(root, "counter")).toMatchObject({ kind: "field", prec: "default", field: 0 });
  const highest = find(root, "highest");
  expect(highest?.children.map((c) => c.label)).toEqual(["field #2"]);
  // What a field provides, nested; numbered as the Fields tab numbers it.
  expect(highest?.children[0]).toMatchObject({ prec: "highest", field: 1 });
  expect(highest?.children[0]?.children[0]).toMatchObject({ label: "field #3", field: 2 });
  const low = find(root, "low");
  expect(low?.children[0]).toMatchObject({ kind: "facet", prec: "low", value: '"a"' });
  // What a facet enables, at default precedence, under its first provider only.
  expect(low?.children[0]?.children[0]).toMatchObject({ label: "field #4", prec: "default" });
  expect(flat(root).find((n) => n.value == '"b"')?.children[0]).toMatchObject({
    label: "field #4",
    duplicate: true,
  });
  // facet.of(null) is static.
  expect(flat(root).filter((n) => n.value == "null")).toHaveLength(1);
  expect(flat(root).some((n) => n.value == "computed")).toBe(true);
  expect(find(root, "compartment #1")?.children[0]).toMatchObject({ kind: "derived field" });
  expect(find(root, "Feature")?.children[0]).toMatchObject({ kind: "facet", value: "7" });
  expect(find(root, "GardState.readOnly")).toMatchObject({ facet: "GardState.readOnly" });
  expect(find(root, "Decoration.Point.source")).toMatchObject({ source: 0 });

  // Values in the current state.
  const readOnly = find(root, "GardState.readOnly");
  const path = readOnly && pathTo(root, readOnly);
  if (!path) throw new Error("No readOnly row");
  expect(await ask({ type: "extension", id, path })).toEqual({ resolved: "false", value: null });
  const derivedRow = find(root, "compartment #1")?.children[0];
  const derivedPath = derivedRow && pathTo(root, derivedRow);
  if (!derivedPath) throw new Error("No derived row");
  expect((await ask({ type: "extension", id, path: derivedPath })).value).toBe("4");
  wg.dispatch({ changes: { from: 1, to: 2 } });
  expect((await ask({ type: "extension", id, path: derivedPath })).value).toBe("3");

  const logged = vi.spyOn(console, "log").mockImplementation(() => {});
  await ask({ type: "logExtension", id, path });
  await ask({ type: "logExtension", id, path, resolved: true });
  expect(logged.mock.calls[0]?.[0]).toBe("[wordgard-devtools] GardState.readOnly");
  expect(logged.mock.calls[1]).toEqual([
    "[wordgard-devtools] state.facet(GardState.readOnly)",
    false,
  ]);
});

it("keeps an extension's highest-precedence occurrence, as Wordgard does", async () => {
  const shared = twice.of(3);
  const { id } = open([shared, GardState.prec.high(shared)]);
  const { root } = await ask({ type: "extensions", id });
  const kept = flat(root).find((n) => n.value == "3");
  const rows = flat(root).filter((n) => n.label == kept?.label);
  expect(rows.map(({ prec, duplicate, value }) => ({ prec, duplicate, value }))).toEqual([
    { prec: "default", duplicate: true, value: "duplicate: kept at high precedence" },
    { prec: "high", duplicate: false, value: "3" },
  ]);
});

it("walks a dropped occurrence that still holds what Wordgard keeps", async () => {
  // The enabled field stays where the first walk put it: under the dropped occurrence.
  const shared = [choices.of("a")];
  const inner = twice.of(5);
  const nested = [GardState.prec.highest(inner), twice.of(6)];
  const { id } = open([shared, GardState.prec.high(shared), nested, GardState.prec.high(nested)]);
  const { root } = await ask({ type: "extensions", id });
  const [dropped, high, droppedNested, highNested] = root.children[0]?.children ?? [];
  expect(dropped).toMatchObject({ kind: "group", duplicate: true });
  const provider = dropped?.children[0];
  // A dropped row says nothing of its own: no value, field or facet.
  expect(provider).toMatchObject({
    duplicate: true,
    value: "duplicate: kept at high precedence",
    field: null,
    facet: null,
  });
  expect(provider?.children[0]).toMatchObject({ kind: "field", duplicate: false, prec: "default" });
  expect(high?.children[0]).toMatchObject({ kind: "facet", value: '"a"', duplicate: false });
  expect(high?.children[0]?.children[0]).toMatchObject({ kind: "field", duplicate: true });
  // The re-walk at high moves the wrappers, but `inner`, already seen at highest, stays put.
  expect(droppedNested?.children.map((c) => [c.kind, c.duplicate])).toEqual([
    ["precedence", true],
    ["facet", true],
  ]);
  expect(droppedNested?.children[0]?.children[0]).toMatchObject({
    value: "5",
    prec: "highest",
    duplicate: false,
  });
  expect(highNested?.children.map((c) => [c.kind, c.duplicate])).toEqual([
    ["precedence", false],
    ["facet", false],
  ]);
  expect(highNested?.children[0]?.children[0]).toMatchObject({
    duplicate: true,
    value: "duplicate: kept at highest precedence",
  });
});

it("shows a compartment's current content, and caches the tree per configuration", async () => {
  const slot = GardState.Compartment.define();
  const { wg, id } = open(slot.of(twice.of(1)));
  const first = await ask({ type: "extensions", id });
  wg.dispatch({ selection: { anchor: 2 } });
  expect(await ask({ type: "extensions", id })).toStrictEqual(first);
  wg.dispatch({ effects: slot.reconfigure([twice.of(2), counter]) });
  const { root } = await ask({ type: "extensions", id });
  const row = flat(root).find((n) => n.kind == "compartment");
  expect(row?.value).toBe("reconfigured");
  expect(row?.children.map((c) => c.kind)).toEqual(["facet", "field"]);
  // A field a reconfigure added has a Fields index.
  expect(row?.children[1]?.field).toEqual(expect.any(Number));
});

it("names the facets Wordgard exports, and fails on a row no longer there", async () => {
  const { id } = open([Transaction.extender.of(() => null)]);
  const { root } = await ask({ type: "extensions", id });
  expect(find(root, "Transaction.extender")).toMatchObject({ kind: "facet" });
  await expect(ask({ type: "extension", id, path: [999] })).rejects.toThrow("no longer there");
});

it("finds the fields that fields provide and facets enable", async () => {
  const { id } = open([host, choices.of("x")]);
  const { fields } = await ask({ type: "fields", id });
  expect(fields.map((f) => f.preview)).toEqual(expect.arrayContaining(['"provided"', '"enabled"']));
});
