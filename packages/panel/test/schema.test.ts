import { afterEach, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { Node, Plot, Schema } from "wordgard/doc";
import { Wordgard } from "wordgard/editor";
import { basicSchema } from "wordgard/schema";
import { GardState } from "wordgard/state";
import { wordgardDevtools } from "@stesura/wordgard-dev-tools";
import { mountDevtools, type MountedDevtools } from "../src/index.ts";

let wg: Wordgard | null = null;
let mounted: MountedDevtools | null = null;

afterEach(() => {
  mounted?.unmount();
  mounted = null;
  wg?.dom.remove();
  wg = null;
  localStorage.clear();
});

const until = async <T>(get: () => T | null | undefined | false, timeout = 2000): Promise<T> => {
  const start = performance.now();
  for (;;) {
    const value = get();
    if (value) return value;
    if (performance.now() - start > timeout) throw new Error("Timed out");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

const shadow = () => {
  const root = mounted?.host?.shadowRoot;
  if (!root) throw new Error("No shadow root");
  return root;
};

const tab = (name: string) =>
  [...shadow().querySelectorAll<HTMLElement>("[role='tab']")].find(
    (element) => element.textContent == name
  );
const card = (key: string) => shadow().querySelector<HTMLElement>(`[data-type='${key}']`);

const Callout = Plot.define("Callout", {
  blockContent: Node.Group.Textblock,
  group: Node.Group.Content,
  shape: { element: "aside" },
});

const setup = async () => {
  wg = Wordgard.create({
    parent: document.body,
    doc: "<p>Hi</p>",
    config: [basicSchema(), wordgardDevtools({ name: "s" })],
  });
  mounted = mountDevtools();
  await mounted.ready;
  (await until(() => tab("Schema"))).click();
  return until(() => card("node-Paragraph"));
};

it("shows the node and mark types", async () => {
  const paragraph = await setup();
  expect(paragraph.textContent).toContain("textblock");
  expect(paragraph.textContent).toContain("inline: any");
  expect(paragraph.textContent).toContain("<p>");
  expect(card("mark-Strong")?.textContent).toContain("goes onTextLineBreak");
});

it("filters the types, and follows a link to a type", async () => {
  await setup();
  const filter = await until(() =>
    shadow().querySelector<HTMLInputElement>("[aria-label='Filter the types']")
  );
  await userEvent.fill(filter, "Str");
  await until(() => !card("node-Paragraph"));
  expect(card("mark-Strong")).not.toBeNull();
  // The Strong card's link to Text clears the filter.
  [...(card("mark-Strong")?.querySelectorAll("button") ?? [])]
    .find((b) => b.textContent == "Text")
    ?.click();
  await until(() => card("node-Text") && card("node-Paragraph"));
});

it("reloads when the configuration changes", async () => {
  await setup();
  wg?.dispatch({ effects: GardState.appendConfig.of(GardState.schemaElement.of(Callout)) });
  await until(() => card("node-Callout"));
});

const section = (name: string) =>
  shadow().querySelector<HTMLElement>(`section[aria-label='${name}']`);
const toggle = (scope: ParentNode, text: string) =>
  [...scope.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")].find(
    (b) => b.textContent == text
  );

it("collapses nodes or marks, filters them by tag, and orders marks by rank", async () => {
  await setup();
  toggle(shadow(), "3 marks")?.click();
  await until(() => !card("mark-Strong") && card("node-Paragraph"));
  toggle(shadow(), "3 marks")?.click();
  await until(() => card("node-Paragraph") && card("mark-Strong"));

  const nodes = await until(() => section("Nodes"));
  toggle(nodes, "textblock")?.click();
  await until(() => !card("node-Text"));
  expect(
    [...nodes.querySelectorAll("[data-type^='node-']")].map((c) => c.getAttribute("data-type"))
  ).toEqual(["node-Paragraph", "node-Heading"]);
  toggle(nodes, "defining")?.click();
  await until(() => !card("node-Paragraph") && card("node-Heading"));

  const marks = await until(() => section("Marks"));
  const order = () =>
    [...marks.querySelectorAll("[data-type^='mark-']")].map((c) => c.getAttribute("data-type"));
  expect(order()).toEqual(["mark-Strong", "mark-Emphasis", "mark-Link"]);
  toggle(marks, "rank")?.click();
  await until(() => order()[0] == "mark-Link");
  expect(order()).toEqual(["mark-Link", "mark-Emphasis", "mark-Strong"]);
  toggle(marks, "inclusive")?.click();
  await until(() => !card("mark-Link"));
});

it("keeps both of two tags pressed in one go", async () => {
  await setup();
  const nodes = await until(() => section("Nodes"));
  // Both before React renders: the second must not start from the first's stale filters.
  toggle(nodes, "textblock")?.click();
  toggle(nodes, "defining")?.click();
  await until(() => !card("node-Paragraph") && card("node-Heading"));
  expect(toggle(nodes, "textblock")?.getAttribute("aria-pressed")).toBe("true");
  expect(toggle(nodes, "defining")?.getAttribute("aria-pressed")).toBe("true");
});

it("rings the card a link or a click lands on", async () => {
  await setup();
  [...(card("mark-Strong")?.querySelectorAll("button") ?? [])]
    .find((b) => b.textContent == "Text")
    ?.click();
  // And focused (a frame later): else that focus would select it again after the click below.
  await until(
    () =>
      card("node-Text")?.className.includes("ring-2") && shadow().activeElement == card("node-Text")
  );
  expect(card("mark-Strong")?.className).not.toContain("ring-2");
  card("node-Paragraph")?.click();
  await until(() => card("node-Paragraph")?.className.includes("ring-2"));
  expect(card("node-Text")?.className).not.toContain("ring-2");
});

it("clears every filter at once, and a section's tags with their ×", async () => {
  await setup();
  const clearAll = () =>
    [...shadow().querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => b.textContent == "Clear filters"
    );
  expect(clearAll()).toBeUndefined();
  toggle(shadow(), "3 marks")?.click();
  await until(() => !card("mark-Strong"));
  const filter = await until(() =>
    shadow().querySelector<HTMLInputElement>("[aria-label='Filter the types']")
  );
  await userEvent.fill(filter, "Para");
  toggle(section("Nodes") ?? shadow(), "textblock")?.click();
  await until(() => !card("node-Heading"));
  clearAll()?.click();
  await until(() => card("mark-Strong") && card("node-Text") && card("node-Heading"));
  expect(filter.value).toBe("");
  expect(clearAll()).toBeUndefined();
  const nodes = await until(() => section("Nodes"));
  toggle(nodes, "textblock")?.click();
  await until(() => !card("node-Text"));
  nodes.querySelector<HTMLButtonElement>("[aria-label='Clear the nodes filters']")?.click();
  await until(() => card("node-Text"));
  expect(nodes.querySelector("[aria-label='Clear the nodes filters']")).toBeNull();
});

it("collapses a section to its bar from its title or the bar's empty stretch, and the toolbar shows which are open", async () => {
  await setup();
  const bar = (name: string) => section(name)?.querySelector<HTMLElement>("[data-heading]");
  const stretch = (name: string) => section(name)?.querySelector<HTMLElement>("[data-collapse]");
  const marksToggle = () =>
    [...shadow().querySelectorAll("button[aria-pressed]")].find((b) =>
      b.textContent?.endsWith(" marks")
    );
  expect(marksToggle()?.getAttribute("aria-pressed")).toBe("true");
  // The bar itself and its "order" label don't toggle.
  bar("Marks")?.click();
  [...(bar("Marks")?.querySelectorAll("span") ?? [])]
    .find((span) => span.textContent == "order")
    ?.click();
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(card("mark-Strong")).not.toBeNull();
  stretch("Marks")?.click();
  await until(() => !card("mark-Strong"));
  expect(card("node-Paragraph")).not.toBeNull();
  expect(bar("Marks")).not.toBeNull();
  expect(marksToggle()?.getAttribute("aria-pressed")).toBe("false");
  // A tag in the bar filters; it doesn't collapse the section.
  toggle(section("Nodes") ?? shadow(), "textblock")?.click();
  await until(() => !card("node-Text"));
  expect(card("node-Paragraph")).not.toBeNull();
  const title = section("Marks")?.querySelector<HTMLButtonElement>("h3 button");
  expect(title?.getAttribute("aria-expanded")).toBe("false");
  title?.click();
  await until(() => card("mark-Strong"));
  stretch("Nodes")?.click();
  await until(() => !card("node-Paragraph") && card("mark-Strong"));
});

it("gives the cards and the bars their roles, names and descriptions", async () => {
  const paragraph = await setup();
  // An article, not a region: no landmark per card; its heading, for heading navigation.
  expect(paragraph.tagName).toBe("ARTICLE");
  await expect.element(paragraph).toHaveAccessibleName("Paragraph node");
  expect(paragraph.querySelector("h4")?.textContent).toBe("Paragraph");
  const tags = paragraph.querySelector("[role='list'][aria-label='tags']");
  expect(
    [...(tags?.querySelectorAll("[role='listitem']") ?? [])].map((tag) => tag.textContent)
  ).toContain("textblock");
  expect(paragraph.textContent).toContain("shape <p>");
  expect([...paragraph.querySelectorAll("dl > div > dt")].map((dt) => dt.textContent)).toEqual([
    "groups",
    "content",
    "holds",
    "marks",
  ]);

  // A link's name: its text, then what it links to.
  const link = (scope: Element | null, text: string) =>
    [...(scope?.querySelectorAll<HTMLButtonElement>("dd button") ?? [])].find(
      (button) => button.textContent == text
    ) ?? null;
  await expect.element(link(paragraph, "Text")).toHaveAccessibleName("Text node type");
  await expect.element(link(paragraph, "Content")).toHaveAccessibleName("Content node group");
  await expect.element(link(card("node-Text"), "Strong")).toHaveAccessibleName("Strong mark type");

  // A bar: named by its title, its count says of what, its tags a group.
  const nodes = await until(() => section("Nodes"));
  const title = nodes.querySelector<HTMLButtonElement>("h3 button");
  await expect.element(title).toHaveAccessibleName("Nodes");
  expect(title?.getAttribute("aria-expanded")).toBe("true");
  expect(nodes.querySelector("h3")?.nextElementSibling?.textContent).toMatch(/^\d+ nodes$/);
  expect(
    toggle(
      nodes.querySelector("[role='group'][aria-label='Filter the nodes by tag']") ?? document,
      "textblock"
    )
  ).toBeDefined();

  // "automatic" says what it means; the arrows reach it from its card, not Tab.
  const automatic = () =>
    card("group-Block")?.querySelector<HTMLElement>("[aria-describedby]") ?? null;
  expect(automatic()?.textContent).toBe("automatic");
  await expect.element(automatic()).toHaveAccessibleDescription(/^Not declared/);
  expect(automatic()?.tabIndex).toBe(-1);
  card("group-Block")?.click();
  await until(() => card("group-Block")?.getAttribute("aria-current") == "true");
  // In forced colours, which drop the ring's box shadow.
  expect(card("group-Block")?.className).toContain("forced-colors:outline-[Highlight]");
  expect(paragraph.className).not.toContain("forced-colors:outline-[Highlight]");
});

it("puts the filter on its own line in a narrow panel", async () => {
  localStorage.setItem(
    "wordgard-devtools:dock",
    JSON.stringify({ side: "right", size: 300, collapsed: false })
  );
  await setup();
  const filter = await until(() =>
    shadow().querySelector<HTMLInputElement>("[aria-label='Filter the types']")
  );
  const marks = await until(() =>
    [...shadow().querySelectorAll("button[aria-pressed]")].find((b) =>
      b.textContent?.endsWith(" marks")
    )
  );
  expect(marks.getBoundingClientRect().top).toBeGreaterThanOrEqual(
    filter.getBoundingClientRect().bottom
  );
});

it("lists the node groups, linked both ways", async () => {
  const paragraph = await setup();
  const textblock = await until(() => card("group-Textblock"));
  expect(textblock.textContent).toContain("Wordgard's");
  expect(textblock.textContent).toMatch(/types.*Paragraph/);
  // The document's content names Content.
  expect(card("group-Content")?.textContent).toMatch(/content of.*Doc/);
  expect(card("group-Block")?.textContent).toContain("automatic");
  // Wordgard assigns Textblock itself.
  expect(textblock.textContent).toContain("automatic");
  // From a node's groups (Textblock not among them) to the group's card.
  expect(
    [...paragraph.querySelectorAll("button")].some((button) => button.textContent == "Textblock")
  ).toBe(false);
  [...paragraph.querySelectorAll<HTMLButtonElement>("button")]
    .find((button) => button.textContent == "Content")
    ?.click();
  await until(() => card("group-Content")?.getAttribute("aria-current") == "true");
  // From a node's tag to its automatic group's card.
  [...paragraph.querySelectorAll<HTMLButtonElement>("button")]
    .find((button) => button.textContent == "textblock")
    ?.click();
  await until(() => card("group-Textblock")?.getAttribute("aria-current") == "true");
  // From the group's card to a node's.
  [...textblock.querySelectorAll<HTMLButtonElement>("button")]
    .find((button) => button.textContent == "Heading")
    ?.click();
  await until(() => card("node-Heading")?.getAttribute("aria-current") == "true");
});

it("moves between the cards with Up and Down, and through a card with Right and Left", async () => {
  const paragraph = await setup();
  const cards = () => [...shadow().querySelectorAll<HTMLElement>("[data-type]")];
  const ids = cards().map((element) => element.getAttribute("data-type") ?? "");
  const active = () => shadow().activeElement;
  const focused = () => active()?.getAttribute("data-type");
  const firstOf = (kind: string) => ids.find((id) => id.startsWith(`${kind}-`));
  // Every card is a tab stop; what's in them isn't.
  expect(cards().every((element) => element.tabIndex == 0)).toBe(true);
  expect(
    [...shadow().querySelectorAll<HTMLElement>("[data-card-item]")].every(
      (item) => item.tabIndex == -1
    )
  ).toBe(true);

  const lastNode = ids.findLastIndex((id) => id.startsWith("node-"));
  cards()[lastNode]?.focus();
  await userEvent.keyboard("{ArrowDown}");
  expect(focused()).toBe(firstOf("mark"));
  await until(() => card(firstOf("mark") ?? "")?.getAttribute("aria-current") == "true");
  await userEvent.keyboard("{End}");
  expect(focused()).toBe(ids.at(-1));
  await userEvent.keyboard("{Home}{ArrowUp}");
  expect(focused()).toBe(ids[0]);

  // Right goes into the card, link by link (the tags naming groups first); Left back out. The
  // card stays selected meanwhile.
  const afterParagraph = ids[ids.indexOf("node-Paragraph") + 1];
  paragraph.focus();
  await userEvent.keyboard("{ArrowRight}");
  expect(active()?.getAttribute("aria-label")).toBe("plot node group");
  await userEvent.keyboard("{ArrowRight}");
  expect(active()?.getAttribute("aria-label")).toBe("block node group");
  expect(paragraph.getAttribute("aria-current")).toBe("true");
  await userEvent.keyboard("{ArrowLeft}{ArrowLeft}");
  expect(active()).toBe(paragraph);
  // From inside a card, Down and Tab both go to the next card.
  await userEvent.keyboard("{ArrowRight}{ArrowDown}");
  expect(focused()).toBe(afterParagraph);
  paragraph.focus();
  await userEvent.keyboard("{ArrowRight}{Tab}");
  expect(focused()).toBe(afterParagraph);
  // A group's "automatic" tag is reached the same way.
  card("group-Block")?.focus();
  await userEvent.keyboard("{ArrowRight}");
  expect(active()?.textContent).toBe("automatic");

  // Enter on a card shows the JSON pane, closed.
  const spec = () => shadow().querySelector<HTMLElement>("[aria-label='Spec']");
  spec()?.querySelector<HTMLButtonElement>("[aria-label='Close the JSON']")?.click();
  await until(() => !spec());
  paragraph.focus();
  await userEvent.keyboard("{Enter}");
  await until(() => spec()?.textContent?.includes("Paragraph"));
});

it("focuses the card a link goes to", async () => {
  await setup();
  [...(card("mark-Strong")?.querySelectorAll("button") ?? [])]
    .find((b) => b.textContent == "Text")
    ?.click();
  await until(() => shadow().activeElement == card("node-Text"));
});

it("closes the JSON on Escape, from a card, the pane or the emptied filter", async () => {
  const paragraph = await setup();
  const spec = () => shadow().querySelector<HTMLElement>("[aria-label='Spec']");
  const showJSON = async () => {
    (
      await until(() => shadow().querySelector<HTMLElement>("[aria-label='Show the JSON']"))
    ).click();
    await until(() => spec());
  };
  if (!spec()) await showJSON();

  // From a card: focus stays on it.
  paragraph.focus();
  await userEvent.keyboard("{Escape}");
  await until(() => !spec());
  expect(shadow().activeElement).toBe(paragraph);

  // From the pane: focus goes to the selected card.
  await showJSON();
  (
    await until(() => spec()?.querySelector<HTMLButtonElement>("[aria-label='Close the JSON']"))
  ).focus();
  // The first Escape closes the button's tooltip, opened on focus.
  await userEvent.keyboard("{Escape}{Escape}");
  await until(() => !spec());
  expect(shadow().activeElement).toBe(paragraph);

  // From the filter: the query first, then the pane.
  await showJSON();
  const filter = await until(() =>
    shadow().querySelector<HTMLInputElement>("[aria-label='Filter the types']")
  );
  await userEvent.click(filter);
  await userEvent.keyboard("para{Escape}");
  expect(filter.value).toBe("");
  expect(spec()).not.toBeNull();
  await userEvent.keyboard("{Escape}");
  await until(() => !spec());
});

it("shows the selected type's spec as JSON beside the list", async () => {
  const paragraph = await setup();
  const spec = () => shadow().querySelector<HTMLElement>("[aria-label='Spec']");
  expect(spec()?.textContent).toContain("Select a node type");
  paragraph.click();
  await until(() => spec()?.textContent?.includes("Paragraphnode"));
  expect(spec()?.querySelector("pre")?.textContent).toContain('"inlineContent": true');
  (await until(() => card("mark-Strong"))).click();
  await until(() => spec()?.textContent?.includes("Strongmark"));
  const logged: unknown[][] = [];
  const log = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logged.push(args);
  });
  spec()
    ?.querySelector<HTMLButtonElement>(`[aria-label="Log the Strong mark type to the console"]`)
    ?.click();
  await until(() => logged.some((args) => args[0] == "[wordgard-devtools] the Strong mark type"));
  log.mockRestore();
  (await until(() => card("group-Textblock"))).click();
  await until(() => spec()?.textContent?.includes("Textblocknode group"));
});

const item = (text: string) =>
  [...shadow().querySelectorAll<HTMLElement>("[role='menuitem']")].find(
    (element) => element.textContent?.trim() == text
  );

const rightClick = (element: HTMLElement) => {
  const rect = element.getBoundingClientRect();
  element.dispatchEvent(
    new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + 4,
      clientY: rect.top + 4,
      button: 2,
    })
  );
};

