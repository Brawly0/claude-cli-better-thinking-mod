import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Kind, Leaf, View } from '../types'

// live-work v5: the downward tree of boxes (v4) wrapped in an aura.
// CLAUDE is the root; a bus line drops to one box per branch (folder, terminal,
// search, web, connector); files touched this turn stack under their branch.
// New in v5:
//   • aura palettes: gradient colours that chase around live box borders
//   • aura wings: ripples breathing out from both sides of the CLAUDE box
//   • embers: sparks rising along the sides of every live box
//   • comet pulses: a 5-cell gradient tail runs the route out, green runs home
//   • done burst: sparkles pop at the corners of a box when its call finishes
//   • mood aura: colour follows the work (reading=ocean, editing=gold,
//     running=matrix, web=ice, error=fire); /aura <name> picks a fixed one

const EMPTY: View = { leaves: [], groupOrder: [], activity: '', frame: 0, quiet: 0, calls: 0 }
const view = atom({ plugin: 'live-work', key: 'view' } as const, EMPTY, { shape: 'view-2' })
const auraPick = atom({ plugin: 'live-work', key: 'aura' } as const, 'mood', { shape: 'aura-1' })

const TICK = 110 // ms per frame
const FLASH = 9 // frames a finished box glows / the return pulse runs
const JOBS_PER_GROUP = 3
const MIN_COL = 18
const MAX_COL = 28
const MAX_FILES = 3
const TAIL = 5 // comet length

const ICON: Record<Kind, string> = { read: '◉', edit: '✎', run: '❯', search: '⌕', web: '◍', tool: '◆' }
const COLOR: Record<Kind, string> = { read: 'cyan', edit: 'yellow', run: 'green', search: 'magenta', web: 'blue', tool: 'white' }
const SPIN = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
const STAR = '✦✧✶✷✸✹✸✷✶✧'

// ── aura colours ───────────────────────────────────────────────────────────
type Pal = string[]
const hsl = (h: number, s: number, l: number): string => {
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const ch = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))
  return toHex(ch(0) * 255, ch(8) * 255, ch(4) * 255)
}
const toHex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('')
const rgb = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]

const PALETTES: Record<string, Pal> = {
  violet: ['#7c3aed', '#a855f7', '#e879f9', '#f0abfc', '#c084fc'],
  ocean: ['#0284c7', '#22d3ee', '#67e8f9', '#38bdf8', '#6366f1'],
  sunset: ['#f97316', '#fb7185', '#f472b6', '#facc15', '#fb923c'],
  matrix: ['#15803d', '#22c55e', '#4ade80', '#bbf7d0', '#16a34a'],
  gold: ['#d97706', '#fbbf24', '#fde047', '#fef3c7', '#f59e0b'],
  ice: ['#93c5fd', '#e0f2fe', '#a5f3fc', '#c7d2fe', '#7dd3fc'],
  fire: ['#b91c1c', '#ef4444', '#f97316', '#facc15', '#dc2626'],
  rainbow: Array.from({ length: 12 }, (_, i) => hsl(i * 30, 0.9, 0.62)),
}
const AURAS = ['mood', ...Object.keys(PALETTES)]
const KIND_PAL: Record<Kind, Pal> = {
  read: PALETTES.ocean!, edit: PALETTES.gold!, run: PALETTES.matrix!, search: PALETTES.violet!, web: PALETTES.ice!, tool: PALETTES.sunset!,
}

// a colour at t (0..1, wraps) along a looping gradient
function grad(pal: Pal, t: number): string {
  const n = pal.length
  const x = (((t % 1) + 1) % 1) * n
  const i = Math.floor(x) % n
  const a = rgb(pal[i]!)
  const b = rgb(pal[(i + 1) % n]!)
  const k = x - Math.floor(x)
  return toHex(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k)
}
const darken = (hex: string, k: number) => {
  const [r, g, b] = rgb(hex)
  return toHex(r * k, g * k, b * k)
}
const hash = (s: string) => {
  let h = 7
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

// ── describing tool calls ──────────────────────────────────────────────────
const segs = (p: string) => p.split(/[\\/]/).filter(Boolean)
const base = (p: string) => segs(p).pop() ?? p
const dirOf = (p: string) => segs(p).slice(0, -1).join('/')
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, Math.max(1, n - 1)) + '…' : s)
const str = (x: unknown) => (typeof x === 'string' ? x : '')
const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim()

