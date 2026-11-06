import { cn } from "cn";
import { hue, markColour, type ColourKind } from "./colours.ts";
import { Tip } from "./tip.tsx";

/** A node or mark type as a badge in its Schema colour, a link to its card there. */
export const TypeLink = ({
  kind,
  name,
  onShow,
}: {
  kind: ColourKind;
  name: string;
  onShow: (kind: ColourKind, name: string) => void;
}) => (
  <Tip label={`Show the ${name} ${kind} type in the Schema`}>
    <button
      type="button"
      className={cn("h-4 cursor-pointer rounded px-1 leading-4 hover:underline", markColour)}
      style={hue(kind, name)}
      onClick={() => onShow(kind, name)}
    >
      {name}
    </button>
  </Tip>
);
