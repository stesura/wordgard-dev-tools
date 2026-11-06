import tailwindcss from "@tailwindcss/vite"
import {defaultClientConditions} from "vite"
import {defineConfig} from "wxt"
import {cssAndCopiedCode, thirdPartyLicenses} from "../../scripts/third-party-licenses.ts"

// WXT runs one Vite build per entrypoint group: collect across them, write once at the end.
const licenses = thirdPartyLicenses({extra: cssAndCopiedCode, emit: false})

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  // MV3 for Firefox too (WXT defaults Firefox to MV2).
  manifestVersion: 3,
  manifest: ({browser}) => ({
    name: "Wordgard DevTools",
    description: "Inspect Wordgard editors: document, selection, transactions.",
    // The bridge is injected on demand, while the panel is open: no static content script.
    permissions: ["scripting", "webNavigation", "storage"],
    host_permissions: ["<all_urls>"],
    ...(browser == "firefox" && {
      browser_specific_settings: {
        // Placeholder until the add-on is listed (plan phase 9).
        gecko: {id: "wordgard-devtools@stesura", data_collection_permissions: {required: ["none"]}},
      },
    }),
  }),
  vite: () => ({
    // The panel's Tailwind styles come from its source.
    plugins: [tailwindcss(), licenses.plugin],
    resolve: {conditions: ["source", ...defaultClientConditions], dedupe: ["react", "react-dom"]},
  }),
  hooks: {
    "build:done": wxt => {
      if (wxt.config.command == "build") licenses.write(wxt.config.outDir)
    },
  },
})