function dirLabel(group: string): string {
  const s = segs(group)
  if (s.length === 0) return '/'
  return s.slice(-2).join('/')
}

let seq = 0

function describe(e: Record<string, unknown>): { id: string; group: string; label: string; kind: Kind; activity: string; file: boolean } {
  const t = str(e.tool)
  const fp = str(e.file_path) || str(e.notebook_path)
  if (fp) {
    const edit = /^(Edit|Write|NotebookEdit|MultiEdit)$/.test(t)
    return { id: fp, group: dirOf(fp), label: base(fp), kind: edit ? 'edit' : 'read', activity: `${edit ? 'Editing' : 'Reading'} ${base(fp)}`, file: true }
  }
  const job = (group: string, kind: Kind, label: string, activity: string) => ({ id: `${group}#${++seq}`, group, label, kind, activity, file: false })
  if (t === 'Bash' || t === 'PowerShell') {
    const what = oneLine(str(e.description) || str(e.command))
    return job('terminal', 'run', what || t, `Running: ${what}`)
  }
  if (t === 'Grep' || t === 'Glob') return job('search', 'search', str(e.pattern) || t, `Searching ${str(e.pattern)}`)
  if (t === 'WebFetch' || t === 'WebSearch') {
    const w = str(e.url) || str(e.query)
    return job('web', 'web', w || t, `On the web: ${w}`)
  }
  if (t.startsWith('mcp__')) {
    const [, server = 'mcp', name = ''] = t.split('__')
    return job(`mcp:${server}`, 'tool', name || server, `Using ${server}: ${name}`)
  }
  if (t === 'Agent') return job('agents', 'tool', oneLine(str(e.description)) || 'helper', `Helper agent: ${str(e.description)}`)
  return job('tools', 'tool', t, `Using ${t}`)
}

function groupHead(group: string): { text: string; color: string } {
  if (group === 'terminal') return { text: 'terminal', color: 'green' }
  if (group === 'search') return { text: 'search', color: 'magenta' }
  if (group === 'web') return { text: 'web', color: 'blue' }
  if (group === 'agents') return { text: 'helpers', color: 'white' }
  if (group === 'tools') return { text: 'tools', color: 'white' }
  if (group.startsWith('mcp:')) return { text: group.slice(4), color: 'white' }
  return { text: dirLabel(group), color: 'blue' }
}

