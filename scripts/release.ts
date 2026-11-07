// Releases both packages, at one version, in two steps around the release commit, which stays the
// maintainer's to make (react-wordgard's flow):
//
//   npm run release:prepare -- <version>   CHANGELOG named, versions set, checks and tests run
//   (commit and push)
//   npm run release:publish                CI on the pushed commit, then npm publish, tag,
//                                          GitHub release, demo deployed to GitHub Pages
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const changelogPath = `${root}CHANGELOG.md`;
const branch = "main";
// The page side first: the panel peers on it.
const published = ["packages/devtools", "packages/panel"];

const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

// npm's own script run with Node: on Windows the npm command is npm.cmd, which would need a shell.
const npmCli =
  process.env.npm_execpath ?? fail("Run this with npm run release:prepare or release:publish.");

const run = (command: string, args: string[]) =>
  execFileSync(command, args, { cwd: root, stdio: "inherit" });
const output = (command: string, args: string[]) =>
  execFileSync(command, args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
    .toString()
    .trim();
const npm = (...args: string[]) => run(process.execPath, [npmCli, ...args]);
const npmOutput = (...args: string[]) => output(process.execPath, [npmCli, ...args]);
const git = (...args: string[]) => output("git", args);
const gh = (...args: string[]) => output("gh", args);

const succeeds = (f: () => unknown) => {
  try {
    f();
    return true;
  } catch {
    return false;
  }
};

const nameOf = (dir: string): string =>
  JSON.parse(readFileSync(`${root}${dir}/package.json`, "utf8")).name;
const currentVersion = (): string =>
  JSON.parse(readFileSync(`${root}${published[0]}/package.json`, "utf8")).version;

// npm view fails (E404) for a package or version that isn't there.
const onNpm = (name: string, version: string) =>
  succeeds(() => {
    if (npmOutput("view", `${name}@${version}`, "version") != version) throw new Error();
  });

// A prerelease (0.2.0-beta.1) goes to the `next` dist-tag, not `latest`.
const isPrerelease = (version: string) => version.includes("-");

// On the release branch, nothing uncommitted, the same commit as origin's.
const checkTree = () => {
  if (git("branch", "--show-current") != branch) fail(`Release from ${branch}.`);
  if (git("status", "--porcelain")) fail("Commit or discard your changes first.");
  git("fetch", "origin", branch);
  if (git("rev-parse", "HEAD") != git("rev-parse", `origin/${branch}`))
    fail(`HEAD isn't origin/${branch}: pull or push first.`);
};

// The CHANGELOG section of `version`, without its heading.
const section = (changelog: string, version: string) => {
  const start = changelog.indexOf(`## ${version} (`);
  if (start < 0) return null;
  const body = changelog.indexOf("\n", start) + 1;
  const end = changelog.indexOf("\n## ", body);
  return changelog.slice(body, end < 0 ? undefined : end).trim();
};

const prepare = (version = "") => {
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version))
    fail("Usage: npm run release:prepare -- <version>, as 0.2.0.");
  checkTree();
  for (const dir of published) {
    const name = nameOf(dir);
    if (onNpm(name, version))
      fail(`${name}@${version} is on npm already: a version can't be published twice.`);
  }

  const changelog = readFileSync(changelogPath, "utf8");
  if (changelog.startsWith("## Unreleased\n")) {
    const date = new Date().toISOString().slice(0, 10);
    writeFileSync(changelogPath, changelog.replace("## Unreleased", `## ${version} (${date})`));
    console.log(`CHANGELOG: ## Unreleased is now ## ${version} (${date}).`);
  } else if (!section(changelog, version)) {
    fail(`CHANGELOG.md starts with neither ## Unreleased nor ## ${version}.`);
  }
  // Both packages, every workspace referring to them, the agent's VERSION and the lockfile.
  run(process.execPath, [`${root}scripts/version.ts`, version]);

  for (const step of [["run", "check"], ["test"], ["run", "build"], ["run", "compiler:check"]])
    if (!succeeds(() => npm(...step)))
      fail(
        `npm ${step.join(" ")} failed. Restore the release changes (git restore .), commit the ` +
          "fix, then run this again."
      );
  console.log(
    "\nReady: commit and push, then npm run release:publish. CI runs the end-to-end tests there."
  );
};

