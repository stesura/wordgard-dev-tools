/**
 * The text selected in `view`, when the selection reaches into it: what our menus' "Copy" copies,
 * in place of the browser's. Read as the menu opens, before it takes focus.
 */
export const selectedText = (view: Element): string | null => {
  const selection = document.getSelection();
  // Rendered text, line breaks between rows (in a shadow root too: Chromium and Firefox).
  const text = selection?.toString();
  if (!selection || !text) return null;
  const root = view.getRootNode();
  // The composed ranges reach into a shadow root; `getRangeAt` stops at its host.
  const ranges: AbstractRange[] =
    typeof selection.getComposedRanges == "function"
      ? selection.getComposedRanges({ shadowRoots: root instanceof ShadowRoot ? [root] : [] })
      : selection.rangeCount
        ? [selection.getRangeAt(0)]
        : [];
  const reaches = ranges.some((at) => {
    const range = document.createRange();
    range.setStart(at.startContainer, at.startOffset);
    range.setEnd(at.endContainer, at.endOffset);
    return range.intersectsNode(view);
  });
  return reaches ? text : null;
};
