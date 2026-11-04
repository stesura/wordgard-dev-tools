import tailwindcss from "@tailwindcss/vite"
import {defineConfig} from "wxt"

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  // MV3 for Firefox too (WXT defaults Firefox to MV2).
  manifestVersion: 3,
  manifest: ({browser}) => ({
    name: "Wordgard DevTools",
    description: "Inspect Wordgard editors: document, selection, transactions.",
    ...(browser == "firefox" && {
      browser_specific_settings: {
        // Placeholder until the add-on is listed (plan phase 9).
        gecko: {id: "wordgard-devtools@stesura", data_collection_permissions: {required: ["none"]}},
      },
    }),
  }),
  vite: () => ({plugins: [tailwindcss()]}),
})
