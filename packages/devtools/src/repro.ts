import type { Schema } from "wordgard/doc";
import type { GardState, Transaction } from "wordgard/state";
import * as wordgardState from "wordgard/state";
import * as wordgardTypes from "wordgard/types";

// Loaded with the serialisers, on the first panel request.

export type Recorded = { index: number; tr: Transaction };

type Step = {
  /** The log's index; null for a selection the log didn't record. */
  index: number | null;
  changes?: unknown;
  selection?: unknown;
  userEvent?: string;
};

/** Selection types every configuration has. */
const BUILT_IN_SELECTIONS = new Set(["text", "node"]);

const plural = (count: number, word: string) => `${count} ${word}${count == 1 ? "" : "s"}`;

/** One line of a `//` comment. */
const inline = (text: string) => text.replace(/\s+/g, " ");

/** Inside a `/* *\/` comment. */
const block = (text: string) => inline(text).replace(/\*\//g, "* /");

/** JSON for the script; a value JSON can't hold (a bigint) fails the request with what it was. */
const json = (value: unknown, what: string) => {
  try {
    return JSON.stringify(value);
  } catch (e) {
    throw new Error(`Can't write ${what} as JSON: ${e instanceof Error ? e.message : String(e)}`, {
      cause: e,
    });
  }
};

/**
 * The newest transactions the log holds unbroken (each starting from the document the one before
 * left), on the newest schema; and why the run starts there, if it doesn't start at the oldest.
 */
const unbrokenRun = (recorded: readonly Recorded[]) => {
  const schema = recorded.at(-1)?.tr.state.schema;
  let start = recorded.length;
  let broken: string | null = null;
  for (let i = recorded.length - 1; i >= 0; i--) {
    const tr = recorded[i]?.tr;
    const next = recorded[i + 1]?.tr;
    if (!tr) break;
    if (next && next.startState.doc !== tr.state.doc) {
      broken = "transactions it didn't record (paused, or left out), or the state replaced";
      break;
    }
    // A transaction changing the schema can't be replayed on the new one.
    if (tr.startState.schema !== schema) {
      broken = "the schema changed";
      break;
    }
    start = i;
  }
  return { run: recorded.slice(start), broken };
};

/** The export of `wordgard/types` an element of the schema is, if one. */
const typesExport = (element: Schema.Element) =>
  Object.entries(wordgardTypes).find(
    ([, value]) =>
      value === element ||
      (typeof value == "object" && value != null && "type" in value && value.type === element)
  )?.[0];

/** `wordgard/types` names for the schema's elements, in order, and placeholders for the rest. */
const schemaSource = (schema: Schema) => {
  const imports: string[] = [];
  const missing: string[] = [];
  const items = schema.elements.map((element) => {
    const name = typesExport(element);
    if (name) {
      if (!imports.includes(name)) imports.push(name);
      return name;
    }
    const nodeType = schema.nodes.find((type) => type === element);
    const markType = schema.marks.find((type) => type === element);
    const what = nodeType
      ? `${nodeType.name}, your node type`
      : markType
        ? `${markType.name}, your mark type`
        : "a schema override";
    missing.push(what);
    return `/* TODO: ${block(what)} */`;
  });
  return { imports, missing, items };
};

const selectionTag = (json: unknown) =>
  typeof json == "object" && json != null && "type" in json && typeof json.type == "string"
    ? json.type
    : null;

const stepsOf = (run: readonly Recorded[]) => {
  const steps: { step: Step; note: string }[] = [];
  let effects = 0;
  let previous: GardState | null = null;
  for (const { index, tr } of run) {
    // A selection the log left out (select.pointer, focus): set before the transaction that follows it.
    if (previous && !tr.startState.selection.eq(previous.selection))
      steps.push({
        step: { index: null, selection: tr.startState.selection.toJSON(tr.startState) },
        note: "a selection the log didn't record",
      });
    const userEvent = tr.annotation(wordgardState.Transaction.userEvent);
    const step: Step = { index };
    if (tr.docChanged) step.changes = tr.changes.toJSON();
    if (tr.selection) step.selection = tr.selection.toJSON(tr.state);
    if (userEvent != null) step.userEvent = userEvent;
    const notes = [`#${index}`];
    if (userEvent != null) notes.push(userEvent);
    if (tr.annotation(wordgardState.Transaction.appended)) notes.push("appended");
    if (tr.effects.length) notes.push(`${plural(tr.effects.length, "effect")} dropped`);
    effects += tr.effects.length;
    steps.push({ step, note: notes.join(", ") });
    previous = tr.state;
  }
  return { steps, effects };
};

/**
 * A standalone Node script replaying the log's transactions on plain Wordgard: the state before
 * the oldest one the log holds, then each transaction's changes, selection and user event, on a
 * schema-only configuration, checked against the recorded document and selection.
 */
export const reproScript = (
  recorded: readonly Recorded[],
  { editor, version }: { editor: string; version: string }
) => {
  const { run, broken } = unbrokenRun(recorded);
  const first = run[0];
  const last = run.at(-1);
  if (!first || !last)
    throw new Error(
      recorded.length
        ? "The log's newest transaction changed the schema: nothing to replay after it"
        : "The log holds no transactions: record some first"
    );
  const snapshot = first.tr.startState.toJSON();
  const expected = last.tr.state.doc.toJSON();
  const expectedSelection = last.tr.state.selection.toJSON(last.tr.state);
  const { steps, effects } = stepsOf(run);
  const schema = schemaSource(last.tr.state.schema);

  const tags = new Set(
    [snapshot.selection, ...steps.map(({ step }) => step.selection)]
      .map(selectionTag)
      .filter((tag): tag is string => tag != null && !BUILT_IN_SELECTIONS.has(tag))
  );
  const cells = tags.delete("cell");
  const config = [
    "schema",
    ...(cells ? ["CellSelection.extension /* wordgard/table's cell selections */"] : []),
    ...[...tags].map((tag) => `/* TODO: the extension defining the "${block(tag)}" selection */`),
  ];

  const left = recorded.length - run.length;
  const limits = [
    `The schema is rebuilt from Wordgard's own types (wordgard/types)${
      schema.missing.length
        ? `. Fill in what isn't Wordgard's (the TODOs below): ${schema.missing.join("; ")}`
        : ""
    }.`,
    `Effects are dropped: their types have no names to serialise${
      effects ? ` (${plural(effects, "effect")} here)` : ""
    }.`,
    `Text and node selections need nothing more; custom selection types need their extension in \`config\`${
      tags.size ? ` (TODO below: ${[...tags].map((tag) => `"${tag}"`).join(", ")})` : ""
    }.`,
    "The app's extenders, filters and appenders don't run: what they did is in the recorded changes, appended transactions included.",
    ...(broken
      ? [`${plural(left, "older transaction")} left out: before #${first.index}, ${broken}.`]
      : []),
  ];

  const imports = [
    `import assert from "node:assert/strict";`,
    `import { ChangeSet } from "wordgard/doc";`,
    `import { GardSelection, GardState } from "wordgard/state";`,
    ...(schema.imports.length
      ? [`import { ${schema.imports.join(", ")} } from "wordgard/types";`]
      : []),
    ...(cells ? [`import { CellSelection } from "wordgard/table";`] : []),
  ];

  return [
    `// Wordgard repro: ${plural(run.length, "transaction")} recorded by Wordgard DevTools ${version}`,
    `// on ${inline(JSON.stringify(editor))}, #${first.index} to #${last.index}.`,
    "// Run it with Node where `wordgard` is installed: save it as repro.mjs, then `node repro.mjs`.",
    "//",
    "// Limits:",
    ...limits.map((limit) => `// - ${inline(limit)}`),
    "",
    ...imports,
    "",
    `const schema = GardState.schemaElement.of([${schema.items.join(", ")}]);`,
    `const config = [${config.join(", ")}];`,
    "",
    "// The state before the first transaction.",
    `const snapshot = ${json(snapshot, `the state before #${first.index}`)};`,
    "",
    "// Each transaction: its changes, the selection it set, its user event.",
    "const steps = [",
    ...steps.map(
      ({ step, note }) =>
        `  ${json(step, step.index == null ? "a selection" : `#${step.index}`)}, // ${inline(note)}`
    ),
    "];",
    "",
    "// The document and selection after the last one.",
    `const expected = ${json(expected, `the document after #${last.index}`)};`,
    `const expectedSelection = ${json(expectedSelection, `the selection after #${last.index}`)};`,
    "",
    "let state = GardState.fromJSON(snapshot, config);",
    "for (const { index, changes, selection, userEvent } of steps) {",
    "  try {",
    "    state = state.update({",
    "      changes: changes && ChangeSet.fromJSON(state.schema, changes),",
    "      selection: selection && ((cx) => GardSelection.fromJSON(cx, selection)),",
    "      userEvent,",
    "    }).state;",
    "  } catch (error) {",
    '    throw new Error(`Replaying ${index == null ? "a selection" : `#${index}`} failed`, { cause: error });',
    "  }",
    "}",
    'assert.deepEqual(JSON.parse(JSON.stringify(state.doc.toJSON())), expected, "The replayed document differs from the recorded one");',
    'assert.deepEqual(JSON.parse(JSON.stringify(state.selection.toJSON(state))), expectedSelection, "The replayed selection differs from the recorded one");',
    "console.log(`Replayed ${steps.length} steps: the document and selection match the recorded ones.`);",
    "",
  ].join("\n");
};
