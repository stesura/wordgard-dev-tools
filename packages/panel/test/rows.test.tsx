import { useState } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { keepRowInView, useRows } from "../src/hooks/use-rows.ts";

const ROW = 20;
let root: Root | null = null;
let host: HTMLElement | null = null;

afterEach(() => {
  root?.unmount();
  root = null;
  host?.remove();
  host = null;
});

const until = async <T,>(get: () => T | null | undefined | false, timeout = 2000): Promise<T> => {
  const start = performance.now();
  for (;;) {
    const value = get();
    if (value) return value;
    if (performance.now() - start > timeout) throw new Error("Timed out");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

// A 100 px scroller over `count` rows of 20 px, below a header row when `margin` is set.
const List = ({ count, margin }: { count: number; margin: number }) => {
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const { indices, height } = useRows(scroller, count, ROW, { margin });
  return (
    <div ref={setScroller} data-scroller style={{ height: 100, overflow: "auto" }}>
      {margin > 0 && <div style={{ height: margin }} />}
      <div data-rows style={{ height, position: "relative" }}>
        {indices.map((index) => (
          <div
            key={index}
            data-row={index}
            style={{ position: "absolute", top: index * ROW, height: ROW }}
          />
        ))}
      </div>
    </div>
  );
};

const render = (count: number, margin = 0) => {
  if (!host) {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  }
  root?.render(<List count={count} margin={margin} />);
};

const scroller = () => host?.querySelector<HTMLElement>("[data-scroller]") ?? null;
const drawn = () =>
  [...(host?.querySelectorAll("[data-row]") ?? [])].map((row) =>
    Number(row.getAttribute("data-row"))
  );
const range = () => {
  const rows = drawn();
  return rows.length ? [rows[0], rows[rows.length - 1]] : null;
};

it("draws the rows in view and 20 more either side, following the scroll", async () => {
  render(1000);
  // 5 rows fit, one more for a partial row, and 20 after.
  await until(() => range()?.[1] == 25);
  expect(range()).toEqual([0, 25]);
  expect(host?.querySelector<HTMLElement>("[data-rows]")?.style.height).toBe("20000px");

  const element = await until(scroller);
  element.scrollTop = 200 * ROW;
  await until(() => range()?.[0] == 180);
  expect(range()).toEqual([180, 225]);
});

it("draws what's left when the list shrinks below the scroll", async () => {
  render(1000);
  const element = await until(scroller);
  element.scrollTop = 500 * ROW;
  await until(() => range()?.[0] == 480);
  // Checked before the browser clamps the scroll and fires `scroll`: the rows come from the clamp.
  flushSync(() => render(10));
  expect(range()).toEqual([0, 9]);
});

it("draws more rows when the scroller grows", async () => {
  render(1000);
  await until(() => range()?.[1] == 25);
  const element = await until(scroller);
  // 15 rows fit now.
  element.style.height = "300px";
  await until(() => range()?.[1] == 35);
  expect(range()).toEqual([0, 35]);
});

it("counts the rows from below a header", async () => {
  render(1000, ROW);
  const element = await until(scroller);
  // The header scrolled away and 30 rows more: row 30 is the first in view.
  element.scrollTop = ROW + 30 * ROW;
  await until(() => range()?.[0] == 10);
  expect(range()).toEqual([10, 55]);
});

it("scrolls the least that brings a row into view", async () => {
  render(1000);
  const element = await until(scroller);
  keepRowInView(element, 50, ROW);
  // Row 50's bottom at the scroller's bottom.
  expect(element.scrollTop).toBe(50 * ROW + ROW - 100);
  keepRowInView(element, 48, ROW);
  expect(element.scrollTop).toBe(50 * ROW + ROW - 100);
  keepRowInView(element, 10, ROW);
  expect(element.scrollTop).toBe(10 * ROW);
  // With room for two rows: a header covers one.
  keepRowInView(element, 40, ROW, 2);
  expect(element.scrollTop).toBe(40 * ROW + 2 * ROW - 100);
  keepRowInView(element, -1, ROW);
  expect(element.scrollTop).toBe(40 * ROW + 2 * ROW - 100);
});
