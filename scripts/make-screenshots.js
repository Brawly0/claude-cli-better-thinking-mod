const fs = require('fs')
const L = fs.readFileSync(process.argv[2], 'utf8').split(/\r?\n/).filter(l => l.startsWith('CAP:')).map(l => JSON.parse(l.slice(4)))
const OUT = process.argv[3]
const NAMED = { cyan: '#39c5cf', yellow: '#e3b341', green: '#3fb950', magenta: '#bc8cff', blue: '#58a6ff', white: '#e6edf3', gray: '#8b949e', red: '#f85149', greenBright: '#56d364', whiteBright: '#ffffff', redBright: '#ff7b72' }
const FG = '#c9d1d9', BG = '#0d1117', CW = 8.4, LH = 18, FS = 14
const col = c => (c ? NAMED[c] || c : FG)
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const simple = ch => ch.charCodeAt(0) < 128 || (ch >= '\u2500' && ch <= '\u257f')
function frameSvg(rows, r0 = 0, r1 = rows.length, padX = 0) {
  let out = ''
  rows.slice(r0, r1).forEach((runs, ri) => {
    const y = (ri + 1) * LH - 4
    let c = 0, parts = ''
    const emit = (t, st, cc) => {
      if (t.trim() === '') return
      const a = [`x="${(padX + cc * CW).toFixed(1)}"`]
      const n = [...t].length
      if (n > 1) a.push(`textLength="${(n * CW).toFixed(1)}" lengthAdjust="spacingAndGlyphs"`)
      const fill = col(st.c)
      if (fill !== FG) a.push(`fill="${fill}"`)
      if (st.b) a.push('font-weight="700"')
      if (st.d) a.push('opacity=".45"')
      if (st.i) a.push('font-style="italic"')
      parts += `<tspan ${a.join(' ')}>${esc(t)}</tspan>`
    }
    for (const r of runs) {
      const chars = [...r.t]
      let buf = '', start = c
      const flush = () => { if (buf) emit(buf, r, start); buf = '' }
      for (const ch of chars) {
        if (simple(ch)) { if (!buf) start = c; buf += ch }
        else { flush(); emit(ch, r, c) }
        c++
      }
      flush()
    }
    if (parts) out += `<text y="${y}" xml:space="preserve">${parts}</text>`
  })
  return out
}
function windowSvg({ w, h, title, body, css = '' }) {
  const W = w + 32, H = h + 56
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<style>text{font-family:"Cascadia Mono","SF Mono",Menlo,Consolas,"DejaVu Sans Mono","Liberation Mono",monospace;font-size:${FS}px;fill:${FG}}${css}</style>
<rect width="${W}" height="${H}" rx="10" fill="${BG}" stroke="#30363d"/>
<rect width="${W}" height="34" rx="10" fill="#161b22"/><rect y="24" width="${W}" height="10" fill="#161b22"/>
<circle cx="20" cy="17" r="6" fill="#ff5f57"/><circle cx="40" cy="17" r="6" fill="#febc2e"/><circle cx="60" cy="17" r="6" fill="#28c840"/>
<text x="${W / 2}" y="22" text-anchor="middle" style="font-size:12px;fill:#8b949e">${esc(title)}</text>
<g transform="translate(16,44)">${body}</g></svg>`
}
function animated(frames, opts) {
  const n = frames.length, T = opts.ms / 1000, D = (n * T).toFixed(2), pct = (100 / n).toFixed(4)
  const css = `.f{opacity:0;animation:k ${D}s step-end infinite}@keyframes k{0%{opacity:1}${pct}%{opacity:0}100%{opacity:0}}` +
    frames.map((_, i) => `.f${i}{animation-delay:${(i * T).toFixed(2)}s}`).join('')
  // first frame visible as fallback for viewers without CSS animation
  const body = frames.map((rows, i) => `<g class="f f${i}">${frameSvg(rows, opts.r0, opts.r1, opts.padX || 0)}</g>`).join('\n')
  return { css, body }
}
const scene = s => L.filter(x => x.scene === s).sort((a, b) => a.frame - b.frame).map(x => x.rows)
const cols = rows => Math.max(...rows.map(r => r.reduce((n, x) => n + [...x.t].length, 0)))

// 1. hero
{
  const fr = scene('hero')
  const { css, body } = animated(fr, { ms: 110 })
  const w = Math.ceil(cols(fr[0]) * CW), h = fr[0].length * LH + 6
  fs.writeFileSync(`${OUT}/hero.svg`, windowSvg({ w, h, title: 'claude  ·  live-work', body, css }))
}
// 2. aura gallery: CLAUDE box strip per aura, animated
{
  const names = ['violet', 'ocean', 'sunset', 'matrix', 'gold', 'ice', 'fire', 'rainbow']
  const strips = names.map(n => scene('aura-' + n))
  const nF = Math.min(...strips.map(s => s.length))
  const T = 0.11, D = (nF * T).toFixed(2), pct = (100 / nF).toFixed(4)
  let css = `.f{opacity:0;animation:k ${D}s step-end infinite}@keyframes k{0%{opacity:1}${pct}%{opacity:0}100%{opacity:0}}`
  for (let i = 0; i < nF; i++) css += `.f${i}{animation-delay:${(i * T).toFixed(2)}s}`
  const r0 = 0, r1 = 3, rowH = 3 * LH + 22
  let body = ''
  // crop columns ~ 30..80 of the 96-col frame: shift left
  const shift = -28 * CW
  names.forEach((n, k) => {
    const cx = (k % 2) * 430, cy = Math.floor(k / 2) * rowH
    body += `<g transform="translate(${cx},${cy})"><text x="0" y="12" style="font-size:12px;fill:#8b949e">/aura ${n}</text><svg x="0" y="16" width="420" height="${3 * LH + 2}" viewBox="${-shift} 0 420 ${3 * LH + 2}" overflow="hidden">`
    for (let i = 0; i < nF; i++) body += `<g class="f f${i}">${frameSvg(strips[k][i], r0, r1)}</g>`
    body += `</svg></g>`
  })
  fs.writeFileSync(`${OUT}/auras.svg`, windowSvg({ w: 850, h: 4 * rowH - 10, title: '/aura  ·  pick a colour', body, css }))
}
// 3. failure frame, static
{
  const rows = scene('fail').at(-1)
  const w = Math.ceil(cols(rows) * CW), h = rows.length * LH + 6
  fs.writeFileSync(`${OUT}/error.svg`, windowSvg({ w, h, title: 'a failed step turns the aura red', body: frameSvg(rows) }))
}
// 4. done line
{
  const rows = scene('done')[0]
  const w = Math.max(560, Math.ceil(cols(rows) * CW) + 20)
  fs.writeFileSync(`${OUT}/done.svg`, windowSvg({ w, h: LH + 8, title: 'end of turn', body: frameSvg(rows) }))
}
for (const f of fs.readdirSync(OUT)) console.log(f, (fs.statSync(`${OUT}/${f}`).size / 1024).toFixed(0) + ' KB')
