// A guide's markdown: `# Title`, one paragraph (the summary), an optional list (the notes: what it
// shows, in Wordgard's terms), then an optional `## Tips` heading and list (how to use the panel:
// clicks, right-clicks, toolbars). Inline, only `code` and [links](url), which is all the panel
// renders. Shared with `scripts/readme.ts`, so plain TypeScript with no imports: Node runs it.
export type Guide = {
  title: string;
  /** What it shows. */
  summary: string;
  /** Wordgard's concepts behind it. */
  notes: string[];
  /** Using the panel. */
  tips: string[];
};

const UNSUPPORTED = /\*\*|__|<\/?[a-z][^>]*>|!\[/i;
const TIPS = "## Tips";

/** Throws on anything else, naming `name`: a guide the panel can't show must fail the build's tests. */
export const parseGuide = (text: string, name = "guide"): Guide => {
  const fail = (why: string) => {
    throw new Error(`${name}: ${why}`);
  };
  const list = (block: string) => {
    const items: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("- ")) items.push(line.slice(2));
      else if (/^\s+[-*] /.test(line)) return fail("no nested lists");
      // An item wrapped onto the next line, indented.
      else if (/^ {2}\S/.test(line) && items.length) items[items.length - 1] += ` ${line.trim()}`;
      else return fail(`a list item is a "- " line: ${line}`);
    }
    return items;
  };
  const blocks = text
    .replaceAll("\r\n", "\n")
    .trim()
    .split(/\n\s*\n/);
  const [heading, summary, ...rest] = blocks;
  const title = /^# (.+)$/.exec(heading ?? "")?.[1];
  if (!title) return fail("it starts with a `# Title` line");
  if (!summary || /^[#-]/.test(summary)) return fail("a paragraph follows the title");
  const notes = rest[0]?.startsWith("- ") ? list(rest.shift() ?? "") : [];
  let tips: string[] = [];
  if (rest[0] === TIPS) {
    rest.shift();
    if (!rest[0]?.startsWith("- ")) return fail(`a list follows ${TIPS}`);
    tips = list(rest.shift() ?? "");
  }
  if (rest.length) return fail(`after the summary: a list of notes, then ${TIPS} and a list`);
  const all = [title, summary, ...notes, ...tips];
  if (all.some((part) => UNSUPPORTED.test(part)))
    return fail("only `code` and [links](url) are rendered");
  return { title, summary: summary.split("\n").join(" "), notes, tips };
};
