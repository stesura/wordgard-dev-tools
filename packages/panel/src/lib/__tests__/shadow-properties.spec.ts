import { afterEach, expect, it } from "vitest";
import { shadowPropertiesRule } from "../shadow-properties.ts";

let host: HTMLElement | null = null;
afterEach(() => {
  host?.remove();
  host = null;
});

// As the published build minifies Tailwind's output: `0px` written `0`.
const minified = `
@property --tw-ring-offset-width{syntax:"<length>";inherits:false;initial-value:0}
@property --tw-ring-shadow{syntax:"*";inherits:false;initial-value:0 0 #0000}
@property --tw-shadow-alpha{syntax:"<percentage>";inherits:false;initial-value:100%}
@property --tw-ring-color{syntax:"*";inherits:false}
.ring-1{--tw-ring-shadow:0 0 0 calc(1px + var(--tw-ring-offset-width)) red;box-shadow:var(--tw-ring-shadow)}
`;

it("restates registered initial values, a unitless <length> zero as 0px", () => {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(minified);
  const rule = shadowPropertiesRule(sheet);
  expect(rule).toContain("--tw-ring-offset-width: 0px");
  expect(rule).toContain("--tw-ring-shadow: 0 0 #0000");
  expect(rule).toContain("--tw-shadow-alpha: 100%");
  expect(rule).not.toContain("--tw-ring-color");

  // In a shadow root, where @property is ignored, a ring draws.
  host = document.createElement("div");
  document.body.append(host);
  const shadow = host.attachShadow({ mode: "open" });
  if (rule) sheet.insertRule(rule, sheet.cssRules.length);
  shadow.adoptedStyleSheets = [sheet];
  const ring = document.createElement("div");
  ring.className = "ring-1";
  shadow.append(ring);
  expect(getComputedStyle(ring).boxShadow).not.toBe("none");
});

it("has nothing to restate without registered properties", () => {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(".a{color:red}");
  expect(shadowPropertiesRule(sheet)).toBeNull();
});

it("gives an inherited property its default on the host, so a parent's value reaches its children", () => {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(`
@property --angle{syntax:"<angle>";inherits:true;initial-value:20deg}
.parent{--angle:45deg}
`);
  const rule = shadowPropertiesRule(sheet);
  expect(rule).toContain(":host { --angle: 20deg }");
  host = document.createElement("div");
  document.body.append(host);
  const shadow = host.attachShadow({ mode: "open" });
  if (rule) sheet.insertRule(rule, sheet.cssRules.length);
  shadow.adoptedStyleSheets = [sheet];
  const parent = document.createElement("div");
  parent.className = "parent";
  const child = document.createElement("span");
  parent.append(child);
  shadow.append(parent);
  expect(getComputedStyle(child).getPropertyValue("--angle").trim()).toBe("45deg");
  expect(getComputedStyle(host).getPropertyValue("--angle").trim()).toBe("20deg");
});
