// A guide's markdown: `# Title`, one paragraph (the summary), then a list (the tips). Inline, only
// `code` and [links](url), which is all the panel renders. Shared with `scripts/readme.ts`, so plain
// TypeScript with no imports: Node runs it.
export type Guide = {
  title: string;
  /** What it shows. */
  summary: string;
  tips: string[];
};

const UNSUPPORTED = /\*\*|__|<\/?[a-z][^>]*>|!\[/i;

/** Throws on anything else, naming `name`: a guide the panel can't show must fail the build's tests. */
export const parseGuide = (text: string, name = "guide"): Guide => {
  const fail = (why: string) => {
    throw new Error(`${name}: ${why}`);
  };
  const blocks = text
    .replaceAll("\r\n", "\n")
    .trim()
    .split(/\n\s*\n/);
  const [heading, summary, list, ...rest] = blocks;
  const title = /^# (.+)$/.exec(heading ?? "")?.[1];
  if (!title) return fail("it starts with a `# Title` line");
  if (!summary || /^[#-]/.test(summary)) return fail("a paragraph follows the title");
  if (!list || rest.length) return fail("the tips, one list, end the guide");
  const tips: string[] = [];
  for (const line of list.split("\n")) {
    if (line.startsWith("- ")) tips.push(line.slice(2));
    else if (/^\s+[-*] /.test(line)) return fail("no nested lists");
    // A tip wrapped onto the next line, indented.
    else if (/^ {2}\S/.test(line) && tips.length) tips[tips.length - 1] += ` ${line.trim()}`;
    else return fail(`a tip is a "- " line: ${line}`);
  }
  const all = [title, summary, ...tips];
  if (all.some((part) => UNSUPPORTED.test(part)))
    return fail("only `code` and [links](url) are rendered");
  return { title, summary: summary.split("\n").join(" "), tips };
};
