import {cn} from "cn"
import {MonitorIcon, MoonIcon, MousePointerClickIcon, SunIcon} from "lucide-react"
import {useState, useSyncExternalStore, type ReactNode} from "react"
import type {EditorInfo} from "wordgard-devtools"
import {PortalContainer} from "#components/portal"
import {Button} from "#components/ui/button"
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "#components/ui/select"
import {Tooltip, TooltipContent, TooltipTrigger} from "#components/ui/tooltip"
import {Tabs, TabsContent, TabsList, TabsTrigger} from "#components/ui/tabs"
import {DocTree} from "./DocTree.tsx"
import type {PanelStore, View} from "./store.ts"
import {Structure} from "./Structure.tsx"
import {nextTheme, type ThemeChoice, type ThemeStore} from "./theme.ts"

const editorLabel = (editor: EditorInfo) =>
  `${editor.name} · #${editor.id}` + (editor.frame ? ` · ${editor.frame}` : "")

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

const PickButton = ({store}: {store: PanelStore}) => {
  const {picking, editors} = useSyncExternalStore(store.subscribe, store.get)
  if (!editors.length) return null
  return (
    <IconButton label="Pick a node in the page" pressed={picking} onClick={() => store.pick(!picking)}>
      <MousePointerClickIcon className={cn(picking && "text-primary")} />
    </IconButton>
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

export const IconButton = ({
  label,
  onClick,
  pressed,
  children,
}: {
  label: string
  onClick: () => void
  /** A toggle's state. */
  pressed?: boolean
  children: ReactNode
}) => (
  <Tooltip>
    <TooltipTrigger
      render={
        <Button
          variant={pressed ? "secondary" : "ghost"}
          size="icon-xs"
          aria-label={label}
          aria-pressed={pressed}
          onClick={onClick}
        />
      }
    >
      {children}
    </TooltipTrigger>
    <TooltipContent side="top">{label}</TooltipContent>
  </Tooltip>
)

const Notices = ({store}: {store: PanelStore}) => {
  const {error, notices} = useSyncExternalStore(store.subscribe, store.get)
  return [error, ...notices].map(
    (text, index) =>
      text && (
        <p key={index} role="alert" className="border-b px-2 py-1 text-destructive">
          {text}
        </p>
      ),
  )
}

const isView = (value: unknown): value is View => value == "tree" || value == "structure"

const Body = ({store}: {store: PanelStore}) => {
  const {editors, selected, view} = useSyncExternalStore(store.subscribe, store.get)
  if (!editors.length) {
    return (
      <p className="p-2 text-muted-foreground">
        No editors. Add <code className="font-mono">wordgardDevtools()</code> to an editor's configuration.
      </p>
    )
  }
  if (selected == null) return null
  // Both tabs stay mounted (the tree keeps its expanded rows); per editor, so switching starts afresh.
  return (
    <Tabs
      value={view}
      onValueChange={value => {
        if (isView(value)) store.setView(value)
      }}
      className="min-h-0 flex-1 gap-0"
    >
      <TabsList variant="line" className="h-7 w-full shrink-0 justify-start rounded-none border-b px-1">
        <TabsTrigger value="tree" className="flex-none px-2 text-xs">
          Tree
        </TabsTrigger>
        <TabsTrigger value="structure" className="flex-none px-2 text-xs">
          Structure
        </TabsTrigger>
      </TabsList>
      <TabsContent value="tree" keepMounted className="flex min-h-0 flex-col data-hidden:hidden">
        <DocTree key={selected} store={store} editorId={selected} />
      </TabsContent>
      <TabsContent value="structure" keepMounted className="flex min-h-0 flex-col data-hidden:hidden">
        <Structure key={selected} store={store} editorId={selected} />
      </TabsContent>
    </Tabs>
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
  const {editors} = useSyncExternalStore(store.subscribe, store.get)
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
        <header className="flex min-h-8 shrink-0 flex-wrap items-center gap-x-2 border-b px-2">
          <span className="font-semibold">Wordgard</span>
          <EditorPicker store={store} />
          <PickButton store={store} />
          <span className="text-xs text-muted-foreground">
            {editors.length} editor{editors.length == 1 ? "" : "s"}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle theme={theme} />
            {actions}
          </div>
        </header>
        <Notices store={store} />
        <main className="flex min-h-0 flex-1 flex-col">
          <Body store={store} />
        </main>
      </div>
    </PortalContainer>
  )
}
