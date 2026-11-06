// The agent's own reads of an editor (outlines, picks) can force a flush: the log tags those
// flushes so they aren't blamed on the app.

let depth = 0;

export const byAgent = <T>(read: () => T): T => {
  depth++;
  try {
    return read();
  } finally {
    depth--;
  }
};

export const agentReading = () => depth > 0;
