/** The set with `value` added, or removed if it was there. */
export const toggled = <T>(set: ReadonlySet<T>, value: T): ReadonlySet<T> => {
  const next = new Set(set);
  if (!next.delete(value)) next.add(value);
  return next;
};
