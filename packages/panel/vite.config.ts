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
  // All of them up front: one found mid-run reloads the browser tests (a cold CI cache).
  optimizeDeps: {
    include: [
      "@base-ui/react/button",
      "@base-ui/react/context-menu",
      "@base-ui/react/menu",
      "@base-ui/react/merge-props",
      "@base-ui/react/use-render",
      "@base-ui/react/select",
      "@base-ui/react/tabs",
      "@base-ui/react/tooltip",
      "@tanstack/react-virtual",
      "class-variance-authority",
      "cn",
      "lucide-react",
      "react",
      "react-dom/client",
      "react-resizable-panels",
      "wordgard/doc",
      "wordgard/editor",
      "wordgard/history",
      "wordgard/schema",
      "wordgard/state",
    ],
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
