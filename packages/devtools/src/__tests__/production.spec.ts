import { expect, it } from "vitest";
import { isProduction } from "../production.ts";

it("reads the bundler's NODE_ENV", () => {
  expect(isProduction()).toBe(false);
});
