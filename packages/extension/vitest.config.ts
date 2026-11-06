import { defaultServerConditions } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Node tests resolve through the server-side resolver: the workspace packages' source.
  ssr: { resolve: { conditions: ["source", ...defaultServerConditions] } },
  test: { include: ["test/**/*.test.ts"], environment: "node" },
});
