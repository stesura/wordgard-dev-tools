// The React Compiler, for every build of the panel: its own (tests and dist), the extension's
// and the demo's, which build it from source. `npm run compiler:check` fails if one is missing it.
// Babel, not plugin-react's Rust `compiler` option, which is experimental.
import babel from "@rolldown/plugin-babel"
import {reactCompilerPreset} from "@vitejs/plugin-react"
import {fileURLToPath} from "node:url"

const root = fileURLToPath(new URL("..", import.meta.url)).replaceAll("\\", "/")
const escaped = root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

export const reactCompiler = () => {
  // A component the compiler can't compile fails the build, instead of silently staying
  // uncompiled. Opt one out with a "use no memo" directive.
  const preset = reactCompilerPreset({panicThreshold: "all_errors"})
  // This repo's sources only: ../wordgard and ../react-wordgard resolve outside node_modules.
  // The drive letter's case varies on Windows.
  preset.rolldown.filter = {
    ...preset.rolldown.filter,
    id: {include: new RegExp(`^${escaped}(packages|demo)/`, "i"), exclude: /\/node_modules\//},
  }
  return babel({presets: [preset]})
}
