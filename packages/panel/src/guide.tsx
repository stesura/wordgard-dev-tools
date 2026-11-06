import {cn} from "cn"
import {QuestionMarkCircleIcon} from "#icons"
import {useSyncExternalStore} from "react"
import {Button} from "#components/ui/button"
import {Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger} from "#components/ui/popover"
import {GUIDES, type Guide} from "./guides.ts"
import type {View} from "./store.ts"
import {stored} from "./stored.ts"

const LINK = /^\[([^\]]+)\]\(([^)]+)\)$/

/** A guide's text: `code` spans and [links](href), as markdown (the README renders the same text). */
const Text = ({text}: {text: string}) =>
  text.split(/(`[^`]+`|\[[^\]]+\]\([^)]+\))/).map((part, i) => {
    const link = LINK.exec(part)
    if (link) {
      return (
        // Dotted underline, as the panel's other links: a linked `code` term would read as plain code.
        <a
          key={i}
          href={link[2]}
          target="_blank"
          rel="noreferrer"
          className="text-foreground underline decoration-dotted underline-offset-2 hover:decoration-solid"
        >
          <Text text={link[1] ?? ""} />
        </a>
      )
    }
    return part.length > 1 && part.startsWith("`") && part.endsWith("`") ? (
      <code key={i} className="rounded bg-muted px-1 font-mono text-xs">
        {part.slice(1, -1)}
      </code>
    ) : (
      part
    )
  })

/** Whether the guides' ? buttons show (the Settings menu): saved, on by default. */
export const guidesShown = stored<boolean>("wordgard-devtools:guides", true, json => json !== false, shown => shown)

/**
 * A guide: what something shows, tips, links to Wordgard's reference. Opens on click, or on hover.
 * `dim`: faint until pointed at, focused or open, so the guides inside a tab don't compete with its
 * content (the tab bar's own stays as is).
 */
export const GuidePopover = ({
  guide,
  label = `About ${guide.title}`,
  align = "end",
  dim = true,
}: {
  guide: Guide
  label?: string
  align?: "start" | "end"
  dim?: boolean
}) => {
  if (!useSyncExternalStore(guidesShown.subscribe, guidesShown.get)) return null
  return (
  <Popover>
    <PopoverTrigger
      openOnHover
      delay={400}
      render={
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={label}
          className={cn(dim && "opacity-50 hover:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100")}
        />
      }
    >
      {/* In a tab, 14px: the tab bar's 16px. */}
      <QuestionMarkCircleIcon className={cn(dim && "size-3.5")} />
    </PopoverTrigger>
    <PopoverContent align={align} className="w-80 gap-2 text-xs">
      <PopoverTitle className="text-sm">{guide.title}</PopoverTitle>
      <PopoverDescription className="text-popover-foreground">
        <Text text={guide.summary} />
      </PopoverDescription>
      <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
        {guide.tips.map(tip => (
          <li key={tip}>
            <Text text={tip} />
          </li>
        ))}
      </ul>
    </PopoverContent>
  </Popover>
  )
}

/** The shown tab's guide. */
export const GuideButton = ({view}: {view: View}) => (
  <GuidePopover guide={GUIDES[view]} label={`About the ${GUIDES[view].title} tab`} dim={false} />
)
