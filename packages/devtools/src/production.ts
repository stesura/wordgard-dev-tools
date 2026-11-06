// Module-scoped, so it doesn't clash with @types/node. Bundlers replace `process.env.NODE_ENV`
// with a string; `process` itself stays undefined in the browser, hence no `typeof process` guard.
declare const process: {env: {NODE_ENV?: string}}

/** Whether the page was built for production, as its bundler sets `process.env.NODE_ENV`. */
export const isProduction = (): boolean => {
  try {
    return process.env.NODE_ENV === "production"
  } catch {
    // No bundler.
    return false
  }
}
