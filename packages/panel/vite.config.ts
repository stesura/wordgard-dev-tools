import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import {playwright} from "@vitest/browser-playwright"
import {fileURLToPath} from "node:url"
import {defaultClientConditions, searchForWorkspaceRoot} from "vite"
import {defineConfig} from "vitest/config"
import {cssAndCopiedCode, thirdPartyLicenses} from "../../scripts/third-party-licenses.ts"

export default defineConfig(({command}) => ({
  // The build ships production React only. The page's own `isProduction()` stays unreplaced,
  // as @stesura/wordgard-dev-tools is external. Tests and the extension build from source.
  define: command === "build" ? {"process.env.NODE_ENV": JSON.stringify("production")} : {},
  plugins: [react(), tailwindcss(), thirdPartyLicenses({extra: cssAndCopiedCode}).plugin],
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
    lib: {entry: {index: "src/index.ts", transport: "src/transport.ts", styles: "src/styles-entry.ts"}, formats: ["es"], cssFileName: "styles"},
    // React and the UI libraries are bundled (plan, open question 5), so they're devDependencies.
    rolldownOptions: {external: [/^(wordgard|@stesura\/wordgard-dev-tools)(\/|$)/]},
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
}))
