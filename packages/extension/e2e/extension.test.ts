// The built extension against the built demo, in Chromium. The panel page is opened as a tab
// with `?tabId=`: DevTools itself can't be driven. The demo docks the in-page panel too, which
// keeps its own editor ("plain", the first) attached throughout.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type BrowserContext, type Page } from "playwright";
import { preview, type PreviewServer } from "vite";
import { afterAll, beforeAll, expect, it } from "vitest";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

let server: PreviewServer;
let context: BrowserContext;
let demo: Page;
let panel: Page;
const errors: string[] = [];

const watch = (page: Page) => {
  page.on("console", (message) => {
    if (message.type() == "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
};

const attached = (page: Page | ReturnType<Page["frames"]>[number]) =>
  page.evaluate(() =>
    [...(window.__WORDGARD_DEVTOOLS__?.editors.values() ?? [])]
      .filter((e) => e.attached)
      .map((e) => e.name)
  );

beforeAll(async () => {
  server = await preview({ root: here("../../../demo"), preview: { port: 0 }, logLevel: "silent" });
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error("No preview URL");
  const extension = here("../.output/chrome-mv3");
  context = await chromium.launchPersistentContext(
    mkdtempSync(join(tmpdir(), "wordgard-devtools-")),
    {
      channel: "chromium",
      headless: true,
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    }
  );
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  const panelUrl = `chrome-extension://${new URL(worker.url()).host}/devtools-panel.html`;
  demo = await context.newPage();
  watch(demo);
  await demo.goto(url);
  await demo.locator("wordgard-devtools").getByText("4 editors").waitFor();
  panel = await context.newPage();
  watch(panel);
  await panel.goto(panelUrl);
  // As a string: this package's types don't declare the `chrome` global.
  const tabId = await panel.evaluate(
    `chrome.tabs.query({url: "${new URL(url).origin}/*"}).then(tabs => tabs[0]?.id)`
  );
  await panel.goto(`${panelUrl}?tabId=${tabId}`);
});

afterAll(async () => {
  await context?.close();
  await server?.close();
});

it("lists every frame's editors and attaches the first", async () => {
  await panel.getByText("5 editors").waitFor();
  await panel.getByText("Plain Wordgard").first().waitFor();
  expect(await attached(demo)).toEqual(["plain"]);
  await panel.getByLabel("Editor", { exact: true }).click();
  await panel.getByRole("option", { name: /left/ }).click();
  await panel.getByText("Left editor.").waitFor();
  expect(await attached(demo)).toEqual(["plain", "left"]);
});

it("shows the document's structure, live", async () => {
  await panel.getByLabel("Editor", { exact: true }).click();
  await panel.getByRole("option", { name: /plain/ }).click();
  // basicSchema has no code mark: one text leaf up to the strong one.
  await panel
    .locator("[data-path='1.0']")
    .getByText('"Created with Wordgard.create, named "')
    .waitFor();
  await demo.locator("#plain wg-content").click();
  await demo.keyboard.press("Control+Home");
  await demo.keyboard.type("Edited ");
  await panel.locator("[data-path='0']").getByText("Edited Plain Wordgard").waitFor();
});

it("shows the state as JSON", async () => {
  const structure = panel.getByLabel("Document structure");
  await structure.locator("[data-path='1']").getByText("Paragraph").waitFor();
  await structure.locator("[data-path='1.1']").getByText('"plain"').waitFor();
  await panel.getByRole("tab", { name: "State" }).click();
  await panel
    .getByRole("tree", { name: "State" })
    .locator("[data-line='$/doc/type']")
    .getByText('"Doc"')
    .waitFor();
  await panel.getByRole("tab", { name: "Structure" }).click();
});

it("shows the schema", async () => {
  await panel.getByRole("tab", { name: "Schema" }).click();
  await panel
    .locator("[data-type='node-Paragraph']")
    .getByText("inline: any", { exact: false })
    .waitFor();
  await panel.locator("[data-type='mark-Strong']").waitFor();
  await panel.getByRole("tab", { name: "Structure" }).click();
});

it("shows the state fields, a named one among them", async () => {
  await panel.getByRole("tab", { name: "Fields" }).click();
  const fields = panel.getByRole("listbox", { name: "State fields" });
  await fields.locator("[data-field='wordCount']").waitFor();
  await demo.locator("#plain wg-content").click();
  await demo.keyboard.press("Control+End");
  await demo.keyboard.type(" more words");
  await fields
    .locator("[data-field='wordCount']")
    .locator("[data-changes]")
    .filter({ hasText: /\d/ })
    .waitFor();
  await panel.getByRole("tab", { name: "Structure" }).click();
});

it("switches to an editor in an iframe and follows it", async () => {
  await panel.getByLabel("Editor", { exact: true }).click();
  await panel.getByRole("option", { name: /framed/ }).click();
  await panel.getByText("An editor in an iframe.").waitFor();
  expect(await attached(demo)).toEqual(["plain"]);
  const frame = demo.frames()[1];
  if (!frame) throw new Error("No iframe");
  expect(await attached(frame)).toEqual(["framed"]);
  await demo.frameLocator("iframe").locator("wg-content").click();
  await demo.keyboard.type(" Typed");
  await panel.getByText(/Typed/).waitFor();
});

it("outlines a clicked row's node in the page", async () => {
  await panel.getByLabel("Editor", { exact: true }).click();
  await panel.getByRole("option", { name: /right/ }).click();
  await panel.locator("[data-path='0']").click();
  await demo.locator("[data-wordgard-devtools-overlay]").getByText("Paragraph").waitFor();
  await panel.getByRole("tab", { name: "State" }).click();
  await demo.locator("[data-wordgard-devtools-overlay]").waitFor({ state: "detached" });
  await panel.getByRole("tab", { name: "Structure" }).click();
});

it("picks a node in an iframe's editor without moving its caret", async () => {
  const frame = demo.frames()[1];
  if (!frame) throw new Error("No iframe");
  const caret = () =>
    frame.evaluate(() => {
      const wg = [...(window.__WORDGARD_DEVTOOLS__?.editors.values() ?? [])][0]?.wg;
      return wg && [wg.state.selection.anchor, wg.state.selection.head];
    });
  const before = await caret();
  await panel.getByLabel("Pick a node in the page").click();
  await demo.frameLocator("iframe").getByText("An editor in an iframe.").click();
  await expect
    .poll(() => panel.getByLabel("Editor", { exact: true }).textContent())
    .toContain("framed");
  // Playwright clicks the paragraph's centre, past its text: the paragraph is picked, and focused.
  await panel.locator("[data-path='0'][aria-selected='true']").waitFor();
  expect(await panel.getByLabel("Pick a node in the page").getAttribute("aria-pressed")).toBe(
    "false"
  );
  expect(await caret()).toEqual(before);
});

it("records the transaction log, with timing", async () => {
  await panel.getByLabel("Editor", { exact: true }).click();
  await panel.getByRole("option", { name: /left/ }).click();
  await panel.getByText("Left editor.").waitFor();
  await panel.getByRole("tab", { name: "Log" }).click();
  await panel.getByRole("button", { name: "Record" }).click();
  await panel.getByRole("button", { name: "Pause", exact: true }).waitFor();
  await demo.locator("#left wg-content").click();
  await demo.keyboard.type("x");
  const list = panel.getByRole("listbox", { name: "Transactions" });
  await list.getByText("input.type").waitFor();
  // Drawn: the flush's timing is in.
  await list.locator("[data-flush]").first().waitFor();
  await list.getByRole("option").filter({ hasText: "input.type" }).click();
  await panel.getByLabel("Transaction").getByText("x", { exact: true }).waitFor();
  await panel.getByRole("button", { name: "Pause", exact: true }).click();
  await panel.getByRole("tab", { name: "Structure" }).click();
});

it("keeps the picked editor across a reload", async () => {
  await panel.getByLabel("Editor", { exact: true }).click();
  await panel.getByRole("option", { name: /right/ }).click();
  await panel.getByText("Right editor.").waitFor();
  await demo.reload();
  await panel.getByText("5 editors").waitFor();
  await panel.getByText("Right editor.").waitFor();
  await expect.poll(() => attached(demo)).toEqual(["plain", "right"]);
});

it("detaches its own editor when the panel closes, not the dock's", async () => {
  await panel.close();
  await expect.poll(() => attached(demo)).toEqual(["plain"]);
  expect(errors).toEqual([]);
});
