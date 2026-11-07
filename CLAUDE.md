# CLAUDE.md

Wordgard DevTools: a DevTools panel for Wordgard editors. MIT. The plan is `docs/partially-executed/plan.md`.

- Layout: npm workspaces. `packages/devtools` (`@stesura/wordgard-dev-tools`, page side, framework-free),
  `packages/panel` (`@stesura/wordgard-dev-tools-panel`, the React panel and `mountDevtools()`),
  `packages/extension` (WXT shell), `demo/` (Vite page with the in-page panel docked).
- `wordgard` and `@stesura/react-wordgard` are local path dependencies on `../wordgard` and
  `../react-wordgard`. Wordgard's source in `../wordgard` is documentation: read it, never edit
  it. `../wordgard` needs `npm install --no-package-lock` once (builds its `dist/`).
- Before writing code against Wordgard, read `../react-wordgard/skills/react-wordgard/SKILL.md`
  and its `references/wordgard.md`.
- Checks: `npm run typecheck`, `npm run lint` (Rules of React), `npm test` (Vitest, Chromium
  through Playwright; run `npx playwright install chromium` once), `npm run build`,
  `npm run compiler:check` (after build), `npm run dependency-check` (dependency-cruiser; rules in
  `.dependency-cruiser.cjs`), `npm run format:check` (Prettier; `npm run format` fixes).
  `npm run check` runs the static ones. Demo: `npm run dev`.
- Release: `npm run release:prepare -- X.Y.Z`, commit and push, `npm run release:publish`
  (`scripts/release.ts`, react-wordgard's flow; see RELEASE.md). Changes go in `CHANGELOG.md`
  under `## Unreleased`.
- Panel layout (`packages/panel/src`): `tabs/<tab>/`, `panel/`, `components/` (shadcn in
  `components/ui/`), `hooks/`, `stores/` (nanostores), `lib/` (no React), `guides/*.md` (the
  guides, in markdown). Layers, tests and the `shadcn add` steps are in CONTRIBUTING.md.
- Tests, in every package: unit tests beside their module in `__tests__/<module>.spec.ts`;
  integration tests (editors on a page) in `test/*.test.ts`; the extension's end to end in
  `e2e/*.test.ts`.
- End to end: `npm run e2e -w wordgard-devtools-extension` builds the extension and the demo, then
  drives the extension's panel page (opened with `?tabId=`) against the demo in Chromium.
- Extension: background routes between the panel and one bridge per frame; the bridge (isolated
  world, injected while the panel is open) relays the page agent's postMessage protocol.

## Rules

- Use npm.
- Never run `git commit` or `git stash`.
- Arrow functions, not `function`.
- No typecasts (`as`, `!`, `<T>x`). If one is unavoidable, say so.
- No inline imports, except `import()` for lazy loading.
- Comments: terse, only for decisions, workarounds or what the code can't say.
- React: avoid `useEffect`. Prefer external stores (`useSyncExternalStore`), event handlers and
  ref callbacks.
- Answers: brief.
- Plans in `docs/`: when a phase is implemented, mark it executed in the plan and note
  deviations.

## Handoff

When I ask you to write handoff, write it in chat, don't write in a file.

## Plan implementation - audit loop

When you implement a plan that is in /docs or any large bit of work that modified a lot of files or was complex; when the work is implemented and your checks are green:

1. **Launch a Fable audit.** Use the Agent tool with `model: "fable"`, in the background. Fable only audits; it must not edit files, commit or stash. It has no context, so its prompt must be self-contained:
   - What changed and why: [one paragraph, or "summarise the task above"].
   - The files changed (`git status`, `git diff`).
   - What to scrutinise: [the risky parts, e.g. "edge cases in X, the interaction with Y, test fidelity"].
   - Claims to verify, not trust: your test and typecheck results, with counts.
   - The project rules (CLAUDE.md).
   - The output format: findings most severe first, each with file:line, a concrete failure scenario, and "confirmed" (traced or run) or "plausible".

2. **Verify each finding yourself.** Don't take the audit on trust: check every finding against the code, or by running it. Fix the ones that hold up. Reject the rest with a reason. You make all the changes; Fable doesn't.

3. **Re-run your checks** after the fixes. Re-audit only if the fixes were substantial.

4. **Update the plan(s)** Mark the elements of plan that are done as being executed, if you devieted from the plan explain how and why, if there are sill open points or issues you've raised, add them at the bottom of the plan, if the plan is partially executed, put it in docs/partially executed, if fully executed put it in docs/executed.

5. **Report:**
   - what you implemented;
   - each Fable finding, marked accepted (and fixed) or rejected, with the reason;
   - the final check results;
   - a short commit message and a short description;
   - if there is a next step, a handoff prompt for the next agent to take over.

## Don't ever say "co-authored by Claude"
