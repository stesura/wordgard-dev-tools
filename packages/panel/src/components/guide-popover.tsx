import { cn } from "cn";
import { QuestionMarkCircleIcon } from "#icons";
import { useStore } from "@nanostores/react";
import { Button } from "#components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "#components/ui/popover";
import type { Guide } from "../guides/guides.ts";
import { usePanelSettings } from "./panel-settings.tsx";

const LINK = /^\[([^\]]+)\]\(([^)]+)\)$/;

/**
 * A guide's text: `code` spans, **bold** (around a link too) and [links](href), as markdown (the
 * README renders the same text).
 */
const Text = ({ text }: { text: string }) =>
  text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/).map((part, i) => {
    if (part.length > 4 && part.startsWith("**") && part.endsWith("**"))
      return (
        <strong key={i} className="font-semibold">
          <Text text={part.slice(2, -2)} />
        </strong>
      );
    const link = LINK.exec(part);
    if (link) {
      return (
        // Dotted underline, as the panel's other links: a linked `code` term would read as plain code.
        <a
          key={i}
          href={link[2]}
          target="_blank"
          rel="noreferrer"
          className="text-sky-600 underline decoration-dotted underline-offset-2 hover:decoration-solid dark:text-sky-400"
        >
          <Text text={link[1] ?? ""} />
        </a>
      );
    }
    return part.length > 1 && part.startsWith("`") && part.endsWith("`") ? (
      <code key={i} className="rounded bg-muted px-1 font-mono text-sm">
        {part.slice(1, -1)}
      </code>
    ) : (
      part
    );
  });

const List = ({ items }: { items: string[] }) =>
  items.length > 0 && (
    <ul className="list-disc space-y-1 pl-4 text-popover-foreground">
      {items.map((item) => (
        <li key={item}>
          <Text text={item} />
        </li>
      ))}
    </ul>
  );

/**
 * A guide: what something shows, Wordgard's notes on it, tips for the panel, links to Wordgard's reference. Opens on click, or on hover.
 * `dim`: faint until pointed at, focused or open, so the guides inside a tab don't compete with its
 * content (the tab bar's own stays as is).
 */
export const GuidePopover = ({
  guide,
  label,
  align = "end",
  dim = true,
}: {
  guide: Guide;
  label?: string;
  align?: "start" | "end";
  dim?: boolean;
}) => {
  // Shown unless the Settings menu turned the guides off.
  if (!useStore(usePanelSettings().guidesShown)) return null;
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={400}
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={label ?? `About ${guide.title}`}
            className={cn(
              dim &&
                "opacity-50 hover:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100"
            )}
          />
        }
      >
        {/* In a tab, 14px: the tab bar's 16px. */}
        <QuestionMarkCircleIcon className={cn(dim && "size-3.5")} />
      </PopoverTrigger>
      <PopoverContent align={align} className="w-80 gap-2 text-sm">
        <PopoverTitle className="text-base">{guide.title}</PopoverTitle>
        <PopoverDescription className="text-popover-foreground">
          <Text text={guide.summary} />
        </PopoverDescription>
        <List items={guide.notes} />
        {guide.tips.length > 0 && (
          <section aria-label="Tips" className="mt-1 space-y-1 border-t pt-2">
            <h3 className="font-medium text-popover-foreground">Tips</h3>
            <List items={guide.tips} />
          </section>
        )}
      </PopoverContent>
    </Popover>
  );
};

/** The shown tab's guide, in the tab bar: never dimmed. */
export const GuideButton = ({ guide }: { guide: Guide }) => (
  <GuidePopover guide={guide} label={`About the ${guide.title} tab`} dim={false} />
);
