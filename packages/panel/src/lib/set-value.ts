import { isRecord } from "./json.ts";

/** A Wordgard point or range set as the page sends it (`toSafe`): its entries, then the rest's count. */
export type SetValue = {
  kind: "point" | "range";
  /** A point has `from == to` and a side. */
  entries: { from: number; to: number; side: number | null; value: unknown }[];
  /** Entries not sent: at least that many when `exact` is false. */
  more: number;
  exact: boolean;
};

/** The serialised set in a value, or null for anything else. */
export const readSet = (value: unknown): SetValue | null => {
  if (!isRecord(value)) return null;
  const points = value["[PointSet]"];
  const ranges = value["[RangeSet]"];
  const kind = Array.isArray(points) ? "point" : Array.isArray(ranges) ? "range" : null;
  const list = Array.isArray(points) ? points : Array.isArray(ranges) ? ranges : [];
  if (!kind) return null;
  // Points as [pos, side, value], ranges as [from, to, value].
  const entries = list.flatMap((item: unknown) => {
    if (!Array.isArray(item)) return [];
    const [first, second, entry] = item;
    if (typeof first != "number") return [];
    if (kind == "point")
      return [
        { from: first, to: first, side: typeof second == "number" ? second : null, value: entry },
      ];
    return typeof second == "number" ? [{ from: first, to: second, side: null, value: entry }] : [];
  });
  return {
    kind,
    entries,
    more: typeof value.more == "number" ? value.more : 0,
    exact: value.exact !== false,
  };
};

/** Where an entry sits: "3–5", or "4" with the side a point leans to. */
export const placeOf = ({ from, to, side }: { from: number; to: number; side: number | null }) =>
  side == null ? `${from}–${to}` : `${from}${side < 0 ? " (before)" : side > 0 ? " (after)" : ""}`;
