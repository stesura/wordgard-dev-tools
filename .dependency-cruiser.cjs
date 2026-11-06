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
    // The panel's layers (docs/panel-restructure.md). Type-only imports are exempt: the layers are
    // about what runs. tabs/tabs.ts is plain data, open to all.
    {
      name: "panel-lib-plain",
      comment: "lib/ is plain helpers: no React, no components, tabs, panel, stores or hooks.",
      severity: "error",
      from: { path: "^packages/panel/src/lib/" },
      to: {
        path: [
          "^packages/panel/src/(components|tabs|panel|stores|hooks)/",
          "(^|/)node_modules/react(-dom)?/",
        ],
        pathNot: "^packages/panel/src/tabs/tabs\\.ts$",
        dependencyTypesNot: ["type-only"],
      },
    },
    {
      name: "panel-stores-below-ui",
      comment: "stores/ knows no components, tabs, panel or hooks.",
      severity: "error",
      from: { path: "^packages/panel/src/stores/" },
      to: {
        path: "^packages/panel/src/(components|tabs|panel|hooks)/",
        pathNot: "^packages/panel/src/tabs/tabs\\.ts$",
        dependencyTypesNot: ["type-only"],
      },
    },
    {
      name: "panel-components-below-tabs",
      comment: "components/ and hooks/ are shared by the tabs, so they know no tab and no panel.",
      severity: "error",
      from: { path: "^packages/panel/src/(components|hooks)/" },
      to: {
        path: "^packages/panel/src/(tabs|panel)/",
        pathNot: "^packages/panel/src/tabs/tabs\\.ts$",
        dependencyTypesNot: ["type-only"],
      },
    },
    {
      name: "panel-tabs-apart",
      comment: "A tab doesn't import another tab: what they share goes to components/ or lib/.",
      severity: "error",
      from: { path: "^packages/panel/src/tabs/([^/]+)/" },
      to: {
        path: "^packages/panel/src/tabs/",
        pathNot: ["^packages/panel/src/tabs/$1/", "^packages/panel/src/tabs/tabs\\.ts$"],
        dependencyTypesNot: ["type-only"],
      },
    },
    {
      name: "panel-tabs-list-plain",
      comment: "tabs/tabs.ts imports nothing: Node scripts load it.",
      severity: "error",
      from: { path: "^packages/panel/src/tabs/tabs\\.ts$" },
      to: {},
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
