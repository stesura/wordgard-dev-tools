import {existsSync, readFileSync, readdirSync, writeFileSync} from "node:fs"
import {dirname, isAbsolute, join, relative, resolve, sep} from "node:path"
import {fileURLToPath} from "node:url"
import type {Plugin} from "vite"

export const FILE = "THIRD_PARTY_LICENSES.txt"

type Package = {name: string, version: string, license: string, text: string, note?: string}

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..")

const readJson = (file: string): unknown => JSON.parse(readFileSync(file, "utf8"))

const field = (json: unknown, key: string): unknown =>
  typeof json == "object" && json != null && key in json ? Object.entries(json).find(([k]) => k == key)?.[1] : undefined

const licenseOf = (json: unknown): string => {
  const license = field(json, "license")
  if (typeof license == "string") return license
  const type = field(license, "type")
  return typeof type == "string" ? type : "UNKNOWN"
}

const readPackage = (dir: string, note?: string): Package | null => {
  const file = join(dir, "package.json")
  if (!existsSync(file)) return null
  const json = readJson(file)
  const name = field(json, "name"), version = field(json, "version")
  // Nested package.json files ({"type": "module"}) have no name: keep walking up.
  if (typeof name != "string" || typeof version != "string") return null
  const license = licenseOf(json)
  const licenseFiles = readdirSync(dir).filter(f => /^(licen[cs]e|copying)(\.|-|$)/i.test(f)).sort()
  const text = licenseFiles.length
    ? licenseFiles.map(f => readFileSync(join(dir, f), "utf8").trim()).join("\n\n")
    : `${license} (the package ships no licence file)`
  return {name, version, license, text, note}
}

const ownCode = (dir: string) => {
  const path = relative(repo, dir)
  return !path.startsWith("..") && !isAbsolute(path) && !path.split(sep).includes("node_modules")
}

/** Collects the npm packages bundled into the output, plus `extra`: packages that reach it another
 * way (compiled CSS, copied source), each with a note saying how. */
export const thirdPartyLicenses = ({extra = {}, emit = true}: {extra?: Record<string, string>, emit?: boolean} = {}) => {
  const found = new Map<string, Package>()
  const byDir = new Map<string, Package | null>()

  const packageAt = (start: string): Package | null => {
    const seen: string[] = []
    let result: Package | null = null
    for (let dir = start; ; dir = dirname(dir)) {
      const cached = byDir.get(dir)
      if (cached !== undefined) { result = cached; break }
      seen.push(dir)
      if (ownCode(dir) && existsSync(join(dir, "package.json"))) break
      const pkg = readPackage(dir)
      if (pkg) { result = pkg; break }
      if (dirname(dir) == dir) break
    }
    for (const dir of seen) byDir.set(dir, result)
    return result
  }

  const add = (pkg: Package) => {
    const key = `${pkg.name}@${pkg.version}`
    const prev = found.get(key)
    found.set(key, prev?.note ? prev : pkg)
  }

  const findInstalled = (name: string) => {
    for (let dir = process.cwd(); ; dir = dirname(dir)) {
      const pkg = readPackage(join(dir, "node_modules", name))
      if (pkg) return pkg
      if (dirname(dir) == dir) throw new Error(`${FILE}: package ${name} is not installed`)
    }
  }

  const render = () => {
    for (const [name, note] of Object.entries(extra)) add({...findInstalled(name), note})
    const entries = [...found.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version))
    const rule = "-".repeat(80)
    return [
      "Third-party software included in this build, with its licences.",
      ...entries.map(p => [rule, `${p.name} ${p.version} (${p.license})`, ...(p.note ? [p.note] : []), "", p.text].join("\n")),
      "",
    ].join("\n\n")
  }

  const plugin: Plugin = {
    name: "third-party-licenses",
    apply: "build",
    generateBundle(_, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type != "chunk") continue
        for (const [id, module] of Object.entries(output.modules)) {
          const path = id.split("?")[0] ?? ""
          if (module.renderedLength == 0 || !isAbsolute(path) || !existsSync(path)) continue
          const pkg = packageAt(dirname(path))
          if (pkg) add(pkg)
        }
      }
      if (emit) this.emitFile({type: "asset", fileName: FILE, source: render()})
    },
  }

  return {plugin, write: (dir: string) => writeFileSync(join(dir, FILE), render())}
}

export const cssAndCopiedCode = {
  "tailwindcss": "Compiled into the panel's CSS.",
  "tw-animate-css": "Compiled into the panel's CSS.",
  "shadcn": "Its tailwind.css is compiled into the panel's CSS; the shadcn/ui components in packages/panel/src/components/ui are copied from it.",
  "heroicons": "Its 16px icons are copied into packages/panel/src/icons (heroicons.tsx, and one adapted in custom.tsx).",
}
