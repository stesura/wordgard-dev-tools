import { IconButton } from "#components/icon-button";
import { ClipboardDocumentIcon } from "#icons";
import type { AnimationEvent } from "react";
import { copy } from "#lib/clipboard.ts";

// Set straight on the element, not through state: re-setting it restarts the animation on a repeat click.
const flash = (button: HTMLElement) => {
  button.removeAttribute("data-copied");
  void button.offsetWidth;
  button.setAttribute("data-copied", "");
};

const settle = (event: AnimationEvent<HTMLElement>) => {
  if (event.target === event.currentTarget) event.currentTarget.removeAttribute("data-copied");
};

/** An icon button copying `text()`, flashing green once it's copied. */
export const CopyButton = ({
  label,
  text,
  disabled,
}: {
  label: string;
  text: () => string | Promise<string>;
  disabled?: boolean;
}) => (
  <IconButton
    label={label}
    disabled={disabled}
    className="data-copied:animate-copied"
    onAnimationEnd={settle}
    onClick={(event) => {
      const button = event.currentTarget;
      void Promise.resolve()
        .then(text)
        .then(copy)
        .then(() => flash(button))
        .catch(() => {});
    }}
  >
    <ClipboardDocumentIcon />
  </IconButton>
);