// The palette in force: a fixed one, or (mood) one that follows the work.
function moodPal(pick: string, v: View): { pal: Pal; name: string } {
  if (pick !== 'mood' && PALETTES[pick]) return { pal: PALETTES[pick]!, name: pick }
  const f = v.frame
  if (v.leaves.some(l => l.err && l.doneAt >= 0 && f - l.doneAt < 25)) return { pal: PALETTES.fire!, name: 'fire' }
  const live = v.leaves.filter(l => l.live > 0).sort((a, b) => b.born - a.born)[0]
  if (live) {
    const name = { read: 'ocean', edit: 'gold', run: 'matrix', search: 'violet', web: 'ice', tool: 'sunset' }[live.kind]
    return { pal: PALETTES[name]!, name }
  }
  return { pal: PALETTES.violet!, name: 'violet' }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    $.clock.every(TICK, () => {
      void update($, view, v => (v.quiet > 900 || (v.leaves.length === 0 && v.quiet > 40) ? v : { ...v, frame: v.frame + 1, quiet: v.quiet + 1 }))
    })
    const saved = await $.store.get('aura')
    if (typeof saved === 'string' && AURAS.includes(saved)) await update($, auraPick, () => saved)
    await $.command.register({ name: 'aura', description: 'Pick the live-work aura colour', argumentHint: `[${AURAS.join('|')}]` })
    return next(e)
  })

  on('command.run', { command: 'aura' }, async ($, e) => {
    const want = e.args.trim().toLowerCase()
    if (want === '') {
      let cur = 'mood'
      await update($, auraPick, a => ((cur = a), a))
      return { text: `Aura: ${cur}. Options: ${AURAS.join(', ')} (e.g. /aura sunset)` }
    }
    if (!AURAS.includes(want)) return { text: `Unknown aura "${want}". Options: ${AURAS.join(', ')}` }
    await update($, auraPick, () => want)
    await $.store.set('aura', want)
    return { text: `✦ Aura set to ${want}${want === 'mood' ? ' (colour follows what Claude is doing)' : ''}.` }
  })

  on('prompt.submit', async ($, e, next) => {
    await update($, view, () => EMPTY)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const d = describe(e as unknown as Record<string, unknown>)
    await update($, view, (v): View => {
      const has = v.leaves.find(x => x.id === d.id)
      const isEdit = d.kind === 'edit'
      const leaf: Leaf = has
        ? { ...has, kind: isEdit || has.kind === 'edit' ? 'edit' : has.kind, edits: has.edits + (isEdit ? 1 : 0), reads: has.reads + (isEdit ? 0 : 1), live: has.live + 1, err: false }
        : { id: d.id, group: d.group, label: d.label, kind: d.kind, edits: isEdit ? 1 : 0, reads: isEdit ? 0 : 1, live: 1, born: v.frame, doneAt: -1, err: false }
      let leaves = has ? v.leaves.map(x => (x.id === d.id ? leaf : x)) : [...v.leaves, leaf]
      if (!d.file) {
        const jobs = leaves.filter(x => x.group === d.group)
        if (jobs.length > JOBS_PER_GROUP) {
          const drop = new Set(jobs.filter(x => x.live === 0).slice(0, jobs.length - JOBS_PER_GROUP).map(x => x.id))
          leaves = leaves.filter(x => !drop.has(x.id))
        }
      }
      const groupOrder = v.groupOrder.includes(d.group) ? v.groupOrder : [...v.groupOrder, d.group]
      return { ...v, leaves, groupOrder, activity: d.activity, calls: v.calls + 1, quiet: 0 }
    })
    let failed = false
    try {
      const ran = await next(e)
      failed = ('isError' in ran && ran.isError === true) || ('deny' in ran && typeof ran.deny === 'string')
      return ran
    } catch (err) {
      failed = true
      throw err
    } finally {
      await update($, view, (v): View => ({
        ...v,
        quiet: 0,
        leaves: v.leaves.map(x => (x.id === d.id ? { ...x, live: Math.max(0, x.live - 1), doneAt: v.frame, err: failed } : x)),
      }))
    }
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const v = await read($, view)
    if (e.props.hasSurvey || (!e.props.isWorking && v.leaves.length === 0)) return next(e)
    const pick = await read($, auraPick)
    const { Box, Text } = $.ui.resolve(e)
    const width = Math.max(30, e.props.bodyColumns - 2)
    const f = v.frame
    const { pal, name: auraName } = moodPal(pick, v)

    // ── finished turn: one calm line with an aura-gradient "done" ─────────
    if (!e.props.isWorking) {
      const files = v.leaves.filter(l => !l.id.includes('#'))
      const edited = files.filter(l => l.kind === 'edit')
      const errs = v.leaves.filter(l => l.err).length
      const word = '✦ done'
      return (
        <Box>
          {word.split('').map((ch, i) => (
            <Text color={grad(errs > 0 ? PALETTES.fire! : PALETTES.matrix!, i / word.length + f / 30)} bold>
              {ch}
            </Text>
          ))}
          <Text dimColor>
            {' '}· {v.calls} steps · {files.length} files{errs > 0 ? ` · ${errs} failed` : ''}
            {edited.length > 0 ? ` · changed ${clip(edited.map(t => t.label).join(', '), width - 44)}` : ' · nothing changed'}
          </Text>
        </Box>
      )
    }

    // ── the character grid ────────────────────────────────────────────────
    type Style = { color?: string; bold?: boolean; dim?: boolean }
    type Cell = Style & { ch: string }
    const grid: Cell[][] = []
    const put = (r: number, c: number, ch: string, s: Style = {}) => {
      if (r < 0 || c < 0 || c >= width) return
      while (grid.length <= r) grid.push([])
      const line = grid[r]!
      while (line.length <= c) line.push({ ch: ' ' })
      line[c] = { ch, ...s }
    }
    const at = (r: number, c: number): Cell | undefined => grid[r]?.[c]
    const blank = (r: number, c: number) => {
      const cur = at(r, c)
      return !cur || cur.ch === ' '
    }
    const text = (r: number, c: number, s: string, st: Style = {}) => {
      for (let i = 0; i < s.length; i++) put(r, c + i, s[i]!, st)
    }
    // a bright band sweeping across a label; base colour per character
    const shimmerText = (r: number, c: number, s: string, colorAt: (i: number) => string, phase: number) => {
      const p = ((f + phase) % (s.length + 8)) - 4
      for (let i = 0; i < s.length; i++) {
        const lit = i >= p - 1 && i <= p + 1
        put(r, c + i, s[i]!, lit ? { color: 'whiteBright', bold: true } : { color: colorAt(i) })
      }
    }
    type BoxStyle = { heavy: boolean; color: string; dim?: boolean }
    const box = (r: number, x: number, w: number, st: BoxStyle, up: number | null, down: number | null) => {
      const H = st.heavy
        ? { tl: '┏', tr: '┓', bl: '┗', br: '┛', h: '━', v: '┃', u: '┷', d: '┯' }
        : { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│', u: '┴', d: '┬' }
      const s: Style = { color: st.color, dim: st.dim, bold: st.heavy }
      put(r, x, H.tl, s)
      put(r, x + w - 1, H.tr, s)
      put(r + 2, x, H.bl, s)
      put(r + 2, x + w - 1, H.br, s)
      for (let i = 1; i < w - 1; i++) {
        put(r, x + i, x + i === up ? H.u : H.h, s)
        put(r + 2, x + i, x + i === down ? H.d : H.h, s)
        put(r + 1, x + i, ' ')
      }
      put(r + 1, x, H.v, s)
      put(r + 1, x + w - 1, H.v, s)
    }
    // recolour a box's border with a gradient that chases around it
    const auraBorder = (r: number, x: number, w: number, p: Pal, speed: number) => {
      const cells: [number, number][] = []
      for (let i = 0; i < w; i++) cells.push([r, x + i])
      cells.push([r + 1, x + w - 1])
      for (let i = w - 1; i >= 0; i--) cells.push([r + 2, x + i])
      cells.push([r + 1, x])
      const n = cells.length
      cells.forEach(([rr, cc], i) => {
        const cur = at(rr, cc)
        if (cur) put(rr, cc, cur.ch, { color: grad(p, (i - f * speed) / n * 2), bold: true })
      })
    }
    // sparks rising in the gutters beside a box
    const embers = (top: number, x: number, w: number, p: Pal, seed: number) => {
      const sides = [x - 1, x + w]
      sides.forEach((col, s) => {
        for (let j = 0; j < 2; j++) {
          const ph = (f + seed + s * 3 + j * 2) % 6
          if (ph > 3) continue
          const row = top + 2 - ph
          if (!blank(row, col)) continue
          put(row, col, ['•', '∙', '·', '˙'][ph]!, { color: grad(p, ph / 4 + s * 0.3), bold: ph === 0 })
        }
      })
    }
    // sparkles popping at a box's corners when it finishes
    const burst = (top: number, x: number, w: number, since: number) => {
      const ch = since < 2 ? '✸' : since < 4 ? '✦' : since < 6 ? '✧' : '·'
      const col = grad(PALETTES.matrix!, since / FLASH)
      for (const [r, c] of [[top - 1, x - 1], [top - 1, x + w], [top + 3, x - 1], [top + 3, x + w]] as [number, number][]) {
        if (blank(r, c)) put(r, c, ch, { color: col, bold: since < 4 })
      }
    }

    const WIRE_ST: Style = { color: darken(grad(pal, f / 60), 0.5) }
    const PLAIN = new Set(['terminal', 'search', 'web', 'agents', 'tools'])

    // ── branches that fit side by side ────────────────────────────────────
    const groups = v.groupOrder.filter(g => v.leaves.some(l => l.group === g))
    const maxCols = Math.max(1, Math.floor((width + 2) / (MIN_COL + 2)))
    let shown = groups
    let folded = 0
    while (shown.length > maxCols) {
      const victim = shown.find(g => !v.leaves.some(l => l.group === g && l.live > 0)) ?? shown[0]!
      folded += v.leaves.filter(l => l.group === victim).length
      shown = shown.filter(g => g !== victim)
    }
    const n = Math.max(1, shown.length)
    const CW = Math.max(MIN_COL, Math.min(MAX_COL, Math.floor((width + 2) / n) - 2))
    const colsW = n * (CW + 2) - 2
    const RW = 16
    const TW = Math.max(colsW, RW + 12)
    const offX = Math.floor((TW - colsW) / 2)
    const rootX = Math.floor((TW - RW) / 2)
    const rc = rootX + Math.floor(RW / 2)
    const centers = shown.map((_, i) => offX + i * (CW + 2) + Math.floor(CW / 2))

    // ── root: the CLAUDE box with its aura ────────────────────────────────
    const liveLeaves = v.leaves.filter(l => l.live > 0)
    const edited = v.leaves.filter(l => l.kind === 'edit').length
    const homecoming = liveLeaves.length === 0 && v.leaves.some(l => l.doneAt >= 0 && f - l.doneAt < FLASH)
    const rootPal = homecoming ? PALETTES.matrix! : pal
    box(0, rootX, RW, { heavy: true, color: grad(rootPal, 0) }, null, shown.length > 0 ? rc : null)
    auraBorder(0, rootX, RW, rootPal, liveLeaves.length > 0 ? 1 : 0.4)
    const tx = rootX + Math.floor((RW - 10) / 2)
    put(1, tx, STAR.charAt(f % STAR.length), { color: grad(rootPal, f / 20), bold: true })
    shimmerText(1, tx + 2, 'CLAUDE', i => grad(rootPal, i / 6 + f / 30), 0)
    put(1, tx + 9, SPIN.charAt(f % 10), { color: grad(rootPal, 0.5 + f / 30) })

    // wings: ripples breathing outward on both sides
    const WING = 4
    const fast = liveLeaves.length > 0 ? 0.7 : 0.35
    for (let i = 0; i < WING; i++) {
      const wave = (Math.sin(f * fast - i * 1.1) + 1) / 2
      const ch = wave > 0.8 ? '●' : wave > 0.55 ? '•' : wave > 0.3 ? '∙' : '·'
      const st: Style = { color: grad(rootPal, i / WING + f / 40), bold: wave > 0.8, dim: wave < 0.3 }
      put(1, rootX - 2 - i, ch, st)
      put(1, rootX + RW + 1 + i, ch, st)
    }
    // twinkles at the root's outer corners
    const tw = f % 16
    if (tw < 6) put(0, rootX - 1 - (tw >> 1), STAR.charAt(tw), { color: grad(rootPal, 0.2) })
    if (tw >= 8 && tw < 14) put(2, rootX + RW + ((tw - 8) >> 1), STAR.charAt(tw - 8), { color: grad(rootPal, 0.7) })

    const stats = `${liveLeaves.length > 0 ? `${liveLeaves.length} live` : 'thinking'} · ${v.calls} steps${edited > 0 ? ` · ${edited} changed` : ''}${folded > 0 ? ` · ${folded} folded` : ''}`
    const sx = rootX + RW + 2 + WING + 1
    if (sx + stats.length + auraName.length + 4 <= width) {
      text(1, sx, stats, { dim: true })
      text(1, sx + stats.length + 2, `◈ ${auraName}`, { color: grad(pal, f / 25) })
    }

    // ── the bus ───────────────────────────────────────────────────────────
    const BUS = 3
    if (shown.length > 0) {
      const lo = Math.min(rc, ...centers)
      const hi = Math.max(rc, ...centers)
      for (let x = lo; x <= hi; x++) {
        const u = x === rc
        const d = centers.includes(x)
        const l = x > lo
        const r = x < hi
        const ch =
          u && d && l && r ? '┼' : u && d && r ? '├' : u && d && l ? '┤' : u && d ? '│' :
          d && l && r ? '┬' : u && l && r ? '┴' : d && r ? '┌' : d && l ? '┐' : u && r ? '└' : u && l ? '┘' : '─'
        put(BUS, x, ch, WIRE_ST)
      }
    }

    // ── branches ──────────────────────────────────────────────────────────
    type Route = { cells: [number, number][]; pal: Pal; mode: 'send' | 'recv'; t: number }
    const routes: Route[] = []
    const after: (() => void)[] = [] // embers + bursts, drawn once every box is down
    const G = BUS + 1
    shown.forEach((g, gi) => {
      const x = offX + gi * (CW + 2)
      const c = centers[gi]!
      const all = v.leaves.filter(l => l.group === g)
      const keep = new Set([...all.filter(l => l.live > 0), ...all.slice().reverse()].slice(0, MAX_FILES).map(l => l.id))
      const files = all.filter(l => keep.has(l.id))
      const hidden = all.length - files.length
      const head = groupHead(g)
      const live = all.some(l => l.live > 0)

      box(G, x, CW, { heavy: live, color: head.color, dim: !live }, c, files.length > 0 ? c : null)
      if (live) auraBorder(G, x, CW, pal, 0.8)
      const label = clip(`${PLAIN.has(g) || g.startsWith('mcp:') ? '' : '▸ '}${head.text}`, CW - 4)
      const lx = x + Math.floor((CW - label.length) / 2)
      if (live) shimmerText(G + 1, lx, label, i => grad(pal, i / label.length + f / 35), gi * 3)
      else text(G + 1, lx, label, { color: head.color, bold: true })

      files.forEach((l, k) => {
        const gap = G + 3 + k * 4
        const top = gap + 1
        put(gap, c, '│', WIRE_ST)
        const isLive = l.live > 0
        const sinceDone = l.doneAt < 0 ? 999 : f - l.doneAt
        const flashing = !isLive && !l.err && sinceDone < FLASH
        const color = l.err ? 'red' : COLOR[l.kind]
        const kp = l.err ? PALETTES.fire! : KIND_PAL[l.kind]
        const more = k < files.length - 1 || hidden > 0
        box(top, x, CW, {
          heavy: isLive,
          color: isLive ? color : flashing ? 'greenBright' : l.err ? 'red' : l.kind === 'edit' ? 'yellow' : 'gray',
          dim: !isLive && !flashing && !l.err && l.kind !== 'edit',
        }, c, more ? c : null)
        if (isLive) auraBorder(top, x, CW, kp, 1.6)
        else if (flashing) auraBorder(top, x, CW, PALETTES.matrix!, 2)

        const full = clip(l.label, CW - 8 - (l.edits > 1 ? 3 : 0)) + (l.edits > 1 ? ` ×${l.edits}` : '')
        const age = f - l.born
        const typed = age < 0 || age * 3 >= full.length ? full : full.slice(0, Math.max(1, age * 3))
        put(top + 1, x + 2, ICON[l.kind], { color: isLive ? grad(kp, f / 12) : color, bold: true })
        if (isLive) shimmerText(top + 1, x + 4, typed, i => grad(kp, i / typed.length + f / 25), k * 4)
        else text(top + 1, x + 4, typed, flashing ? { color: 'greenBright', bold: true } : l.kind === 'edit' ? { color: 'yellow' } : { dim: true })
        const status = isLive ? SPIN.charAt((f + k) % 10) : l.err ? '✗' : flashing ? (sinceDone < 3 ? '✦' : sinceDone < 6 ? '✧' : '✓') : '✓'
        put(top + 1, x + CW - 3, status, isLive ? { color: grad(kp, 0.5 + f / 15) } : l.err ? { color: 'red' } : flashing ? { color: 'greenBright', bold: true } : { color: 'green', dim: true })

        if (isLive) after.push(() => embers(top, x, CW, kp, hash(l.id) % 6))
        else if (flashing) after.push(() => burst(top, x, CW, sinceDone))

        if (isLive || flashing) {
          const cells: [number, number][] = [[BUS - 1, rc]]
          const step = c >= rc ? 1 : -1
          for (let bx = rc; bx !== c + step; bx += step) cells.push([BUS, bx])
          for (let j = 0; j <= k; j++) cells.push([G + 3 + j * 4, c])
          routes.push({ cells, pal: isLive ? kp : PALETTES.matrix!, mode: isLive ? 'send' : 'recv', t: isLive ? f + k * 3 + gi * 5 : sinceDone })
        }
      })
      if (hidden > 0) {
        const r = G + 3 + files.length * 4
        put(r, c, '┆', WIRE_ST)
        text(r, c + 2, `+${hidden} more`, { dim: true })
      }
    })
    if (liveLeaves.length > 0) embers(0, rootX - WING - 2, RW + 2 * WING + 4, rootPal, 0)
    after.forEach(fn => fn())

    // ── comet pulses: gradient tail out while live, green home when done ──
    const HEAVY: Record<string, string> = { '─': '━', '│': '┃', '┬': '┳', '┴': '┻', '├': '┣', '┤': '┫', '┼': '╋', '┌': '┏', '┐': '┓', '└': '┗', '┘': '┛', '┯': '┳' }
    const heavy = (ch: string) => HEAVY[ch] ?? ch
    for (const rt of routes) {
      const len = rt.cells.length
      rt.cells.forEach(([r, c], j) => {
        const cur = at(r, c)
        if (cur) put(r, c, cur.ch, { color: darken(grad(rt.pal, j / len - f / 40), 0.75) })
      })
      const speed = Math.max(1, Math.round(len / 9))
      const pos = rt.mode === 'send' ? (rt.t * speed) % (len + TAIL) : rt.t * speed
      const headAt = rt.mode === 'send' ? pos : len - 1 - pos
      const behind = rt.mode === 'send' ? -1 : 1
      for (let i = 0; i < TAIL; i++) {
        const idx = headAt + behind * i
        if (idx < 0 || idx >= len) continue
        const [r, c] = rt.cells[idx]!
        const cur = at(r, c)
        if (!cur) continue
        if (i === 0 && r !== BUS - 1) put(r, c, '●', { color: rt.mode === 'send' ? 'whiteBright' : 'greenBright', bold: true })
        else put(r, c, heavy(cur.ch), { color: grad(rt.pal, i / TAIL + f / 20), bold: i < 3, dim: i === TAIL - 1 })
      }
    }

    // ── grid → rows of styled runs ────────────────────────────────────────
    const lines = grid.map((cells, r) => {
      const runs: Cell[] = []
      for (const cell of cells) {
        const last = runs[runs.length - 1]
        if (last && last.color === cell.color && last.bold === cell.bold && last.dim === cell.dim) last.ch += cell.ch
        else runs.push({ ...cell })
      }
      return (
        <Text key={'r' + r}>
          {' '}
          {runs.map(run => (
            <Text color={run.color} bold={run.bold} dimColor={run.dim}>
              {run.ch}
            </Text>
          ))}
        </Text>
      )
    })

    const act = clip(oneLine(v.activity), width - 8)
    return (
      <Box flexDirection="column">
        {lines}
        {v.activity !== '' && (
          <Text>
            {'  '}
            <Text color={grad(pal, f / 20)} bold>↳ </Text>
            <Text dimColor italic>{act}</Text>
            <Text color={grad(pal, 0.5 + f / 20)}>{f % 8 < 4 ? ' ▌' : '  '}</Text>
          </Text>
        )}
      </Box>
    )
  })
}
