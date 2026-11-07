import { afterEach, expect, it, vi } from "vitest";
import { Command, deleteUnit, toggleStrong } from "wordgard/command";
import { KeyBinding, Wordgard } from "wordgard/editor";
import { phrases } from "wordgard/phrases";
import { basicSchema } from "wordgard/schema";
import type { GardState } from "wordgard/state";
import { wordgardDevtools } from "../src/index.ts";
import { ask, registry } from "./helpers.ts";

const editors: Wordgard[] = [];
afterEach(async () => {
  await ask({ type: "select", id: null });
  for (const wg of editors.splice(0)) wg.dom.remove();
  vi.restoreAllMocks();
});

const open = (config: GardState.Extension) => {
  const wg = Wordgard.create({
    parent: document.body,
    doc: "<p>Hi</p>",
    config: [config, basicSchema(), wordgardDevtools()],
  });
  editors.push(wg);
  return registry().editors.get(wg)?.id ?? 0;
};

const shout = () => true;

it("lists the bindings in the keymap's order, the default keymap last", async () => {
  const id = open([
    KeyBinding.of({ key: "Mod-b", run: toggleStrong, description: phrases.ref("group_inline") }),
    KeyBinding.of({
      key: "Ctrl-x",
      mac: "Cmd-x",
      run: shout,
      shift: shout,
      shiftDescription: "loud",
    }),
    KeyBinding.of({ char: "!", run: shout }),
    KeyBinding.of({ any: () => false, run: shout, allowDefault: true }),
    KeyBinding.of({ key: "Alt-1", run: Command.bind(deleteUnit, "backward") }),
  ]);
  const { platform, bindings } = await ask({ type: "keymap", id });
  const mod = platform == "mac" ? "Cmd" : "Ctrl";
  expect(bindings[0]).toMatchObject({
    index: 0,
    key: "Mod-b",
    platformKey: `${mod}-b`,
    command: "toggleStrong",
    fromDefault: false,
  });
  // A phrase reference, resolved with the state.
  expect(bindings[0]?.description).toEqual(expect.any(String));
  expect(bindings[1]).toMatchObject({
    key: platform == "mac" ? "Cmd-x" : "Ctrl-x",
    command: "shout",
    shift: "shout",
    shiftDescription: "loud",
  });
  expect(bindings[2]).toMatchObject({ key: null, char: "!" });
  expect(bindings[3]).toMatchObject({ any: true, allowDefault: true });
  expect(bindings[4]).toMatchObject({ command: "deleteUnit", param: '"backward"' });
  expect(bindings.length).toBeGreaterThan(5);
  // Our own app bindings come first; basicSchema's too, before the default keymap.
  expect(bindings.findIndex((b) => b.fromDefault)).toBeGreaterThan(4);

  const logged = vi.spyOn(console, "log").mockImplementation(() => {});
  await ask({ type: "logKeyBinding", id, index: 1, shift: true });
  expect(logged.mock.calls[0]).toEqual([
    `[wordgard-devtools] key binding Shift-${platform == "mac" ? "Cmd-x" : "Ctrl-x"}`,
    shout,
  ]);
  await ask({ type: "logKeyBinding", id, index: 4 });
  expect(logged.mock.calls[1]?.[1]).toBe(deleteUnit);
  // Mod- spelled out, as the table shows it.
  await ask({ type: "logKeyBinding", id, index: 0 });
  expect(logged.mock.calls[2]?.[0]).toBe(`[wordgard-devtools] key binding ${mod}-b`);
});

it("leaves the default keymap out when it's turned off", async () => {
  const id = open(KeyBinding.useDefaultKeymap.of(false));
  const { bindings } = await ask({ type: "keymap", id });
  expect(bindings.some((b) => b.fromDefault)).toBe(false);
  await expect(ask({ type: "logKeyBinding", id, index: 999 })).rejects.toThrow("no longer there");
});
