import { createContext, useContext } from "react";
import type { WritableAtom } from "nanostores";
import { asJSON, persistent } from "#stores/persistent.ts";
import { isRecord } from "#lib/json.ts";
import type { Orientation, Sizes, SplitKind } from "./split-pane.tsx";

/**
 * What the panel saves for all its tabs and editors. One per mounted panel, read as it mounts, and
 * given to its components through `PanelSettingsContext`.
 */
export type PanelSettings = {
  /** Whether the guides' ? buttons show (the Settings menu): on by default. */
  guidesShown: WritableAtom<boolean>;
  /** A kind of split's pane sizes: shared by every tab and editor, so a pane keeps its size. */
  paneSizes: (kind: SplitKind) => WritableAtom<Sizes>;
};

const readSizes = (json: unknown, defaults: Sizes): Sizes => {
  const size = (orientation: Orientation) => {
    const value = isRecord(json) ? json[orientation] : null;
    return typeof value == "number" ? value : defaults[orientation];
  };
  return { horizontal: size("horizontal"), vertical: size("vertical") };
};

export const createPanelSettings = (): PanelSettings => {
  const panes = new Map<string, WritableAtom<Sizes>>();
  return {
    guidesShown: persistent(
      "wordgard-devtools:guides",
      true,
      asJSON((json) => json !== false)
    ),
    paneSizes: (kind) => {
      let sizes = panes.get(kind.key);
      if (!sizes) {
        sizes = persistent(
          kind.key,
          kind.defaults,
          asJSON((json) => readSizes(json, kind.defaults))
        );
        panes.set(kind.key, sizes);
      }
      return sizes;
    },
  };
};

export const PanelSettingsContext = createContext<PanelSettings | null>(null);

export const usePanelSettings = () => {
  const settings = useContext(PanelSettingsContext);
  if (!settings) throw new Error("No PanelSettingsContext: render this inside the panel");
  return settings;
};
