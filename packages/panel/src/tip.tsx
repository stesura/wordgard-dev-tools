import type { ReactElement, ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "#components/ui/tooltip";

/** shadcn's tooltip on an element (in place of a `title`). The element takes the trigger's props and ref. */
export const Tip = ({
  label,
  children,
  side = "top",
}: {
  label: ReactNode;
  children: ReactElement;
  side?: "top" | "bottom";
}) => (
  <Tooltip>
    <TooltipTrigger render={children} />
    <TooltipContent side={side}>{label}</TooltipContent>
  </Tooltip>
);