it("closes the JSON pane, and shows it again on a double click or from a card's menu", async () => {
  const paragraph = await setup();
  const spec = () => shadow().querySelector<HTMLElement>("[aria-label='Spec']");
  (
    await until(() => spec()?.querySelector<HTMLButtonElement>("[aria-label='Close the JSON']"))
  ).click();
  await until(() => !spec());
  paragraph.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  await until(() => spec()?.textContent?.includes("Paragraphnode"));
  spec()?.querySelector<HTMLButtonElement>("[aria-label='Close the JSON']")?.click();
  await until(() => !spec());

  const copied: string[] = [];
  vi.spyOn(navigator.clipboard, "writeText").mockImplementation(async (text) => {
    copied.push(text);
  });
  const logged: unknown[][] = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logged.push(args);
  });
  const strong = await until(() => card("mark-Strong"));
  rightClick(strong);
  (await until(() => item("Show JSON"))).click();
  await until(() => spec()?.textContent?.includes("Strongmark"));
  // The pane is open: no "Show JSON".
  rightClick(strong);
  await until(() => item("Log JSON"));
  expect(item("Show JSON")).toBeUndefined();
  (await until(() => item("Log JSON"))).click();
  await until(() =>
    logged.some((args) => args[0] == "[wordgard-devtools] the Strong mark type's spec")
  );
  rightClick(strong);
  (await until(() => item("Copy JSON"))).click();
  await until(() => copied.some((text) => text.includes('"name": "Strong"')));
  // A group has no live object to log: only its JSON.
  const group = await until(() => card("group-Content"));
  rightClick(group);
  await until(() => item("Log JSON"));
  expect(item("Log to console")).toBeUndefined();
  (await until(() => item("Log JSON"))).click();
  await until(() => logged.some((args) => args[0] == "[wordgard-devtools] the Content node group"));
  vi.restoreAllMocks();
});

