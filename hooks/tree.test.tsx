import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  plugin: 'live-work',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isCollapsed: false, isWorking: true, maxRows: 40, bodyColumns: 90, scroll: { offset: 0, bodyRows: 40 } },
} as const

test('files stay as boxes in a downward tree, joined to CLAUDE', async ($, on) => {
  const clock = mock.clock(on)
  let release: () => void = () => {}
  const hold = new Promise<void>(r => (release = r))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('tool.call', async (_, e) => {
    if ((e as { file_path?: string }).file_path?.endsWith('notes.md')) await hold
    return { result: {} }
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'go' } as never)
  await $.tool.call({ tool: 'Read', file_path: '/home/me/project/README.md' })
  await $.tool.call({ tool: 'Bash', command: 'ls', description: 'List files' })
  await $.tool.call({ tool: 'Read', file_path: '/home/me/project/src/app.ts' })
  const pending = $.tool.call({ tool: 'Edit', file_path: '/home/me/project/notes.md', old_string: 'a', new_string: 'b' })
  await clock.advance(1500)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' } as never)
  const rows = (await ui.findAll({ type: 'Text' })).map(t => t.text).filter(t => t.startsWith(' ') && t.length > 20)
  ;(globalThis as unknown as { console: { log: (s: string) => void } }).console.log('\n' + rows.join('\n'))
  expect(rows.some(r => r.includes('CLAUDE'))).toBe(true)
  expect(rows.some(r => r.includes('notes.md'))).toBe(true)
  expect(rows.some(r => r.includes('README.md'))).toBe(true)
  await ui.unmount()
  release()
  await pending
})
