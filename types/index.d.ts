export type Kind = 'read' | 'edit' | 'run' | 'search' | 'web' | 'tool'

/** One leaf in the tree: a file, or a job (command, search, web call, MCP call). */
export type Leaf = {
  id: string // file path, or a unique job id
  group: string // directory path, or 'terminal' | 'search' | 'web' | 'mcp:<server>' | ...
  label: string
  kind: Kind
  edits: number
  reads: number
  live: number // calls in flight on this leaf
  born: number // frame it appeared (grow-in animation)
  doneAt: number // frame its last call finished (-1 = never)
  err: boolean
}

export type View = {
  leaves: Leaf[]
  groupOrder: string[] // groups in the order they first appeared
  activity: string
  frame: number
  quiet: number // ticks since the last tool event (the clock stops when it gets large)
  calls: number
}

declare module 'claude-code' {
  interface PluginState {
    'live-work': { view: Shaped<View>; aura: Shaped<string> }
  }
}
