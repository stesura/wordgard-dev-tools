import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defaultClientConditions, defineConfig, searchForWorkspaceRoot } from "vite";
import { reactCompiler } from "../scripts/react-compiler.ts";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const sibling = (name: string) => here(`../../${name}`);

export default defineConfig({
  // Tailwind compiles the panel's styles, which come from its source.
  plugins: [react(), reactCompiler(), tailwindcss()],
  resolve: {
    conditions: ["source", ...defaultClientConditions],
    // ../react-wordgard has its own node_modules: one copy of each, or instanceof checks fail.
    dedupe: ["wordgard", "react", "react-dom"],
  },
  optimizeDeps: { include: ["@stesura/react-wordgard > use-sync-external-store/with-selector"] },
  server: {
    fs: {
      allow: [
        searchForWorkspaceRoot(process.cwd()),
        sibling("wordgard"),
        sibling("react-wordgard"),
      ],
    },
  },
  build: {
    target: "es2022",
    rolldownOptions: { input: { main: here("index.html"), frame: here("frame.html") } },
  },
});
