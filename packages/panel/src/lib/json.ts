export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const json = (value: unknown) => JSON.stringify(value, null, 2) ?? String(value);

export const isRecord = (json: unknown): json is Record<string, unknown> =>
  typeof json == "object" && json != null && !Array.isArray(json);
