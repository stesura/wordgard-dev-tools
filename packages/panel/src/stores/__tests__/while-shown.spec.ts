import type { EditorInfo } from "@stesura/wordgard-dev-tools";
import { atom } from "nanostores";
import { expect, it } from "vitest";
import type { Tab } from "../../tabs/tabs.ts";
import type { Change } from "../panel-store.ts";
import { whileShown, type ShownStore } from "../while-shown.ts";

const EDITOR = 1;

// The store's part whileShown reads, driven by the test.
const fakeStore = (tab: Tab) => {
  const state = atom<{ tab: Tab; editors: EditorInfo[] }>({ tab, editors: [] });
  const changes = new Map<Change, Set<(id: number) => void>>();
  const reveals = new Set<() => void>();
  const store: ShownStore = {
    state,
    on: (change, listener) => {
      const set = changes.get(change) ?? new Set();
      changes.set(change, set.add(listener));
      return () => {
        set.delete(listener);
      };
    },
    onReveal: (listener) => {
      reveals.add(listener);
      return () => {
        reveals.delete(listener);
      };
    },
  };
  return {
    store,
    change: (change: Change, id = EDITOR) => {
      for (const listener of changes.get(change) ?? []) listener(id);
    },
    reveal: () => {
      for (const listener of reveals) listener();
    },
    show: (next: Tab) => state.set({ ...state.get(), tab: next }),
    // A new editor list: what a reconnect looks like.
    reconnect: () => state.set({ ...state.get(), editors: [] }),
  };
};

const counter = () => {
  let count = 0;
  return { call: () => void count++, count: () => count };
};

it("loads at once when shown, and on each of its editor's changes", () => {
  const fake = fakeStore("log");
  const load = counter();
  whileShown(fake.store, { tab: "log", editorId: EDITOR, on: "log", load: load.call });
  expect(load.count()).toBe(1);
  fake.change("log");
  expect(load.count()).toBe(2);
  // Another editor's, or another kind of change: not this tab's.
  fake.change("log", 2);
  fake.change("state");
  expect(load.count()).toBe(2);
});

it("while hidden, marks itself stale, and loads once on showing", () => {
  const fake = fakeStore("structure");
  const load = counter();
  whileShown(fake.store, { tab: "log", editorId: EDITOR, on: "log", load: load.call });
  expect(load.count()).toBe(0);
  fake.change("log");
  fake.change("log");
  expect(load.count()).toBe(0);
  fake.show("log");
  expect(load.count()).toBe(1);
  // Shown again with nothing changed meanwhile: no load.
  fake.show("structure");
  fake.show("log");
  expect(load.count()).toBe(1);
});

it("calls onHide when another tab is shown", () => {
  const fake = fakeStore("state");
  const hidden = counter();
  whileShown(fake.store, {
    tab: "state",
    editorId: EDITOR,
    on: "state",
    load: () => {},
    onHide: hidden.call,
  });
  expect(hidden.count()).toBe(0);
  fake.show("log");
  expect(hidden.count()).toBe(1);
});

it("takes a reveal only while shown: on mount, and on each reveal", () => {
  const fake = fakeStore("dom");
  const taken = counter();
  whileShown(fake.store, {
    tab: "dom",
    editorId: EDITOR,
    on: "state",
    load: () => {},
    onReveal: taken.call,
  });
  expect(taken.count()).toBe(1);
  fake.reveal();
  expect(taken.count()).toBe(2);
  fake.show("log");
  fake.reveal();
  expect(taken.count()).toBe(2);
});

it("with reconnect, loads again when the editor list changes", () => {
  const plain = fakeStore("log");
  const plainLoad = counter();
  whileShown(plain.store, { tab: "log", editorId: EDITOR, on: "log", load: plainLoad.call });
  plain.reconnect();
  expect(plainLoad.count()).toBe(1);

  const fake = fakeStore("log");
  const load = counter();
  whileShown(fake.store, {
    tab: "log",
    editorId: EDITOR,
    on: "log",
    load: load.call,
    reconnect: true,
  });
  fake.reconnect();
  expect(load.count()).toBe(2);
  // While hidden: on showing.
  fake.show("structure");
  fake.reconnect();
  expect(load.count()).toBe(2);
  fake.show("log");
  expect(load.count()).toBe(3);
});

it("stops listening once cleaned up", () => {
  const fake = fakeStore("log");
  const load = counter();
  const hidden = counter();
  const taken = counter();
  const stop = whileShown(fake.store, {
    tab: "log",
    editorId: EDITOR,
    on: "log",
    load: load.call,
    onHide: hidden.call,
    onReveal: taken.call,
  });
  stop();
  fake.change("log");
  fake.reveal();
  fake.show("structure");
  expect([load.count(), taken.count(), hidden.count()]).toEqual([1, 1, 0]);
});
