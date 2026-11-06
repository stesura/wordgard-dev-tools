import type { ComponentProps } from "react";
import { Toggle } from "./ui/toggle.tsx";

/** A filter in a row of filters: muted, primary while pressed. */
export const FilterChip = (props: ComponentProps<typeof Toggle>) => (
  <Toggle variant="chip" size="chip" {...props} />
);
