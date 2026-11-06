import type { ViewInfo } from "@stesura/wordgard-dev-tools";
import { Tip } from "#components/tip";

const flag = (on: boolean) => (on ? "yes" : "no");

export const Status = ({ status }: { status: ViewInfo["status"] }) => {
  const items: [label: string, value: string, tip: string][] = [
    [
      "root",
      status.root,
      "Where the editor lives: in the page's document, or inside a shadow root.",
    ],
    [
      "connected",
      flag(status.connected),
      "Attached to the page and drawing. When not, document changes aren't drawn.",
    ],
    ["editable", flag(status.editable), "The user can type in it. No: it's read-only."],
    [
      "focusable",
      flag(status.focusable),
      "It can take keyboard focus: it's editable, or read-only with a tabindex.",
    ],
    [
      "focused",
      flag(status.focused),
      "It has keyboard focus now. Clicking in the in-page panel takes focus from it.",
    ],
    [
      "IME",
      status.composing
        ? status.compositionStarted
          ? "composing, text changed"
          : "composing"
        : "no",
      "Typing through an input method (IME), as for Chinese or Japanese, or on some Android keyboards.",
    ],
  ];
  return (
    <dl
      aria-label="View status"
      className="flex shrink-0 flex-wrap gap-x-3 gap-y-0.5 border-b px-2 py-1 text-xs"
    >
      {items.map(([label, value, tip]) => (
        <div key={label} className="flex gap-1">
          <Tip label={<span className="block max-w-64">{tip}</span>}>
            <dt className="cursor-help text-muted-foreground underline decoration-dotted underline-offset-2">
              {label}:
            </dt>
          </Tip>
          <dd className="font-mono">{value}</dd>
        </div>
      ))}
    </dl>
  );
};
