import type { GardState } from "wordgard/state";
import * as wordgardState from "wordgard/state";

// Wordgard's private extension classes (`PrecExtension`, `CompartmentInstance`, `FacetProvider`)
// and fields it marks internal, read by shape: each read guarded, an unknown shape reads as null.
// Listed under the main plan's open question 3.

const isObject = (value: unknown): value is object => typeof value == "object" && value != null;

const isFacet = (value: unknown): value is GardState.Facet<unknown, unknown> =>
  typeof wordgardState.GardState?.Facet == "function" &&
  value instanceof wordgardState.GardState.Facet;

/** `prec.high(ext)` and the like: its content and precedence (0 highest, 4 lowest). */
export const precedenceOf = (ext: unknown) =>
  isObject(ext) &&
  "inner" in ext &&
  "prec" in ext &&
  typeof ext.prec == "number" &&
  !("compartment" in ext)
    ? { inner: ext.inner, prec: ext.prec }
    : null;

/** `compartment.of(ext)`: its compartment and the content it was created with. */
export const compartmentOf = (ext: unknown) =>
  isObject(ext) &&
  "compartment" in ext &&
  "inner" in ext &&
  typeof wordgardState.GardState?.Compartment == "function" &&
  ext.compartment instanceof wordgardState.GardState.Compartment
    ? { compartment: ext.compartment, inner: ext.inner }
    : null;

/** `facet.of(value)`, `facet.compute(…)` and the like: its facet; a static one's value. */
export const providerOf = (ext: unknown) => {
  if (!isObject(ext) || !("facet" in ext) || !isFacet(ext.facet) || !("flags" in ext)) return null;
  // ProviderFlag.Static: `facet.of(null)` is static too, so not `value != null`.
  const isStatic = typeof ext.flags == "number" && (ext.flags & 1) == 1;
  return {
    facet: ext.facet,
    isStatic,
    value: isStatic && "value" in ext ? ext.value : undefined,
  };
};

/** What a facet enables (`enables` in its spec), walked at default precedence. */
export const facetExtensions = (facet: unknown): unknown =>
  isObject(facet) && "extensions" in facet ? facet.extensions : undefined;

export const isField = (ext: unknown): ext is GardState.Field<unknown> =>
  typeof wordgardState.GardState?.Field == "function" &&
  ext instanceof wordgardState.GardState.Field;

export const isDerived = (ext: unknown): ext is GardState.Field.Derived<unknown> =>
  typeof wordgardState.GardState?.Field?.Derived == "function" &&
  ext instanceof wordgardState.GardState.Field.Derived;

/** What a field provides (`provide` in its spec): internal in Wordgard's typings. */
export const fieldProvides = (field: GardState.Field<unknown>): unknown =>
  "provides" in field ? field.provides : undefined;
