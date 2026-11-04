// Gera assets/pulso.svg a partir do calendário de contribuições do GitHub.
// Corre todos os dias pela Action .github/workflows/pulso.yml.
// Local: GH_TOKEN=... LOGIN=SimaoCampanicoDev node pulso/pulso.mjs
import fs from 'node:fs'
import path from 'node:path'
import opentype from 'opentype.js'

const LOGIN = process.env.LOGIN || 'SimaoCampanicoDev'
const TOKEN = process.env.GH_TOKEN
const SAIDA = process.env.SAIDA || 'assets/pulso.svg'
/* ----------------------------- Os dados ----------------------------- */
// Com token usa a API GraphQL; sem token lê a página pública do calendário.
async function pelaApi() {
  const consulta = `query($login:String!){user(login:$login){contributionsCollection{contributionCalendar{totalContributions weeks{contributionDays{date contributionCount}}}}}}`
  const r = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'pulso-readme' },
    body: JSON.stringify({ query: consulta, variables: { login: LOGIN } }),
  })
  const json = await r.json()
  if (!json.data?.user) throw new Error('GraphQL: ' + JSON.stringify(json.errors || json))
  return json.data.user.contributionsCollection.contributionCalendar
}
async function pelaPagina() {
  const html = await (await fetch(`https://github.com/users/${LOGIN}/contributions`, { headers: { 'User-Agent': 'pulso-readme' } })).text()
  const contas = new Map()
  for (const m of html.matchAll(/for="(contribution-day-component-[\d-]+)"[^>]*>\s*(No|[\d,]+) contribution/g))
    contas.set(m[1], m[2] === 'No' ? 0 : Number(m[2].replace(/,/g, '')))
  const lista = [...html.matchAll(/data-date="(\d{4}-\d{2}-\d{2})" id="(contribution-day-component-[\d-]+)"/g)]
    .map(m => ({ date: m[1], contributionCount: contas.get(m[2]) ?? 0 }))
    .sort((a, b) => a.date.localeCompare(b.date))
  if (!lista.length) throw new Error('A página do calendário mudou de formato')
  const weeks = []
  for (const d of lista) {
    if (!weeks.length || new Date(d.date + 'T00:00:00Z').getUTCDay() === 0) weeks.push({ contributionDays: [] })
    weeks.at(-1).contributionDays.push(d)
  }
  return { totalContributions: lista.reduce((s, d) => s + d.contributionCount, 0), weeks }
}
const cal = TOKEN ? await pelaApi() : await pelaPagina()
const semanas = cal.weeks.map(w => w.contributionDays)
const dias = semanas.flat()

// Sequência atual: um dia sem nada só a parte se não for hoje (o dia ainda não acabou).
let atual = 0
for (let i = dias.length - 1; i >= 0; i--) {
  if (dias[i].contributionCount > 0) atual++
  else if (i === dias.length - 1) continue
  else break
}
let maior = 0, corrida = 0
for (const d of dias) { corrida = d.contributionCount > 0 ? corrida + 1 : 0; maior = Math.max(maior, corrida) }

