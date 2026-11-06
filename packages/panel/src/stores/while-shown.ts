import type { Tab } from "../tabs/tabs.ts";
import type { Change, PanelStore } from "./panel-store.ts";

/**
 * A tab loads only while it's shown: on showing, when `on` changed meanwhile (or never loaded), and
 * on each `on` change while shown. For a tab's ref callback; returns the cleanup.
 * - `onHide`: another tab was shown (the page's outline goes, say).
 * - `onReveal`: a reveal may be waiting for this tab (`store.takeReveal` and the like); called
 *   while shown, on mount and on each reveal.
 * - `reconnect`: an editor list change may be this editor reconnecting under the same id, its
 *   data gone: load again on showing.
 */
export const whileShown = (
  store: PanelStore,
  options: {
    tab: Tab;
    editorId: number;
    on: Change;
    load: () => void;
    onHide?: () => void;
    onReveal?: () => void;
    reconnect?: boolean;
  }
) => {
  const { tab, editorId, on, load, onHide, onReveal, reconnect } = options;
  const shown = () => store.state.get().tab == tab;
  let stale = true;
  const refresh = () => {
    stale = false;
    load();
  };
  const stopChange = store.on(on, (id) => {
    if (id != editorId) return;
    if (shown()) refresh();
    else stale = true;
  });
  let editors = store.state.get().editors;
  const stopStore = store.state.listen(({ editors: now }) => {
    if (reconnect && now != editors) stale = true;
    editors = now;
    if (!shown()) onHide?.();
    else if (stale) refresh();
  });
  const takeReveal = () => {
    if (shown()) onReveal?.();
  };
  const stopReveal = onReveal ? store.onReveal(takeReveal) : () => {};
  if (shown()) refresh();
  takeReveal();
  return () => {
    stopChange();
    stopStore();
    stopReveal();
  };
};
