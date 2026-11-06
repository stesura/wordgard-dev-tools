import { playwright } from "@vitest/browser-playwright";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vitest/config";
import { defaultClientConditions, searchForWorkspaceRoot } from "vite";

// `import("../src/index.ts?copy=b")` loads a second copy of the package: the
// query is carried to every relative import below it.
const packageCopies = (): Plugin => ({
  name: "package-copies",
  enforce: "pre",
  async resolveId(source, importer) {
    const copy = importer?.match(/\?copy=\w+$/)?.[0];
    if (!copy || !importer || !source.startsWith(".")) return null;
    const resolved = await this.resolve(source, importer.slice(0, -copy.length), {
      skipSelf: true,
    });
    return resolved && resolved.id + copy;
  },
});

export default defineConfig({
  plugins: [packageCopies()],
  resolve: {
    conditions: ["source", ...defaultClientConditions],
    dedupe: ["wordgard"],
  },
  server: {
    fs: {
      allow: [
        searchForWorkspaceRoot(process.cwd()),
        fileURLToPath(new URL("../../../wordgard", import.meta.url)),
      ],
    },
  },
  optimizeDeps: {
    include: [
      "wordgard/schema",
      "wordgard/editor",
      "wordgard/state",
      "wordgard/doc",
      "wordgard/types",
      "wordgard/history",
    ],
  },
  test: {
    // Integration tests (editors on a page) in test/; unit tests beside their module, in __tests__.
    include: ["test/**/*.test.ts", "src/**/__tests__/*.spec.ts"],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: "chromium" }],
    },
  },
});
