// Minimal CDP client: eval JS in the dsh page inside the shell, no deps.
// Usage: node cdp-probe.mjs <eval-file.js>
const [, , file] = process.argv
const expr = (await import('node:fs')).readFileSync(file, 'utf8')

const list = await (await fetch('http://127.0.0.1:9333/json/list')).json()
const page = list.find((t) => t.type === 'page' && t.url.includes('127.0.0.1:3080'))
if (!page) { console.log('PAGES:', JSON.stringify(list.map((t) => [t.type, t.url.slice(0, 60)]))); process.exit(1) }

const ws = new WebSocket(page.webSocketDebuggerUrl)
ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true } }))
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id === 1) {
    const r = m.result
    if (r.exceptionDetails) console.log('EXC:', JSON.stringify(r.exceptionDetails).slice(0, 500))
    else console.log(typeof r.result.value === 'string' ? r.result.value : JSON.stringify(r.result.value))
    ws.close(); process.exit(0)
  }
}
setTimeout(() => { console.log('TIMEOUT'); process.exit(1) }, 15000)
