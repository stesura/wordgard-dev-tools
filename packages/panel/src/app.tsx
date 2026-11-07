// Loaded by mountDevtools() on demand: React and the styles stay out of the page until then.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Dock } from "./panel/dock.tsx";
import { createDockLayout } from "./panel/dock-layout.ts";
import { createPanelStore } from "#stores/panel-store.ts";
import css from "./styles.css?inline";
import { shadowPropertiesRule } from "#lib/shadow-properties.ts";
import { createThemeStore } from "#stores/theme.ts";
import type { Transport } from "./transport.ts";

const adoptStyles = (shadow: ShadowRoot) => {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  const properties = shadowPropertiesRule(sheet);
  if (properties) sheet.insertRule(properties, sheet.cssRules.length);
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
  const layout = createDockLayout();
  setActive(!layout.get().collapsed);
  const root = createRoot(container);
  root.render(
    <StrictMode>
      <Dock store={store} theme={theme} layout={layout} setActive={setActive} />
    </StrictMode>
  );
  return () => {
    root.unmount();
    setActive(false);
    container.remove();
  };
};
