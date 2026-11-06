// The Rules of React, which the React Compiler relies on: a component that breaks them isn't
// compiled, silently. eslint-plugin-react-hooks' recommended preset holds the hooks rules and
// the compiler's own diagnostics.
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  { ignores: ["**/dist/**", "**/.output/**", "**/.wxt/**", "**/node_modules/**"] },
  // Arrow functions, not `function`. Methods stay allowed: a Rollup hook needs its `this`.
  {
    files: ["**/*.{ts,tsx,js,cjs,mjs}"],
    languageOptions: { parser: tseslint.parser },
    rules: {
      "no-restricted-syntax": [
        "error",
        { selector: "FunctionDeclaration", message: "Use an arrow function." },
        {
          selector:
            "FunctionExpression:not(MethodDefinition > FunctionExpression):not(Property[method=true] > FunctionExpression)",
          message: "Use an arrow function.",
        },
      ],
      "prefer-arrow-callback": "error",
    },
  },
  {
    files: [
      "packages/panel/src/**/*.{ts,tsx}",
      "packages/panel/test/**/*.{ts,tsx}",
      "packages/extension/entrypoints/**/*.{ts,tsx}",
      "packages/extension/src/**/*.{ts,tsx}",
      "demo/src/**/*.{ts,tsx}",
    ],
    languageOptions: { parser: tseslint.parser },
    extends: [reactHooks.configs.flat.recommended],
  }
);
