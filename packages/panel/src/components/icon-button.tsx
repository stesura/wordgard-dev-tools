import type { ReactNode } from "react";
import { Button } from "./ui/button.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip.tsx";

export const IconButton = ({
  label,
  onClick,
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  /** A toggle's state. */
  pressed?: boolean;
  children: ReactNode;
}) => (
  <Tooltip>
    <TooltipTrigger
      render={
        <Button
          variant={pressed ? "secondary" : "ghost"}
          size="icon-xs"
          aria-label={label}
          aria-pressed={pressed}
          onClick={onClick}
        />
      }
    >
      {children}
    </TooltipTrigger>
    <TooltipContent side="top">{label}</TooltipContent>
  </Tooltip>
);
