import { expect, it } from "vitest";
import { withSiblings } from "../siblings.ts";

const positions = (depths: number[]) =>
  withSiblings(depths.map((depth) => ({ depth }))).map(
    ({ position, siblings }) => `${position}/${siblings}`
  );

it("numbers each line among its siblings", () => {
  // root
  //   a
  //     a1
  //     a2
  //   b
  //   c
  //     c1
  expect(positions([0, 1, 2, 2, 1, 1, 2])).toEqual([
    "1/1",
    "1/3",
    "1/2",
    "2/2",
    "2/3",
    "3/3",
    "1/1",
  ]);
});

it("starts a new group under each parent, and after a shallower line", () => {
  expect(positions([0, 1, 0, 1, 1])).toEqual(["1/2", "1/1", "2/2", "1/2", "2/2"]);
  expect(positions([])).toEqual([]);
});
