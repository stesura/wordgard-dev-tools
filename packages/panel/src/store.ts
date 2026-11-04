import type {AgentInfo, EditorInfo, Push, SelectionInfo, TreeNode} from "wordgard-devtools"
import type {Transport} from "./transport.ts"

export type Summary = {id: number; top: TreeNode[]; selection: SelectionInfo}

export type PanelState = {
  agent: AgentInfo | null
  editors: EditorInfo[]
  selected: number | null
  summary: Summary | null
  error: string | null
  /** Problems with some frames, from the transport. */
  notices: string[]
}

export type PanelStore = {
  get: () => PanelState
  subscribe: (listener: () => void) => () => void
  select: (id: number | null) => Promise<void>
  /** Subscribes to pushes and loads the editors. Returns the stop function, which detaches. */
  start: () => () => void
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

export const createPanelStore = (transport: Transport): PanelStore => {
  let state: PanelState = {agent: null, editors: [], selected: null, summary: null, error: null, notices: []}
  const listeners = new Set<() => void>()
  const set = (patch: Partial<PanelState>) => {
    state = {...state, ...patch}
    for (const listener of listeners) listener()
  }
  const fail = (e: unknown) => set({error: message(e)})

  // Bumped by start and stop: replies for an earlier run are dropped, so a stopped store
  // can't re-attach an editor.
  let run = 0
  let running = false
  const current = (at: number) => running && at == run
  // The user's pick, followed when it comes back: the same instance reconnected keeps its id,
  // a remount (a new instance) is matched by name.
  let chosen: {id: number; name: string} | null = null

  // Replies can arrive out of order: only the latest summary request lands.
  let summaryRun = 0
  const loadSummary = async () => {
    const at = run
    const mine = ++summaryRun
    const id = state.selected
    if (id == null) {
      set({summary: null})
      return
    }
    const [top, selection] = await Promise.all([
      transport.send({type: "children", id, paths: [[]]}),
      transport.send({type: "selection", id}),
    ])
    if (current(at) && mine == summaryRun && id == state.selected) {
      set({summary: {id, top: top[0] ?? [], selection}, error: null})
    }
  }

  const attach = async (id: number | null) => {
    const at = run
    set({selected: id, summary: state.summary?.id == id ? state.summary : null})
    try {
      await transport.send({type: "select", id})
      if (current(at)) await loadSummary()
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

  // Coalesced per frame: a burst of updates refetches once.
  let frame: number | null = null
  const onPush = (push: Push) => {
    if (push.type == "editorsChanged") void refreshEditors()
    else if (push.type == "stateChanged" && push.id == state.selected && frame == null) {
      frame = requestAnimationFrame(() => {
        frame = null
        loadSummary().catch(fail)
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
        transport.send({type: "select", id: null}).catch(() => {})
      }
    },
  }
}
