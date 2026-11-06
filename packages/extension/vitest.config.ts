import { defaultServerConditions } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Node tests resolve through the server-side resolver: the workspace packages' source.
  ssr: { resolve: { conditions: ["source", ...defaultServerConditions] } },
  // Unit tests beside their module, in __tests__; end-to-end tests in e2e/ (vitest.e2e.config.ts).
  test: { include: ["src/**/__tests__/*.spec.ts"], environment: "node" },
});
