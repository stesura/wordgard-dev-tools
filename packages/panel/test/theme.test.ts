import { expect, it } from "vitest";
import { createThemeStore, type ThemeChoice, type ThemeSource } from "../src/theme.ts";

const fakeSource = (initial: boolean) => {
  let dark = initial;
  const listeners = new Set<() => void>();
  const source: ThemeSource = {
    dark: () => dark,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  const change = (value: boolean) => {
    dark = value;
    for (const listener of listeners) listener();
  };
  return { source, change, listening: () => listeners.size };
};

it("follows its source until the user picks, and loads the pick asynchronously", async () => {
  const { source, change, listening } = fakeSource(false);
  const saved: ThemeChoice[] = [];
  const theme = createThemeStore({
    source,
    storage: {
      load: async (): Promise<ThemeChoice> => "dark",
      save: (choice) => saved.push(choice),
    },
  });
  expect(theme.get()).toEqual({ choice: "system", dark: false });
  await Promise.resolve();
  expect(theme.get()).toEqual({ choice: "dark", dark: true });

  const stop = theme.subscribe(() => {});
  expect(listening()).toBe(1);
  theme.set("system");
  expect(saved).toEqual(["system"]);
  change(true);
  expect(theme.get()).toEqual({ choice: "system", dark: true });
  stop();
  expect(listening()).toBe(0);
});

it("reads a synchronous storage before the first paint", () => {
  const theme = createThemeStore({
    source: fakeSource(false).source,
    storage: { load: () => "light", save: () => {} },
  });
  expect(theme.get()).toEqual({ choice: "light", dark: false });
});
