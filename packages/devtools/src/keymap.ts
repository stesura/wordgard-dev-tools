import * as wordgardEditor from "wordgard/editor";
import type { GardState } from "wordgard/state";
import { boundOf } from "./internals.ts";
import type { KeyBindingInfo, KeymapInfo } from "./protocol.ts";
import { preview } from "./serialise.ts";

// Loaded with the serialisers, on the first panel request. The bindings in the order Wordgard's
// keymap holds them: the `KeyBinding.source` facet's, then the default keymap unless turned off.
// For a key, the first binding whose command returns true wins.

type Platform = KeymapInfo["platform"];

const isObject = (value: unknown): value is object => typeof value == "object" && value != null;

/**
 * As Wordgard tells (its own check isn't exported): Mac (iOS too), Windows, Linux; on any other,
 * only `key` applies.
 */
const platform = (): Platform => {
  const name = typeof navigator == "undefined" ? "" : navigator.platform;
  return /Mac|iPhone|iPad|iPod/.test(name)
    ? "mac"
    : /Win/.test(name)
      ? "win"
      : /Linux|X11/.test(name)
        ? "linux"
        : "other";
};

/** The key a binding uses here: the platform's own when set (an empty one doesn't count). */
const keyOf = (spec: object, on: Platform) =>
  (on == "other" ? null : text(spec, on)) || text(spec, "key");

const expand = (key: string, on: Platform) =>
  key.replace(/(^|-)Mod-/, `$1${on == "mac" ? "Cmd-" : "Ctrl-"}`);

type Binding = { spec: object; fromDefault: boolean };

const bindingsOf = (state: GardState): Binding[] => {
  const { KeyBinding } = wordgardEditor;
  let own: readonly unknown[];
  let useDefault: unknown;
  try {
    own = state.facet(KeyBinding.source);
    useDefault = state.facet(KeyBinding.useDefaultKeymap);
  } catch {
    // A Wordgard without them.
    return [];
  }
  const defaults: readonly unknown[] = useDefault === false ? [] : (KeyBinding.defaultKeymap ?? []);
  const spec = (binding: unknown) =>
    isObject(binding) && "spec" in binding && isObject(binding.spec) ? binding.spec : null;
  return [
    ...own.map((b) => ({ spec: spec(b), fromDefault: false })),
    ...defaults.map((b) => ({ spec: spec(b), fromDefault: true })),
  ].filter((b): b is Binding => b.spec != null);
};

const text = (spec: object, key: string) =>
  key in spec && typeof Reflect.get(spec, key) == "string" ? String(Reflect.get(spec, key)) : null;

/** A description: a string, or a phrase reference resolved with the state. */
const describe = (state: GardState, value: unknown): string | null => {
  if (typeof value == "string") return value;
  if (typeof value != "function") return null;
  try {
    return String(value(state));
  } catch {
    return null;
  }
};

/** A command's name; a bound one's with its parameter. */
const commandOf = (value: unknown) => {
  const bound = boundOf(value);
  const fn = bound ? bound.command : value;
  return {
    name: typeof fn == "function" ? fn.name || "anonymous" : null,
    param: bound ? preview(bound.param) : null,
  };
};

export const keymap = (state: GardState): KeymapInfo => {
  const on = platform();
  const bindings = bindingsOf(state).map(({ spec, fromDefault }, index): KeyBindingInfo => {
    const key = keyOf(spec, on);
    const run = commandOf("run" in spec ? spec.run : undefined);
    const shift = "shift" in spec && spec.shift ? commandOf(spec.shift) : null;
    const group = "group" in spec && isObject(spec.group) ? spec.group : null;
    return {
      index,
      key,
      platformKey: key ? expand(key, on) : null,
      char: text(spec, "char"),
      any: "any" in spec && typeof spec.any == "function",
      command: run.name,
      param: run.param,
      shift: shift?.name ?? null,
      shiftParam: shift?.param ?? null,
      description: describe(state, "description" in spec ? spec.description : undefined),
      shiftDescription: describe(
        state,
        "shiftDescription" in spec ? spec.shiftDescription : undefined
      ),
      group: group && "description" in group ? describe(state, group.description) : null,
      allowDefault: "allowDefault" in spec && spec.allowDefault === true,
      fromDefault,
    };
  });
  return { platform: on, bindings };
};

/** Logs a binding's command (its shifted one with `shift`), live: the console jumps to it. */
export const logKeyBinding = (state: GardState, index: number, shift = false) => {
  const found = bindingsOf(state)[index];
  if (!found) throw new Error("That key binding is no longer there");
  const { spec } = found;
  const command = shift
    ? "shift" in spec
      ? spec.shift
      : undefined
    : "run" in spec
      ? spec.run
      : "any" in spec
        ? spec.any
        : undefined;
  const on = platform();
  const key = keyOf(spec, on);
  const label = key ? expand(key, on) : (text(spec, "char") ?? "any key");
  console.log(
    `[wordgard-devtools] key binding ${shift ? `Shift-${label}` : label}`,
    boundOf(command)?.command ?? command
  );
};
