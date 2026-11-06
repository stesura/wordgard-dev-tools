// The README's tab screenshots (docs/screenshots/<tab>.png), taken from the demo in Chromium.
//   node scripts/screenshots.ts
// Needs `npx playwright install chromium` once.
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import { createServer } from "vite";
import type { View } from "../packages/panel/src/store.ts";
import { TAB_ORDER } from "../packages/panel/src/guides.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = `${root}docs/screenshots`;

const panel = (page: Page) => page.locator("wordgard-devtools [role='region']");
const editor = (page: Page) => page.locator("#plain wg-content p").first();

const typeInEditor = async (page: Page, text: string) => {
  await editor(page).click();
  await page.keyboard.press("End");
  await page.keyboard.type(text, { delay: 20 });
};

// Something to show in each tab.
const prepare: Record<View, (page: Page) => Promise<void>> = {
  structure: async (page) => {
    await editor(page).click();
    await panel(page).locator("[aria-label='Document structure'] [data-path='1']").first().click();
  },
  selection: async (page) => {
    await editor(page).dblclick();
  },
  state: async () => {},
  view: async (page) => {
    await panel(page).locator("[data-dom='1']").first().click();
  },
  schema: async () => {},
  fields: async (page) => {
    await typeInEditor(page, " Three more words.");
    await panel(page).locator("[data-field='wordCount']").first().click();
  },
  log: async (page) => {
    await panel(page).getByRole("button", { name: "Record" }).click();
    await typeInEditor(page, " Hello");
    await panel(page)
      .locator("[role='listbox'][aria-label='Transactions'] [role='option']")
      .first()
      .click();
  },
};

mkdirSync(out, { recursive: true });
const server = await createServer({
  configFile: `${root}demo/vite.config.ts`,
  root: `${root}demo`,
  logLevel: "error",
});
await server.listen();
const url = server.resolvedUrls?.local[0];
if (!url) throw new Error("The demo server has no URL");
const browser = await chromium.launch();
try {
  for (const view of TAB_ORDER) {
    const context = await browser.newContext({
      viewport: { width: 1100, height: 760 },
      deviceScaleFactor: 2,
      colorScheme: "light",
    });
    await context.addInitScript((shown) => {
      localStorage.setItem(
        "wordgard-devtools:dock",
        JSON.stringify({ side: "bottom", size: 460, collapsed: false })
      );
      localStorage.setItem(
        "wordgard-devtools:panel",
        JSON.stringify({ view: shown, editor: "plain" })
      );
      localStorage.setItem("wordgard-devtools:theme", "light");
    }, view);
    const page = await context.newPage();
    await page.goto(url);
    await panel(page).waitFor();
    // The tab's first load.
    await page.waitForTimeout(500);
    await prepare[view](page);
    await page.mouse.move(0, 0);
    await page.waitForTimeout(500);
    await panel(page).screenshot({ path: `${out}/${view}.png` });
    await context.close();
    console.log(`docs/screenshots/${view}.png`);
  }
} finally {
  await browser.close();
  await server.close();
}
