/** Scrolls an item into the structure's scroller, not the page around an in-page dock. */
/** `inset`: what covers the container's top (a sticky heading). */
export const scrollInto = (container: HTMLElement, element: Element, inset = 0) => {
  const top =
    element.getBoundingClientRect().top -
    container.getBoundingClientRect().top +
    container.scrollTop;
  if (
    top < container.scrollTop + inset ||
    top > container.scrollTop + container.clientHeight - 24
  ) {
    container.scrollTop = top - inset - 8;
  }
};

/** Scrolls a virtualized list's row to the middle, when it's out of view. After a frame: the rows opened to it render first. */
export const centreRow = (scroller: HTMLElement | null, position: number, height: number) =>
  requestAnimationFrame(() => {
    if (!scroller || position < 0) return;
    const top = position * height;
    if (top >= scroller.scrollTop && top + height <= scroller.scrollTop + scroller.clientHeight)
      return;
    scroller.scrollTop = Math.max(0, top - (scroller.clientHeight - height) / 2);
  });
