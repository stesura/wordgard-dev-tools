// Lockstep versions for the published packages: they're always released together, at one
// version, and every workspace refers to them at exactly that version.
//   node scripts/version.ts 0.2.0        set it everywhere and refresh the lockfile
//   node scripts/version.ts --check [v0.2.0]   fail if they drift (or don't match the tag), or if
//                                              CI doesn't test the oldest wordgard we accept
import {execSync} from "node:child_process"
import {readFileSync, writeFileSync} from "node:fs"
import {fileURLToPath} from "node:url"

const root = fileURLToPath(new URL("..", import.meta.url))
const published = ["packages/devtools", "packages/panel"]
const workspaces = [...published, "packages/extension", "demo"]
const sections = ["dependencies", "devDependencies", "peerDependencies"]

type Manifest = {name: string; version?: string} & {[section: string]: unknown}

// The agent announces it to the panel.
const constant = `${root}packages/devtools/src/version.ts`
const constantPattern = /(export const VERSION = )"([^"]*)"/

const file = (dir: string) => `${root}${dir}/package.json`
const read = (dir: string): Manifest => JSON.parse(readFileSync(file(dir), "utf8"))
const names = published.map(dir => read(dir).name)

const isRecord = (value: unknown): value is Record<string, string> => typeof value == "object" && value != null

// Every [where, version] the published packages are given: their own versions and references.
const versions = () =>
  workspaces.flatMap(dir => {
    const manifest = read(dir)
    const own: [string, string][] = published.includes(dir) ? [[`${dir} version`, manifest.version ?? ""]] : []
    const refs = sections.flatMap(section => {
      const deps = manifest[section]
      if (!isRecord(deps)) return []
      return names.flatMap((name): [string, string][] =>
        name in deps ? [[`${dir} ${section}.${name}`, deps[name]]] : [],
      )
    })
    return [...own, ...refs]
  }).concat([["packages/devtools/src/version.ts VERSION", readFileSync(constant, "utf8").match(constantPattern)?.[2] ?? ""]])

// CI tests against the oldest wordgard the page side accepts, so a newer API used without raising
// the floor fails there (a local ../wordgard may be newer).
const action = `${root}.github/actions/setup/action.yml`
const wordgardFloor = (): string[] => {
  const range = read("packages/devtools").peerDependencies
  const floor = (isRecord(range) ? range.wordgard : "").match(/^(?:>=|~|\^)?\s*(\d+\.\d+\.\d+)/)?.[1]
  const tested = readFileSync(action, "utf8").match(/^  wordgard:\n(?:    .*\n)*?    default: "?([^"\n]+)"?$/m)?.[1]
  if (floor && floor == tested) return []
  return [`CI's wordgard (${tested ?? "not found"}, .github/actions/setup) isn't the floor of the page side's peer range (${floor ?? "not found"})`]
}

const check = (tag?: string) => {
  const found = versions()
  const expected = found[0][1]
  const wrong = found.filter(([, version]) => version != expected)
  if (tag != null && tag != `v${expected}`) wrong.push([`tag ${tag}`, `v${expected} expected`])
  const floor = wordgardFloor()
  if (!wrong.length && !floor.length) return console.log(`Lockstep at ${expected}; CI tests the wordgard floor.`)
  if (wrong.length) console.error(`Not in lockstep with ${found[0][0]} (${expected}):`)
  for (const [where, version] of wrong) console.error(`  ${where}: ${version}`)
  for (const problem of floor) console.error(problem)
  process.exit(1)
}

const set = (version: string) => {
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
    console.error(`Not a version: ${version}`)
    process.exit(1)
  }
  // Edits the text, not a reserialised object, to keep each file's formatting.
  for (const dir of workspaces) {
    let text = readFileSync(file(dir), "utf8")
    if (published.includes(dir)) text = text.replace(/^(  "version": )"[^"]*"/m, `$1"${version}"`)
    for (const name of names) text = text.replaceAll(new RegExp(`("${name}": )"[^"]*"`, "g"), `$1"${version}"`)
    writeFileSync(file(dir), text)
  }
  writeFileSync(constant, readFileSync(constant, "utf8").replace(constantPattern, `$1"${version}"`))
  execSync("npm install --package-lock-only --ignore-scripts", {cwd: root, stdio: "inherit"})
  check()
}

const [first, second] = process.argv.slice(2)
if (first == "--check") check(second)
else if (first) set(first)
else {
  console.error("Usage: node scripts/version.ts <version> | --check [tag]")
  process.exit(1)
}