it("saves the JSON pane closed, and shows it again from the Nodes bar", async () => {
  await setup();
  const spec = () => shadow().querySelector<HTMLElement>("[aria-label='Spec']");
  const show = () =>
    shadow().querySelector<HTMLButtonElement>(
      "section[aria-label='Nodes'] [aria-label='Show the JSON']"
    );
  expect(show()).toBeNull();
  (
    await until(() => spec()?.querySelector<HTMLButtonElement>("[aria-label='Close the JSON']"))
  ).click();
  await until(() => !spec());
  expect(localStorage.getItem("wordgard-devtools:schema-json")).toBe("false");
  mounted?.unmount();
  wg?.dom.remove();

  await setup();
  expect(spec()).toBeNull();
  (await until(show)).click();
  await until(() => spec());
  expect(show()).toBeNull();
  expect(localStorage.getItem("wordgard-devtools:schema-json")).toBe("true");
});

it("switches a type's JSON between its spec and what applies", async () => {
  const paragraph = await setup();
  const spec = () => shadow().querySelector<HTMLElement>("[aria-label='Spec']");
  const toggle = (name: string) =>
    [...(spec()?.querySelectorAll<HTMLButtonElement>("button[aria-pressed]") ?? [])].find(
      (button) => button.textContent == name
    );
  paragraph.click();
  (await until(() => toggle("Effective"))).click();
  // Not in Paragraph's spec: noted.
  await until(() => spec()?.textContent?.includes('"isolating": false,  // default'));
  expect(spec()?.textContent).toContain("// from the schema");
  const copied: string[] = [];
  vi.spyOn(navigator.clipboard, "writeText").mockImplementation(async (text) => {
    copied.push(text);
  });
  spec()?.querySelector<HTMLButtonElement>("[aria-label='Copy the JSON']")?.click();
  // The values, without the comments.
  await until(() => copied.some((text) => JSON.parse(text).isolating === false));
  // The view stays with the next type; a group has only one.
  (await until(() => card("mark-Strong"))).click();
  await until(() => spec()?.textContent?.includes('"spanning"'));
  (await until(() => card("group-Content"))).click();
  await until(() => spec()?.textContent?.includes("Contentnode group"));
  expect(toggle("Effective")).toBeUndefined();
  vi.restoreAllMocks();
});

