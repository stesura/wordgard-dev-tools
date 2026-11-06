import { ChevronDownUpIcon, ChevronUpDownIcon } from "#icons";
import { IconButton } from "./icon-button.tsx";

/** A tree's toolbar buttons: open everything, or close everything but the root. */
export const ExpandCollapse = ({
  onExpand,
  onCollapse,
}: {
  onExpand: () => void;
  onCollapse: () => void;
}) => (
  <>
    <IconButton label="Expand all" onClick={onExpand}>
      <ChevronUpDownIcon />
    </IconButton>
    <IconButton label="Collapse all" onClick={onCollapse}>
      <ChevronDownUpIcon />
    </IconButton>
  </>
);
