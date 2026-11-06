import {QuestionMarkCircleIcon} from "#icons"
import {Button} from "#components/ui/button"
import {Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger} from "#components/ui/popover"
import {GUIDES} from "./guides.ts"
import type {View} from "./store.ts"

/** `code` spans in a guide's text. */
const Text = ({text}: {text: string}) =>
  text.split("`").map((part, i) =>
    i % 2 ? (
      <code key={i} className="rounded bg-muted px-1 font-mono text-xs">
        {part}
      </code>
    ) : (
      part
    ),
  )

/** The shown tab's guide: what it shows, tips, links to Wordgard's reference. Opens on click, or on hover. */
export const GuideButton = ({view}: {view: View}) => {
  const guide = GUIDES[view]
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={400}
        render={<Button variant="ghost" size="icon-xs" aria-label={`About the ${guide.title} tab`} />}
      >
        <QuestionMarkCircleIcon />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-2 text-xs">
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
        <p className="flex flex-wrap gap-x-2 border-t pt-2">
          <span className="text-muted-foreground">Reference:</span>
          {guide.links.map(link => (
            <a key={link.href} href={link.href} target="_blank" rel="noreferrer" className="text-primary hover:underline">
              {link.label}
            </a>
          ))}
        </p>
      </PopoverContent>
    </Popover>
  )
}