it("explains each section from its bar", async () => {
  await setup();
  const popup = () => shadow().querySelector<HTMLElement>("[data-slot='popover-content']");
  const sections = [
    {
      label: "About the nodes",
      text: "Each node type in the schema",
      link: "#doc.Plot.Spec.defining",
    },
    { label: "About the marks", text: "Each mark type", link: "#doc.Mark.Spec.inclusive" },
    {
      label: "About the node groups",
      text: "Groups are used to specify parent-child relationships between nodes",
      link: "#doc.Node.Group.Textblock",
    },
  ];
  for (const { label, text, link } of sections) {
    (
      await until(() => shadow().querySelector<HTMLButtonElement>(`[aria-label='${label}']`))
    ).click();
    await until(() => popup()?.textContent?.includes(text));
    // Terms link to their entry in Wordgard's reference.
    expect(popup()?.querySelector(`a[href$='${link}']`)).not.toBeNull();
    await userEvent.keyboard("{Escape}");
    await until(() => !popup());
  }
});

it("explains spec and effective, for a node type or a mark type, and not for a group", async () => {
  const paragraph = await setup();
  const spec = () => shadow().querySelector<HTMLElement>("[aria-label='Spec']");
  const guide = () =>
    spec()?.querySelector<HTMLButtonElement>("[aria-label='About spec and effective']");
  const popup = () => shadow().querySelector<HTMLElement>("[data-slot='popover-content']");
  paragraph.click();
  (await until(() => guide())).click();
  await until(() => popup()?.textContent?.includes("Spec is the node type as defined"));
  await userEvent.keyboard("{Escape}");
  await until(() => !popup());
  (await until(() => card("mark-Strong"))).click();
  (await until(() => guide())).click();
  await until(() => popup()?.textContent?.includes("Spec is the mark type as defined"));
  await userEvent.keyboard("{Escape}");
  await until(() => !popup());
  (await until(() => card("group-Content"))).click();
  await until(() => spec()?.textContent?.includes("Contentnode group"));
  expect(guide()).toBeNull();
});

