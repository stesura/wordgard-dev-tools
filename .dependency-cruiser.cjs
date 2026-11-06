/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      comment:
        "Runtime cycles only: devtools' agent reaches its handlers through import() and types.",
      severity: "error",
      from: {},
      to: { circular: true, viaOnly: { dependencyTypesNot: ["type-only", "dynamic-import"] } },
    },
    {
      name: "not-to-unresolvable",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: "no-orphans",
      severity: "error",
      from: {
        orphan: true,
        pathNot: [
          "(^|/)[^/]+\\.d\\.ts$",
          "(^|/)[^/]+\\.config\\.[cm]?[jt]s$",
          "^scripts/",
          // WXT entrypoints are found by convention, not imported.
          "^packages/extension/entrypoints/",
          "(^|/)(test|e2e)/",
        ],
      },
      to: {},
    },
    {
      name: "not-to-undeclared",
      comment: "Every npm import is declared in a package.json.",
      severity: "error",
      from: {},
      to: { dependencyTypes: ["npm-no-pkg", "npm-unknown", "unknown", "undetermined"] },
    },
    {
      name: "not-to-test",
      severity: "error",
      from: { path: "^(packages/[^/]+|demo)/(src|entrypoints)/" },
      to: { path: "(^|/)(test|e2e)/" },
    },
    {
      name: "devtools-framework-free",
      comment: "The page side runs in the app: Wordgard only, no React, no panel, no extension.",
      severity: "error",
      from: { path: "^packages/devtools/src/" },
      to: { pathNot: ["^packages/devtools/src/", "(^|/)wordgard/"] },
    },
    {
      name: "panel-not-to-host",
      comment: "The panel is transport-agnostic: it knows nothing of the extension or the demo.",
      severity: "error",
      from: { path: "^packages/panel/src/" },
      to: { path: "^(packages/extension|demo)/" },
    },
    {
      name: "no-cross-package-relative",
      comment: "Workspaces import each other by package name, not by relative path.",
      severity: "error",
      from: { path: "^(packages/[^/]+|demo)/" },
      to: {
        path: "^(packages/[^/]+|demo)/",
        pathNot: "^$1/",
      },
    },
  ],
  options: {
    // Linked packages (workspaces, ../wordgard) stay npm dependencies instead of resolving to
    // their real paths.
    preserveSymlinks: true,
    doNotFollow: { path: "node_modules" },
    exclude: { path: "^(packages/[^/]+|demo)/(dist|\\.output|\\.wxt)/" },
    tsPreCompilationDeps: true,
    combinedDependencies: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["source", "import", "types", "default"],
      mainFields: ["module", "main", "types", "typings"],
      extensions: [".ts", ".tsx", ".js", ".mjs", ".cjs", ".d.ts"],
    },
  },
};
