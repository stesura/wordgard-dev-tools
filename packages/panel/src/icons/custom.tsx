// Drawn for the panel in the style of Heroicons' 16px set, where it has no equivalent.
import { icon, stroked } from "./icon.tsx";

// The dock sides: a window, the docked side filled.
const frame = "M4 3h8a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z";
const dock = (hole: string) =>
  icon(<path fillRule="evenodd" d={frame + hole} clipRule="evenodd" />);

export const DockBottomIcon = dock("M4 4.5h8a.5.5 0 0 1 .5.5v3.5h-9V5a.5.5 0 0 1 .5-.5Z");
export const DockTopIcon = dock("M3.5 7.5h9V11a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5V7.5Z");
export const DockLeftIcon = dock("M7.5 4.5H12a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-.5.5H7.5v-7Z");
export const DockRightIcon = dock("M4 4.5h4.5v7H4a.5.5 0 0 1-.5-.5V5a.5.5 0 0 1 .5-.5Z");

export const RecordIcon = icon(<circle cx="8" cy="8" r="4.5" />);

// Heroicons' chevron-up-down, its two chevrons swapped to point in: collapse, to its expand.
const chevronDown =
  "M5.22 10.22a.75.75 0 0 1 1.06 0L8 11.94l1.72-1.72a.75.75 0 1 1 1.06 1.06l-2.25 2.25a.75.75 0 0 1-1.06 0l-2.25-2.25a.75.75 0 0 1 0-1.06Z";
const chevronUp =
  "M10.78 5.78a.75.75 0 0 1-1.06 0L8 4.06 6.28 5.78a.75.75 0 0 1-1.06-1.06l2.25-2.25a.75.75 0 0 1 1.06 0l2.25 2.25a.75.75 0 0 1 0 1.06Z";
export const ChevronDownUpIcon = icon(
  <>
    <path fillRule="evenodd" d={chevronDown} clipRule="evenodd" transform="translate(0 -8)" />
    <path fillRule="evenodd" d={chevronUp} clipRule="evenodd" transform="translate(0 8)" />
  </>
);

export const TextCursorIcon = icon(
  <path d="M8 3.75v8.5M5.75 2.75H7a1 1 0 0 1 1 1 1 1 0 0 1 1-1h1.25M5.75 13.25H7a1 1 0 0 0 1-1 1 1 0 0 0 1 1h1.25" />,
  stroked
);

/** An arrow into a bar: where a selection starts. */
export const SelectionStartIcon = icon(
  <path d="M12.75 3.5v9M3 8h7M7.25 5.25 10 8l-2.75 2.75" />,
  stroked
);

export const SelectionEndIcon = icon(
  <path d="M3.25 3.5v9M13 8H6M8.75 5.25 6 8l2.75 2.75" />,
  stroked
);

/** A dashed square: a node selection. */
export const NodeSelectionIcon = icon(
  <path d="M2.75 5V4c0-.69.56-1.25 1.25-1.25h1M11 2.75h1c.69 0 1.25.56 1.25 1.25v1M13.25 11v1c0 .69-.56 1.25-1.25 1.25h-1M5 13.25H4c-.69 0-1.25-.56-1.25-1.25v-1M7 2.75h2M13.25 7v2M7 13.25h2M2.75 7v2" />,
  stroked
);
