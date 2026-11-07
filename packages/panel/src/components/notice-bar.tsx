import { cn } from "cn";
import { XMarkIcon } from "#icons";
import { IconButton } from "./icon-button.tsx";

/** An action's outcome, shown until closed. `closing`: easing out. */
export type Notice = { ok: boolean; text: string; closing?: boolean };

// The banner's close: its height eases to nothing, then it unmounts.
export const CLOSING_MS = 300;

/** A tab's banner under its toolbar: a status, or an alert, with a close button. */
export const NoticeBar = ({ notice, onClose }: { notice: Notice | null; onClose: () => void }) =>
  notice && (
    // Grid rows ease between 0fr and 1fr: a height transition to and from the content's own.
    <div
      data-closing={notice.closing || undefined}
      className={cn(
        "grid shrink-0 transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none starting:grid-rows-[0fr]",
        notice.closing ? "grid-rows-[0fr]" : "grid-rows-[1fr]"
      )}
    >
      <div className="min-h-0 overflow-hidden">
        {/* The button outside the live region: announced, it would read "Close the message". The
          ghost button takes the tint's text colour. */}
        <div
          className={cn(
            "flex items-center gap-2 border-b py-0.5 pr-1 pl-2 text-xs",
            notice.ok
              ? "bg-green-500/15 text-green-800 dark:text-green-300"
              : "bg-destructive/10 text-destructive"
          )}
        >
          <p role={notice.ok ? "status" : "alert"} className="min-w-0 flex-1">
            {notice.text}
          </p>
          <IconButton label="Close the message" onClick={onClose}>
            <XMarkIcon />
          </IconButton>
        </div>
      </div>
    </div>
  );