/* ------------------------- As letras em caminhos ------------------------- */
const UA = 'Mozilla/5.0 (Windows NT 6.1) AppleWebKit/534.30 (KHTML, like Gecko) Safari/534.30'
const LETRAS = ' ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,:·-'
async function baixar(familia) {
  const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${familia}&text=${encodeURIComponent(LETRAS)}`, { headers: { 'User-Agent': UA } })).text()
  const url = css.match(/url\((https:[^)]+)\)/)?.[1]
  if (!url) throw new Error('Sem fonte para ' + familia)
  const buf = await (await fetch(url)).arrayBuffer()
  return opentype.parse(buf)
}
const [bri, g5, g6] = await Promise.all([
  baixar('Bricolage+Grotesque:wght@800'), baixar('Geist:wght@500'), baixar('Geist:wght@600'),
])
const largura = (f, t, s, ls = 0) => [...t].reduce((w, c) => w + f.charToGlyph(c).advanceWidth * s / f.unitsPerEm + ls, 0) - ls
function texto(f, t, x, y, s, { ls = 0, ancora = 'start' } = {}) {
  const w = largura(f, t, s, ls)
  let cx = ancora === 'end' ? x - w : ancora === 'middle' ? x - w / 2 : x
  let d = ''
  for (const c of t) { const g = f.charToGlyph(c); d += g.getPath(cx, y, s).toPathData(2); cx += g.advanceWidth * s / f.unitsPerEm + ls }
  return { d, w }
}

/* ------------------------------ O desenho ------------------------------ */
const W = 880, PAD = 22, PASSO = (W - PAD * 2 + 3) / 53, CEL = PASSO - 3
const TOPO = 108, H = TOPO + PASSO * 7 + 42
const fmt = n => n.toLocaleString('en-US')
const numeros = [
  [fmt(cal.totalContributions), 'CONTRIBUTIONS · 12 MONTHS', '#f5f5f6'],
  [`${atual} ${atual === 1 ? 'day' : 'days'}`, 'CURRENT STREAK', '#ff9a5a'],
  [`${maior} ${maior === 1 ? 'day' : 'days'}`, 'LONGEST STREAK', '#f5f5f6'],
]
let x = PAD
const topo = numeros.map(([v, rot, cor]) => {
  const a = texto(bri, v, x, PAD + 30, 30, { ls: -0.9 })
  const b = texto(g6, rot, x, PAD + 52, 11, { ls: 1.54 })
  x += Math.max(a.w, b.w) + 40
  return `<path d="${a.d}" fill="${cor}"/><path d="${b.d}" fill="#949494"/>`
}).join('')

// Os tons seguem os quartis dos dias com contribuições, como o GitHub faz.
const contas = dias.map(d => d.contributionCount).filter(n => n > 0).sort((a, b) => a - b)
const q = p => contas.length ? contas[Math.min(contas.length - 1, Math.floor(contas.length * p))] : 1
const [q1, q2, q3] = [q(.25), q(.5), q(.75)]
const tom = n => n === 0 ? '#1a1a1d' : n <= q1 ? '#4a2316' : n <= q2 ? '#8f3a18' : n <= q3 ? '#ff5a1f' : '#ffae2e'

const MESES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
let mesAnterior = -1
const rotulosDosMeses = []
const quadrados = semanas.map((sem, i) => {
  const cx = PAD + i * PASSO
  const m = new Date(sem[0].date + 'T00:00:00Z').getUTCMonth()
  if (m !== mesAnterior && i < 51) { rotulosDosMeses.push(texto(g5, MESES[m], cx, TOPO - 8, 10).d); mesAnterior = m }
  return sem.map(d => {
    const dia = new Date(d.date + 'T00:00:00Z').getUTCDay()
    const hoje = d === dias[dias.length - 1]
    return `<rect x="${cx.toFixed(2)}" y="${(TOPO + dia * PASSO).toFixed(2)}" width="${CEL.toFixed(2)}" height="${CEL.toFixed(2)}" rx="2.5" fill="${tom(d.contributionCount)}"${hoje ? ' class="hoje"' : ''}><title>${d.date}: ${d.contributionCount}</title></rect>`
  }).join('')
}).join('')

const legenda = (() => {
  const y = H - 18, tons = ['#1a1a1d', '#4a2316', '#8f3a18', '#ff5a1f', '#ffae2e']
  const mais = texto(g5, 'More', W - PAD, y + 9, 10, { ancora: 'end' })
  let cx = W - PAD - mais.w - 6 - tons.length * 14
  const menos = texto(g5, 'Less', cx - 6, y + 9, 10, { ancora: 'end' })
  const caixas = tons.map((t, i) => `<rect x="${cx + i * 14}" y="${y}" width="11" height="11" rx="2.5" fill="${t}"/>`).join('')
  const quando = texto(g5, `updated ${new Date().toISOString().slice(0, 10)}`, PAD, y + 9, 10)
  return `<path d="${menos.d}${mais.d}" fill="#7d8590"/>${caixas}<path d="${quando.d}" fill="#4d535b"/>`
})()

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H.toFixed(0)}" viewBox="0 0 ${W} ${H.toFixed(0)}" role="img" aria-label="${cal.totalContributions} contributions in the last 12 months. Current streak ${atual} days, longest streak ${maior} days.">
<style>.hoje{animation:bate 2.4s ease-in-out infinite}@keyframes bate{50%{opacity:.35}}@media (prefers-reduced-motion:reduce){.hoje{animation:none}}</style>
<rect width="${W}" height="${H.toFixed(0)}" rx="12" fill="#0a0a0b"/><rect x=".5" y=".5" width="${W - 1}" height="${(H - 1).toFixed(0)}" rx="11.5" fill="none" stroke="#fff" stroke-opacity=".08"/>
${topo}
<path d="${rotulosDosMeses.join('')}" fill="#7d8590"/>
${quadrados}
${legenda}
</svg>`

fs.mkdirSync(path.dirname(SAIDA), { recursive: true })
fs.writeFileSync(SAIDA, svg)
console.log(`${SAIDA}: ${cal.totalContributions} contributions, streak ${atual}, longest ${maior}`)
