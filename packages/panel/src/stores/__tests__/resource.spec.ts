import { expect, it } from "vitest";
import { createResource } from "../resource.ts";

// A reply the test settles, in any order.
const later = <T>() => {
  let settle: { resolve: (value: T) => void; reject: (error: unknown) => void } | null = null;
  const promise = new Promise<T>((resolve, reject) => {
    settle = { resolve, reject };
  });
  return {
    promise,
    resolve: (value: T) => settle?.resolve(value),
    reject: (error: unknown) => settle?.reject(error),
  };
};

const setup = () => {
  const replies: ReturnType<typeof later<number>>[] = [];
  const resource = createResource(() => {
    const reply = later<number>();
    replies.push(reply);
    return reply.promise;
  });
  return { resource, replies };
};

it("starts empty", () => {
  const { resource } = setup();
  expect(resource.state.get()).toEqual({ value: null, error: null, version: 0 });
});

it("keeps the latest load, dropping an older reply that lands after it", async () => {
  const { resource, replies } = setup();
  const first = resource.load();
  const second = resource.load();
  replies[1]?.resolve(2);
  await second;
  expect(resource.state.get()).toEqual({ value: 2, error: null, version: 2 });
  replies[0]?.resolve(1);
  await first;
  expect(resource.state.get()).toEqual({ value: 2, error: null, version: 2 });
});

it("keeps the last value with the error, until a load succeeds", async () => {
  const { resource, replies } = setup();
  const first = resource.load();
  replies[0]?.resolve(1);
  await first;
  const failed = resource.load();
  replies[1]?.reject(new Error("gone"));
  await failed;
  expect(resource.state.get()).toEqual({ value: 1, error: "gone", version: 2 });
  const third = resource.load();
  replies[2]?.resolve(3);
  await third;
  expect(resource.state.get()).toEqual({ value: 3, error: null, version: 3 });
});

it("drops an older load's error too", async () => {
  const { resource, replies } = setup();
  const first = resource.load();
  const second = resource.load();
  replies[1]?.resolve(2);
  await second;
  replies[0]?.reject(new Error("late"));
  await first;
  expect(resource.state.get().error).toBeNull();
});

it("never rejects", async () => {
  const { resource, replies } = setup();
  const load = resource.load();
  replies[0]?.reject("not an Error");
  await expect(load).resolves.toBeUndefined();
  expect(resource.state.get().error).toBe("not an Error");
});

it("is ready once the latest load is in", async () => {
  const { resource, replies } = setup();
  await expect(resource.ready()).resolves.toBeUndefined();
  void resource.load();
  let ready = false;
  void resource.ready().then(() => (ready = true));
  await Promise.resolve();
  expect(ready).toBe(false);
  replies[0]?.resolve(1);
  await resource.ready();
  expect(ready).toBe(true);
  expect(resource.state.get().value).toBe(1);
});
