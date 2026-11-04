import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import {playwright} from "@vitest/browser-playwright"
import {fileURLToPath} from "node:url"
import {defaultClientConditions, searchForWorkspaceRoot} from "vite"
import {defineConfig} from "vitest/config"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    conditions: ["source", ...defaultClientConditions],
    dedupe: ["wordgard", "react", "react-dom"],
  },
  server: {
    fs: {allow: [searchForWorkspaceRoot(process.cwd()), fileURLToPath(new URL("../../../wordgard", import.meta.url))]},
  },
  build: {
    target: "es2022",
    lib: {entry: {index: "src/index.ts", ui: "src/ui.ts", transport: "src/transport.ts", styles: "src/styles-entry.ts"}, formats: ["es"], cssFileName: "styles"},
    // React is bundled (plan, open question 5); the page side is the page's own copy.
    rolldownOptions: {external: [/^wordgard(-devtools)?(\/|$)/]},
  },
  test: {
    include: ["test/**/*.test.{ts,tsx}"],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{browser: "chromium"}],
    },
  },
})
