import { mock, test } from 'claude-code/testing'

const log = (s: string) => (globalThis as unknown as { console: { log: (s: string) => void } }).console.log(s)
const band = (isWorking: boolean) => ({
  plugin: 'live-work', component: 'AbovePrompt', surface: 'terminal',
  props: { hasSurvey: false, isCollapsed: false, isWorking, maxRows: 40, bodyColumns: 96, scroll: { offset: 0, bodyRows: 40 } },
}) as never

type Run = { t: string; c?: string; b?: boolean; d?: boolean; i?: boolean }
function rowsOf(tree: unknown): Run[][] {
  const out: Run[][] = []
  const flat = (n: unknown, st: Omit<Run, 't'>, acc: Run[]) => {
    if (typeof n === 'string' || typeof n === 'number') { acc.push({ t: String(n), ...st }); return }
    if (!n || typeof n !== 'object') return
    const el = n as { type?: string; props?: Record<string, unknown>; children?: unknown[] }
    const p = el.props ?? {}
    const s2 = { ...st, ...(p.color ? { c: String(p.color) } : {}), ...(p.bold ? { b: true } : {}), ...(p.dimColor ? { d: true } : {}), ...(p.italic ? { i: true } : {}) }
    for (const ch of el.children ?? (p.children !== undefined ? [p.children as unknown].flat() : [])) flat(ch, s2, acc)
  }
  const root = tree as { type?: string; props?: Record<string, unknown>; children?: unknown[] }
  const kids = root.children ?? []
  const isCol = root.type === 'Box' && (root.props?.flexDirection === 'column')
  if (isCol) for (const k of kids) { const acc: Run[] = []; flat(k, {}, acc); out.push(acc) }
  else { const acc: Run[] = []; flat(root, {}, acc); out.push(acc) }
  return out
}

async function scene($: any, on: any, name: string, opts: { aura?: string; frames: number; fail?: boolean; done?: boolean; releaseAt?: number }) {
  const clock = mock.clock(on)
  const holds: Record<string, () => void> = {}
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  on('prompt.submit', (_: unknown, e: any) => ({ text: e.text }))
  on('command.run', (_: unknown) => ({ text: '' }))
  on('tool.call', async (_: unknown, e: any) => {
    const key = e.file_path ?? e.description ?? e.pattern
    if (key && (key.endsWith?.('app.ts') && e.tool === 'Edit' || key === 'Run tests')) await new Promise<void>(r => (holds[key] = r))
    if (opts.fail && e.tool === 'Bash') return { result: {}, isError: true }
    return { result: {} }
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  if (opts.aura) await $.command.run({ command: 'aura', args: opts.aura } as never)
  await $.prompt.submit({ text: 'go' } as never)
  await $.tool.call({ tool: 'Read', file_path: '/home/me/project/README.md' })
  await $.tool.call({ tool: 'Grep', pattern: 'handleLogin' })
  await $.tool.call({ tool: 'Read', file_path: '/home/me/project/src/auth.ts' })
  await $.tool.call({ tool: 'WebSearch', query: 'jwt refresh token rotation' })
  const p1 = $.tool.call({ tool: 'Bash', command: 'npm test', description: 'Run tests' })
  await clock.advance(330)
  const p2 = $.tool.call({ tool: 'Edit', file_path: '/home/me/project/src/app.ts', old_string: 'a', new_string: 'b' })
  await clock.advance(220)
  const ui = await $.ui.mount(band(!opts.done))
  if (opts.done) { holds['Run tests']?.(); holds['/home/me/project/src/app.ts']?.(); await p1; await p2 }
  for (let f = 0; f < opts.frames; f++) {
    if (opts.releaseAt === f) holds['Run tests']?.()
    log('CAP:' + JSON.stringify({ scene: name, frame: f, rows: rowsOf(await ui.drawn()) }))
    await clock.advance(110)
  }
  await ui.unmount()
  for (const k in holds) holds[k]!()
  await p1; await p2
}

test('hero', async ($, on) => { await scene($, on, 'hero', { frames: 40, releaseAt: 18 }) })
for (const a of ['violet', 'ocean', 'sunset', 'matrix', 'gold', 'ice', 'fire', 'rainbow'])
  test('aura-' + a, async ($, on) => { await scene($, on, 'aura-' + a, { aura: a, frames: 7 }) })
test('fail', async ($, on) => { await scene($, on, 'fail', { frames: 3, fail: true, releaseAt: 0 }) })
test('done', async ($, on) => { await scene($, on, 'done', { frames: 1, done: true }) })
