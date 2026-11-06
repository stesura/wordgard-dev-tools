# Security policy

## Supported versions

Wordgard DevTools hasn't been released yet. Until it is, only the `main` branch is supported. After
the first release, only the latest version of each package and of the extension gets security fixes.

## Reporting a vulnerability

Please report vulnerabilities privately, through
[GitHub's private vulnerability reporting](https://github.com/stesura/wordgard-devtools/security/advisories/new).
Don't open a public issue.

Include the affected package or extension, the version or commit, and the steps to reproduce. You
should get a reply within a week. We'll agree a disclosure date with you once a fix is ready.

## Scope

Relevant reports include:

- the extension exposing page data to other pages, frames or extensions, or acting on a page the
  DevTools panel isn't open for;
- the bridge or the page agent accepting messages from somewhere they shouldn't;
- the panel running page-supplied content as code (for example through the rendered DOM, the
  state or the schema);
- `wordgardDevtools()` or `mountDevtools()` staying active in a production build when `enabled`
  isn't set.

Out of scope: a script already running in the page using the page agent. The agent answers the
page it runs in by design, and it's off in production builds by default.
