import type {AgentInfo, EditorInfo, Path, Push, Request, SelectionInfo} from "wordgard-devtools"
import type {Transport} from "./transport.ts"

export type PanelState = {
  agent: AgentInfo | null
  editors: EditorInfo[]
  selected: number | null
  /** The selected editor's selection. */
  selection: {id: number; info: SelectionInfo} | null
  error: string | null
  /** Problems with some frames, from the transport. */
  notices: string[]
  /** Pick mode: the next click on an editor in the page selects its node. */
  picking: boolean
}

export type PanelStore = {
  get: () => PanelState
  subscribe: (listener: () => void) => () => void
  select: (id: number | null) => Promise<void>
  /** The selected editor's document changed (coalesced per frame). */
  onDocChanged: (listener: (id: number) => void) => () => void
  pick: (on: boolean) => void
  /** A node to reveal in an editor's tree (a pick): taken once, by that editor's tree. */
  takeReveal: (id: number) => Path | null
  /** A reveal is waiting; the tree takes it with `takeReveal`. */
  onReveal: (listener: () => void) => () => void
  transport: Transport
  /** Subscribes to pushes and loads the editors. Returns the stop function, which detaches. */
  start: () => () => void
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e))

export const createPanelStore = (transport: Transport): PanelStore => {
  let state: PanelState = {
    agent: null,
    editors: [],
    selected: null,
    selection: null,
    error: null,
    notices: [],
    picking: false,
  }
  const listeners = new Set<() => void>()
  const docListeners = new Set<(id: number) => void>()
  const revealListeners = new Set<() => void>()
  let reveal: {id: number; path: Path} | null = null
  const set = (patch: Partial<PanelState>) => {
    state = {...state, ...patch}
    for (const listener of listeners) listener()
  }
  const fail = (e: unknown) => set({error: errorMessage(e)})

  // Bumped by start and stop: replies for an earlier run are dropped, so a stopped store
  // can't re-attach an editor.
  let run = 0
  let running = false
  const current = (at: number) => running && at == run
  // The user's pick, followed when it comes back: the same instance reconnected keeps its id,
  // a remount (a new instance) is matched by name.
  let chosen: {id: number; name: string} | null = null

  // Replies can arrive out of order: only the latest selection request lands.
  let selectionRun = 0
  const loadSelection = async () => {
    const at = run
    const mine = ++selectionRun
    const id = state.selected
    if (id == null) {
      set({selection: null})
      return
    }
    const info = await transport.send({type: "selection", id})
    if (current(at) && mine == selectionRun && id == state.selected) set({selection: {id, info}, error: null})
  }

  const attach = async (id: number | null) => {
    const at = run
    set({selected: id, selection: state.selection?.id == id ? state.selection : null})
    try {
      await transport.send({type: "select", id})
      if (current(at)) await loadSelection()
    } catch (e) {
      if (current(at)) fail(e)
    }
  }

  const select = (id: number | null) => {
    const editor = state.editors.find(e => e.id == id)
    chosen = editor ? {id: editor.id, name: editor.name} : null
    return attach(id)
  }

  const refreshEditors = async () => {
    const at = run
    try {
      const {agent, editors, notices = []} = await transport.send({type: "listEditors"})
      if (!current(at)) return
      set({agent, editors, notices, error: null})
      const target =
        editors.find(e => e.id == chosen?.id) ??
        editors.find(e => e.name == chosen?.name) ??
        editors.find(e => e.id == state.selected) ??
        editors[0] ??
        null
      // A remounted editor comes back detached.
      if (target?.id != state.selected || (target && !target.attached)) await attach(target?.id ?? null)
    } catch (e) {
      if (current(at)) fail(e)
    }
  }

  const pick = (on: boolean) => {
    set({picking: on})
    // To every frame, through the transport: one pick ends picking everywhere.
    transport.send({type: "pick", on}).catch(fail)
  }

  // Coalesced per frame: a burst of updates refetches once.
  let frame: number | null = null
  let docChanged = false
  const onPush = (push: Push) => {
    if (push.type == "editorsChanged") void refreshEditors()
    // Another panel's picking (the dock and the extension on one page) isn't ours.
    else if (push.type == "pickCancelled") {
      if (state.picking) set({picking: false})
    } else if (push.type == "picked") {
      if (!state.picking) return
      // Ends picking in the other frames too.
      pick(false)
      reveal = {id: push.id, path: push.path}
      void select(push.id)
      for (const listener of revealListeners) listener()
    } else if (push.type == "stateChanged" && push.id == state.selected) {
      docChanged ||= push.docChanged
      frame ??= requestAnimationFrame(() => {
        frame = null
        const id = state.selected
        if (docChanged && id != null) for (const listener of docListeners) listener(id)
        docChanged = false
        loadSelection().catch(fail)
      })
    }
  }

  return {
    get: () => state,
    subscribe: listener => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    select,
    onDocChanged: listener => {
      docListeners.add(listener)
      return () => {
        docListeners.delete(listener)
      }
    },
    pick,
    takeReveal: id => {
      if (reveal?.id != id) return null
      const {path} = reveal
      reveal = null
      return path
    },
    onReveal: listener => {
      revealListeners.add(listener)
      return () => {
        revealListeners.delete(listener)
      }
    },
    transport,
    start: () => {
      run++
      running = true
      let stopPushes = () => {}
      try {
        stopPushes = transport.onPush(onPush)
      } catch (e) {
        fail(e)
      }
      void refreshEditors()
      return () => {
        run++
        running = false
        stopPushes()
        if (frame != null) cancelAnimationFrame(frame)
        frame = null
        docChanged = false
        if (state.picking) set({picking: false})
        for (const request of [
          {type: "pick", on: false},
          {type: "highlight", id: 0, path: null},
          {type: "select", id: null},
        ] satisfies Request[]) {
          transport.send(request).catch(() => {})
        }
      }
    },
  }
}