it("flags a type an override changes: an amber switch and a note", async () => {
  // A type of this file's (here, wordgard/types can be another copy than basicSchema's), and a group
  // Wordgard names (one only an override mentions isn't seen).
  wg = Wordgard.create({
    parent: document.body,
    doc: "<p>Hi</p>",
    config: [
      basicSchema(),
      GardState.schemaElement.of([
        Callout,
        Schema.Override.nodeGroup(Callout, [Node.Group.Content, Node.Group.ListItem]),
      ]),
      wordgardDevtools({ name: "s" }),
    ],
  });
  mounted = mountDevtools();
  await mounted.ready;
  (await until(() => tab("Schema"))).click();
  const spec = () => shadow().querySelector<HTMLElement>("[aria-label='Spec']");
  const note = () => spec()?.querySelector<HTMLElement>("[role='note']");
  const effectiveButton = () =>
    [...(spec()?.querySelectorAll<HTMLButtonElement>("button[aria-pressed]") ?? [])].find(
      (button) => button.textContent == "Effective"
    );
  (await until(() => card("node-Callout"))).click();
  await until(() => note()?.textContent?.includes("An override changes what applies: group"));
  expect(effectiveButton()?.className).toContain("amber");
  [...(note()?.querySelectorAll("button") ?? [])]
    .find((button) => button.textContent == "See the effective view")
    ?.click();
  await until(() => note()?.textContent?.includes("Highlighted"));
  expect(effectiveButton()?.getAttribute("aria-pressed")).toBe("true");
  // A type no override touches: neither.
  (await until(() => card("node-Heading"))).click();
  await until(() => spec()?.textContent?.includes("Headingnode"));
  expect(note()).toBeNull();
  expect(effectiveButton()?.className).not.toContain("amber");
});