type Run = { databaseId: number };
const ciRuns = (sha: string): Run[] =>
  JSON.parse(gh("run", "list", "--workflow", "ci.yml", "--commit", sha, "--json", "databaseId"));

const watch = ({ databaseId }: Run) => {
  if (!succeeds(() => run("gh", ["run", "watch", String(databaseId), "--exit-status"])))
    fail(`CI failed: nothing was published. Rerun it with gh run rerun ${databaseId}.`);
};

const pause = () => new Promise((done) => setTimeout(done, 2000));

// Waits for CI on `sha`: the run the push started, or one started here.
const runCI = async (sha: string) => {
  // A run started by the push takes a few seconds to be listed.
  for (let tries = 0; tries < 5; tries++) {
    const existing = ciRuns(sha)[0];
    if (existing) {
      console.log("Waiting for CI on the release commit.");
      return watch(existing);
    }
    await pause();
  }
  gh("workflow", "run", "ci.yml", "--ref", branch);
  console.log("CI started on the release commit.");
  for (let tries = 0; tries < 30; tries++) {
    await pause();
    const started = ciRuns(sha)[0];
    if (started) return watch(started);
  }
  fail("CI didn't start within a minute: check the Actions tab.");
};

const publish = async () => {
  checkTree();
  if (!succeeds(() => gh("auth", "status"))) fail("gh isn't logged in: run gh auth login first.");
  npm("run", "release:check");
  const version = currentVersion();
  const notes = section(readFileSync(changelogPath, "utf8"), version);
  if (!notes) fail(`CHANGELOG.md has no ## ${version} section.`);
  const tag = `v${version}`;
  const tagged = () => git("tag", "--list", tag) != "";
  const tagPushed = () => git("ls-remote", "--tags", "origin", tag) != "";
  const releaseCreated = () => succeeds(() => gh("release", "view", tag));
  // Each step is skipped when a previous run did it, so a run that failed halfway can be resumed.
  const pending = published.filter((dir) => !onNpm(nameOf(dir), version));
  if (!pending.length && releaseCreated()) fail(`${version} is released already.`);
  if (pending.length) await publishPackages(version, pending, tagged() || tagPushed());
  else console.log(`Both packages are on npm at ${version}: finishing the release.`);

  if (!tagged()) run("git", ["tag", tag]);
  if (git("rev-list", "-n", "1", tag) != git("rev-parse", "HEAD"))
    fail(`The tag ${tag} isn't on HEAD: check it by hand.`);
  if (!tagPushed()) run("git", ["push", "origin", tag]);
  if (!releaseCreated())
    run("gh", [
      "release",
      "create",
      tag,
      "--title",
      version,
      "--notes",
      notes ?? "",
      ...(isPrerelease(version) ? ["--prerelease"] : []),
    ]);
  // Pages deploys from main only, which is the release commit now.
  gh("workflow", "run", "demo.yml", "--ref", branch);
  console.log("Demo deploy started: https://stesura.github.io/wordgard-devtools/");
  for (const dir of published)
    console.log(`Released: https://www.npmjs.com/package/${nameOf(dir)}/v/${version}`);
};

const publishPackages = async (version: string, pending: string[], tagExists: boolean) => {
  if (tagExists) fail(`The tag v${version} exists, but not every package is on npm.`);
  if (!succeeds(() => npmOutput("whoami"))) fail("Not logged in to npm: run npm login first.");
  await runCI(git("rev-parse", "HEAD"));

  const names = pending.map((dir) => `${nameOf(dir)}@${version}`).join(" and ");
  const distTag = isPrerelease(version) ? "next" : "latest";
  console.log(
    `\nAbout to publish ${names} to npm (dist-tag ${distTag}). This can't be undone: a version ` +
      "can never be published again, and unpublishing blocks the package name for 24 hours."
  );
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await prompt.question("Publish? [y/N] ");
  prompt.close();
  if (answer.trim().toLowerCase() != "y") fail("Nothing was published.");

  // One at a time, so a failure leaves the page side published without the panel, never the
  // reverse; running this again publishes the rest. prepack builds each one.
  for (const dir of pending) npm("publish", "-w", dir, "--tag", distTag);
};

const [command, version] = process.argv.slice(2);
if (command == "prepare") prepare(version);
else if (command == "publish") await publish();
else fail("Usage: node scripts/release.ts prepare <version> | publish");
