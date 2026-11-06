// Loaded by mountDevtools() on demand: React and the styles stay out of the page until then.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Dock, readLayout } from "./panel/dock.tsx";
import { createPanelStore } from "#stores/panel-store.ts";
import css from "./styles.css?inline";
import { createThemeStore } from "#stores/theme.ts";
import type { Transport } from "./transport.ts";

const adoptStyles = (shadow: ShadowRoot) => {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  // Browsers ignore @property in shadow trees, and Tailwind relies on it for its --tw-*
  // defaults (shadows, rings, transforms): restate the initial values as plain declarations.
  const initial = [...sheet.cssRules].flatMap((rule) =>
    rule instanceof CSSPropertyRule && rule.initialValue != null
      ? [`${rule.name}: ${rule.initialValue}`]
      : []
  );
  if (initial.length) {
    sheet.insertRule(
      `@layer properties { *, ::before, ::after, ::backdrop { ${initial.join("; ")} } }`,
      sheet.cssRules.length
    );
  }
  shadow.adoptedStyleSheets = [sheet];
};

export const renderDock = (shadow: ShadowRoot, transport: Transport) => {
  adoptStyles(shadow);
  const container = document.createElement("div");
  shadow.append(container);
  const store = createPanelStore(transport);
  const theme = createThemeStore();
  let stop: (() => void) | null = null;
  const setActive = (active: boolean) => {
    if (active && !stop) stop = store.start();
    else if (!active && stop) {
      stop();
      stop = null;
    }
  };
  const initial = readLayout();
  setActive(!initial.collapsed);
  const root = createRoot(container);
  root.render(
    <StrictMode>
      <Dock store={store} theme={theme} initial={initial} setActive={setActive} />
    </StrictMode>
  );
  return () => {
    root.unmount();
    setActive(false);
    container.remove();
  };
};