it("saves the filters, and reads them back, leaving out tags this schema doesn't have", async () => {
  await setup();
  const nodes = await until(() => section("Nodes"));
  toggle(nodes, "textblock")?.click();
  toggle(shadow(), "3 marks")?.click();
  await until(() => !card("node-Text") && !card("mark-Strong"));
  expect(JSON.parse(localStorage.getItem("wordgard-devtools:schema-filters") ?? "null")).toEqual({
    query: "",
    open: { node: true, mark: false, group: true },
    nodes: ["textblock"],
    marks: [],
    groups: [],
  });
  mounted?.unmount();
  wg?.dom.remove();

  localStorage.setItem(
    "wordgard-devtools:schema-filters",
    JSON.stringify({
      query: "Para",
      open: { node: true },
      nodes: ["textblock", "no-such-tag"],
      marks: [],
      groups: [],
    })
  );
  await setup();
  await until(() => card("node-Paragraph") && !card("node-Heading"));
  expect(toggle(section("Nodes") ?? shadow(), "textblock")?.getAttribute("aria-pressed")).toBe(
    "true"
  );
  expect(shadow().querySelector<HTMLInputElement>("[aria-label='Filter the types']")?.value).toBe(
    "Para"
  );
  [...shadow().querySelectorAll<HTMLButtonElement>("button")]
    .find((b) => b.textContent == "Clear filters")
    ?.click();
  await until(() => card("node-Heading") && card("node-Text"));
  expect(
    JSON.parse(localStorage.getItem("wordgard-devtools:schema-filters") ?? "null")?.nodes
  ).toEqual([]);
});
