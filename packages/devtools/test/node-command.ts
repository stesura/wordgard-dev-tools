import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { BrowserCommand } from "vitest/node";

export type NodeRun = { code: number; stdout: string; stderr: string };

// Under node_modules, so the script's `import "wordgard/…"` resolves to the workspace's copy.
const cache = fileURLToPath(new URL("../node_modules/.cache/", import.meta.url));

/** Runs a script with Node, outside the browser (a repro). For `commands.runNode` in tests. */
export const runNode: BrowserCommand<[script: string], NodeRun> = async (_, script) => {
  await mkdir(cache, { recursive: true });
  const dir = await mkdtemp(join(cache, "node-run-"));
  try {
    const file = join(dir, "script.mjs");
    await writeFile(file, script);
    return await new Promise<NodeRun>((resolve) =>
      execFile(process.execPath, [file], { timeout: 30_000 }, (error, stdout, stderr) =>
        resolve({
          code: error ? (typeof error.code == "number" ? error.code : 1) : 0,
          stdout,
          stderr,
        })
      )
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};
