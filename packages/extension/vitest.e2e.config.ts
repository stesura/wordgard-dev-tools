import { defineConfig } from "vitest/config";

// Needs the built extension and demo: `npm run e2e` builds both first.
export default defineConfig({
  test: {
    include: ["e2e/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
