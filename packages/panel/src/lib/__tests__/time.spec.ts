import { expect, it } from "vitest";
import { clock } from "../time.ts";

it("writes a time of day to the millisecond", () => {
  expect(clock(new Date(2026, 0, 1, 9, 5, 3, 7).getTime())).toBe("09:05:03.007");
});
