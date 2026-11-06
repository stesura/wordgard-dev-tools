import type { ComponentProps } from "react";
import { Tip } from "./tip.tsx";
import { Button } from "./ui/button.tsx";

/** An icon button with its label as tooltip and accessible name. `pressed`: a toggle's state. */
export const IconButton = ({
  label,
  pressed,
  side,
  ...props
}: Omit<ComponentProps<typeof Button>, "aria-label"> & {
  label: string;
  pressed?: boolean;
  side?: "top" | "bottom";
}) => (
  <Tip label={label} side={side}>
    <Button
      variant={pressed ? "secondary" : "ghost"}
      size="icon-xs"
      aria-label={label}
      aria-pressed={pressed}
      {...props}
    />
  </Tip>
);
