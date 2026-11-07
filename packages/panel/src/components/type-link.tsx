import { cn } from "cn";
import { hue, markColour, type ColourKind } from "#lib/colours.ts";
import { Tip } from "./tip.tsx";

/** A 24px high target (WCAG 2.5.8) from a pseudo-element, the element's height unchanged; 24px wide at least. */
const TARGET_24 =
  "relative min-w-6 before:absolute before:inset-x-0 before:-inset-y-1 before:content-['']";

/**
 * A node or mark type as a badge in its Schema colour, a link to its card there. `target24`: its
 * target grows to 24px high where nothing sits within 4px above or below it.
 */
export const TypeLink = ({
  kind,
  name,
  onShow,
  target24 = false,
}: {
  kind: ColourKind;
  name: string;
  onShow: (kind: ColourKind, name: string) => void;
  target24?: boolean;
}) => (
  <Tip label={`Show the ${name} ${kind} type in the Schema`}>
    <button
      type="button"
      className={cn(
        "h-4 cursor-pointer rounded px-1 leading-4 hover:underline",
        markColour,
        target24 && TARGET_24
      )}
      style={hue(kind, name)}
      onClick={() => onShow(kind, name)}
    >
      {name}
    </button>
  </Tip>
);
