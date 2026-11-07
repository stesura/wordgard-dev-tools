import type { NodeRun } from "./node-command.ts";

declare module "vitest/browser" {
  interface BrowserCommands {
    runNode: (script: string) => Promise<NodeRun>;
  }
}
