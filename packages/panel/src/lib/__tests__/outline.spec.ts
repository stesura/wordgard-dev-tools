import { expect, it } from "vitest";
import type { Transport } from "../../transport.ts";
import { createOutline } from "../outline.ts";

const fakeTransport = () => {
  const sent: unknown[] = [];
  const transport: Transport = {
    send: (request) => {
      sent.push(request);
      return Promise.reject(new Error("no page"));
    },
    onPush: () => () => {},
  };
  return { transport, sent };
};

it("hides only an outline it drew", () => {
  const { transport, sent } = fakeTransport();
  const outline = createOutline(transport, 3);
  outline.hide();
  expect(sent).toEqual([]);
  outline.show([1, 0]);
  outline.hide();
  outline.hide();
  expect(sent).toEqual([
    { type: "highlight", id: 3, path: [1, 0] },
    { type: "highlight", id: 3, path: null },
  ]);
});
