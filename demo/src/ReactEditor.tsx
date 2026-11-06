import { WordgardDoc, WordgardEditor } from "@stesura/react-wordgard";
import { useState } from "react";
import { Wordgard } from "wordgard/editor";
import { history } from "wordgard/history";
import { basicSchema } from "wordgard/schema";
import { wordgardDevtools } from "@stesura/wordgard-dev-tools";

// No name option: the panel names it from its aria-label.
const config = [
  basicSchema(),
  history(),
  Wordgard.contentAttributes.of({ "aria-label": "React editor" }),
  wordgardDevtools({ enabled: true }),
];

const doc =
  "<h2>Drawn by React</h2><p>A <em>react-wordgard</em> editor. Remount it to see the panel follow.</p>";

export const ReactEditor = () => {
  const [mounted, setMounted] = useState(true);
  return (
    <>
      <div className="toolbar">
        <button onClick={() => setMounted((m) => !m)}>{mounted ? "Unmount" : "Mount"}</button>
      </div>
      {mounted && (
        <WordgardEditor doc={doc} config={config}>
          <WordgardDoc className="editor" />
        </WordgardEditor>
      )}
    </>
  );
};
