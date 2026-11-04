import {cn} from "cn"
import {MonitorIcon, MoonIcon, SunIcon} from "lucide-react"
import {useState, useSyncExternalStore, type ReactNode} from "react"
import type {EditorInfo} from "wordgard-devtools"
import {PortalContainer} from "#components/portal"
import {Button} from "#components/ui/button"
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "#components/ui/select"
import {Tooltip, TooltipContent, TooltipTrigger} from "#components/ui/tooltip"
import type {PanelStore, Summary} from "./store.ts"
import {nextTheme, type ThemeChoice, type ThemeStore} from "./theme.ts"

const editorLabel = (editor: EditorInfo) => `${editor.name} · #${editor.id}`

const EditorPicker = ({store}: {store: PanelStore}) => {
  const {editors, selected} = useSyncExternalStore(store.subscribe, store.get)
  const items = editors.map(editor => ({value: editor.id, label: editorLabel(editor)}))
  return (
    <Select
      items={items}
      value={selected}
      // Base UI also reports changes it makes itself ("none": the selected editor left the list,
      // or the value prop moved): only the user's picks count.
      onValueChange={(id, details) => {
        if (id != null && details.reason != "none") void store.select(id)
      }}
      disabled={!editors.length}
    >
      <SelectTrigger size="sm" aria-label="Editor" className="min-w-40">
        <SelectValue placeholder="No editors" />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} align="start">
        {items.map(item => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

const themeIcons: Record<ThemeChoice, ReactNode> = {
  system: <MonitorIcon />,
  light: <SunIcon />,
  dark: <MoonIcon />,
}

const ThemeToggle = ({theme}: {theme: ThemeStore}) => {
  const {choice} = useSyncExternalStore(theme.subscribe, theme.get)
  return (
    <IconButton label={`Theme: ${choice}`} onClick={() => theme.set(nextTheme[choice])}>
      {themeIcons[choice]}
    </IconButton>
  )
}

export const IconButton = ({label, onClick, children}: {label: string; onClick: () => void; children: ReactNode}) => (
  <Tooltip>
    <TooltipTrigger render={<Button variant="ghost" size="icon-xs" aria-label={label} onClick={onClick} />}>
      {children}
    </TooltipTrigger>
    <TooltipContent side="top">{label}</TooltipContent>
  </Tooltip>
)

const SummaryView = ({summary}: {summary: Summary}) => (
  <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
    <section aria-label="Document">
      <h2 className="mb-1 font-medium text-muted-foreground">Document</h2>
      <ul className="font-mono text-xs">
        {summary.top.map(node => (
          <li key={node.path.join(".")} className="flex gap-2 truncate py-0.5">
            <span className="text-foreground">{node.name}</span>
            {node.paramPreview != null && <span className="text-muted-foreground">{node.paramPreview}</span>}
            <span className="text-muted-foreground">
              {node.from}–{node.to}
            </span>
            {node.textPreview != null && <span className="truncate text-muted-foreground">{node.textPreview}</span>}
          </li>
        ))}
      </ul>
    </section>
    <section aria-label="Selection">
      <h2 className="mb-1 font-medium text-muted-foreground">Selection</h2>
      <pre className="font-mono text-xs whitespace-pre-wrap">{JSON.stringify(summary.selection.json, null, 2)}</pre>
    </section>
  </div>
)

const Body = ({store}: {store: PanelStore}) => {
  const {editors, summary, error} = useSyncExternalStore(store.subscribe, store.get)
  return (
    <>
      {error && (
        <p role="alert" className="mb-2 text-destructive">
          {error}
        </p>
      )}
      {!editors.length ? (
        <p className="text-muted-foreground">
          No editors. Add <code className="font-mono">wordgardDevtools()</code> to an editor's configuration.
        </p>
      ) : (
        summary && <SummaryView summary={summary} />
      )}
    </>
  )
}

export type PanelProps = {
  store: PanelStore
  theme: ThemeStore
  /** Extra toolbar buttons, at its end (the dock's collapse button). */
  actions?: ReactNode
  className?: string
}

export const Panel = ({store, theme, actions, className}: PanelProps) => {
  const {dark} = useSyncExternalStore(theme.subscribe, theme.get)
  const {agent, editors} = useSyncExternalStore(store.subscribe, store.get)
  const [root, setRoot] = useState<HTMLDivElement | null>(null)
  return (
    <PortalContainer value={root}>
      <div
        ref={setRoot}
        className={cn(
          "flex h-full flex-col bg-background font-sans text-sm text-foreground antialiased",
          dark && "dark",
          className,
        )}
      >
        <header className="flex h-8 shrink-0 items-center gap-2 border-b px-2">
          <span className="font-semibold">Wordgard</span>
          <EditorPicker store={store} />
          <span className="text-xs text-muted-foreground">
            {editors.length} editor{editors.length == 1 ? "" : "s"}
          </span>
          <div className="ml-auto flex items-center gap-1">
            {agent && (
              <span className="font-mono text-xs text-muted-foreground">
                agent {agent.version} · protocol {agent.protocol}
              </span>
            )}
            <ThemeToggle theme={theme} />
            {actions}
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-auto p-2">
          <Body store={store} />
        </main>
      </div>
    </PortalContainer>
  )
}
