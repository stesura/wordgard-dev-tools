import { Wordgard } from "wordgard/editor";
import { basicSchema } from "wordgard/schema";
import { wordgardDevtools } from "@stesura/wordgard-dev-tools";

// An editor in an iframe: the extension lists it under its frame. The in-page panel docked in
// the top page only sees the top page's editors.
const parent = document.getElementById("framed");
if (parent) {
  Wordgard.create({
    parent,
    doc: "<p>An editor in an iframe.</p>",
    config: [basicSchema(), wordgardDevtools({ name: "framed", enabled: true })],
  });
}
