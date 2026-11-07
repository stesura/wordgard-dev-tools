// What the order of a facet's values does, for the facets Wordgard exports: from how Wordgard
// reads each (its `combine`, or the loop over `state.facet(…)`).

const FIRST = "The first value wins.";
const FIRST_FUNCTION = "Only the first function is used.";
const UNTIL = (what: string) => `Tried in order until one ${what}.`;
const FILTER = "Each runs in order, on the previous one's output.";
const HANDLER = "Called in order until one returns true: that one handles it.";
const ALL = "All are called, in order.";
const ATTRIBUTES =
  "Merged: where two set one attribute, the first wins; classes and styles are joined.";

const NOTES: Record<string, string> = {
  "Wordgard.editable": FIRST,
  "Wordgard.cspNonce": FIRST,
  "Wordgard.colorScheme": FIRST,
  "GardState.readOnly": FIRST,
  "GardState.textLTR": FIRST,
  "GardState.visualCursorMotion": FIRST,
  "KeyBinding.useDefaultKeymap": FIRST,
  "Wordgard.dragMovesSelection": FIRST_FUNCTION,
  "Wordgard.exceptionSink": FIRST_FUNCTION,
  "Wordgard.cursorBlinkRate": "The smallest value wins: the order doesn't matter.",
  "Wordgard.contentAttributes": ATTRIBUTES,
  "Wordgard.editorAttributes": ATTRIBUTES,
  "Wordgard.pasteHandler": HANDLER,
  "Wordgard.dropHandler": HANDLER,
  "Wordgard.scrollHandler": HANDLER,
  "Wordgard.clipboardTextSerializer": UNTIL("returns a string"),
  "Wordgard.clipboardTextParser": UNTIL("returns a slice"),
  "Wordgard.mouseSelectionStyle": UNTIL("returns a style"),
  "GardState.textblockLTR": UNTIL("returns a direction"),
  "Wordgard.clipboardOutputFilter": FILTER,
  "Wordgard.clipboardOutputHTMLFilter": FILTER,
  "Wordgard.clipboardOutputTextFilter": FILTER,
  "Wordgard.clipboardInputFilter": FILTER,
  "Wordgard.clipboardInputHTMLFilter": FILTER,
  "Wordgard.clipboardInputTextFilter": FILTER,
  "Wordgard.updateListener": ALL,
  "Wordgard.transactionListener": ALL,
  "KeyBinding.source":
    "For a key, the first binding whose command returns true wins (the Key bindings pane lists them all).",
  "Transaction.extender": "Called last to first: the first one sees what the others added.",
  "GardState.isAtom": "Where two set one node type, the first wins.",
  "GardState.schemaElement": "Joined in order.",
};

/** What the order of a facet's values does; null when it depends on a facet we don't know. */
export const facetNote = (label: string): string | null => NOTES[label] ?? null;
