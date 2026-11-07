/**
 * Each line of a flattened tree (its lines in display order, each with its depth) with its
 * position among its siblings and their number: `aria-posinset` and `aria-setsize`, which a
 * virtualized tree must give (not every item is in the DOM).
 */
export const withSiblings = <L extends { depth: number }>(lines: readonly L[]) => {
  const out = lines.map((line) => ({ ...line, position: 1, siblings: 1 }));
  // Per depth, the lines of the sibling group still open.
  const groups: number[][] = [];
  const close = (group: number[] | undefined) =>
    group?.forEach((index, at) => {
      const line = out[index];
      if (line) Object.assign(line, { position: at + 1, siblings: group.length });
    });
  for (const [index, { depth }] of lines.entries()) {
    // A shallower line ends the groups below it.
    while (groups.length > depth + 1) close(groups.pop());
    while (groups.length < depth + 1) groups.push([]);
    groups[depth]?.push(index);
  }
  while (groups.length) close(groups.pop());
  return out;
};
