// Browsers ignore @property in shadow trees, and Tailwind relies on it for its --tw-* defaults
// (shadows, rings, transforms): restated as plain declarations, typed values lose their type.

/** A registered initial value as a plain declaration says it. */
const initialValue = (rule: CSSPropertyRule) => {
  const value = rule.initialValue;
  // A production build (Tailwind's) writes a <length>'s `0px` as `0`: unregistered, that's a number, and a ring's
  // `calc(1px + var(--tw-ring-offset-width))` is invalid, which drops the whole box-shadow.
  return value != null && rule.syntax.includes("<length") && value.trim() == "0" ? "0px" : value;
};

/**
 * Rules giving the shadow tree the sheet's registered initial values: a property that inherits on
 * the host (on every element, it would reset what a parent sets), the others on every element.
 * Null when there are none.
 */
export const shadowPropertiesRule = (sheet: CSSStyleSheet) => {
  const declarations = (inherits: boolean) =>
    [...sheet.cssRules].flatMap((rule) => {
      if (!(rule instanceof CSSPropertyRule) || rule.inherits != inherits) return [];
      const value = initialValue(rule);
      return value == null ? [] : [`${rule.name}: ${value}`];
    });
  const own = declarations(false);
  const inherited = declarations(true);
  if (!own.length && !inherited.length) return null;
  const host = inherited.length ? `:host { ${inherited.join("; ")} }` : "";
  const every = own.length ? `*, ::before, ::after, ::backdrop { ${own.join("; ")} }` : "";
  return `@layer properties { ${host} ${every} }`;
};
