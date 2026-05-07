'use strict'
/**
 * AstroLaunch custom Next.js server
 * - Runs Next.js on port 5000
 * - WebSocket server at /api/terminal/ws  →  real node-pty shell per connection
 * - Falls back to child_process.spawn if node-pty is unavailable
 */
const http = require('http')
const { parse } = require('url')
const next = require('next')
const { spawn } = require('child_process')

// ── optional deps ──────────────────────────────────────────────────────────
let pty = null
try {
  pty = require('node-pty')
  console.log('  [terminal] node-pty loaded — full PTY support enabled')
} catch (e) {
  console.warn('  [terminal] node-pty unavailable, using basic shell fallback:', e.message)
}

let WebSocketServer = null
try {
  WebSocketServer = require('ws').WebSocketServer
  console.log('  [terminal] ws WebSocket server loaded')
} catch (e) {
  console.warn('  [terminal] ws unavailable — terminal WebSocket disabled:', e.message)
}

// ── config ─────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '5000', 10)
const HOST = '0.0.0.0'
const dev  = process.env.NODE_ENV !== 'production'

const app    = next({ dev, hostname: HOST, port: PORT })
const handle = app.getRequestHandler()

// ── boot ───────────────────────────────────────────────────────────────────
app.prepare().then(() => {
  const server = http.createServer(async (req, res) => {
    try {
      await handle(req, res, parse(req.url || '/', true))
    } catch (err) {
      console.error('[server] request error:', err)
      res.statusCode = 500
      res.end('Internal Server Error')
    }
  })

  // ── WebSocket terminal ───────────────────────────────────────────────────
  if (WebSocketServer) {
    const wss = new WebSocketServer({ noServer: true })

    wss.on('connection', (ws) => {
      const cwd = process.env.HOME || process.cwd()
      const env = {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        LANG: 'en_US.UTF-8',
        FORCE_COLOR: '3',
      }

      let handle = null   // { write(data), resize(cols,rows), kill() }

      if (pty) {
        // ── node-pty: full interactive PTY (colors, vim, htop, etc.) ──────
        try {
          const shell = pty.spawn('bash', ['--login'], {
            name: 'xterm-256color',
            cols: 100,
            rows: 24,
            cwd,
            env,
          })
          shell.onData((data) => {
            safeSend(ws, { type: 'output', data })
          })
          shell.onExit(({ exitCode }) => {
            safeSend(ws, { type: 'exit', code: exitCode })
          })
          handle = {
            write:  (d)    => { try { shell.write(d) }            catch {} },
            resize: (c, r) => { try { shell.resize(c, r) }        catch {} },
            kill:   ()     => { try { shell.kill() }              catch {} },
          }
        } catch (e) {
          console.error('[terminal] node-pty spawn failed:', e.message)
        }
      }

      if (!handle) {
        // ── fallback: basic child_process (no PTY, but functional) ────────
        safeSend(ws, {
          type: 'output',
          data: '\x1b[33m⚠ Running in compatibility mode (node-pty unavailable). Interactive programs may behave oddly.\x1b[0m\r\n',
        })
        const proc = spawn('bash', ['--login'], { cwd, env, stdio: 'pipe' })
        proc.stdout.on('data', (d) => safeSend(ws, { type: 'output', data: d.toString() }))
        proc.stderr.on('data', (d) => safeSend(ws, { type: 'output', data: d.toString() }))
        proc.on('exit', (code)  => safeSend(ws, { type: 'exit', code: code ?? 0 }))
        proc.on('error', (err)  => safeSend(ws, { type: 'output', data: `\x1b[31mShell error: ${err.message}\x1b[0m\r\n` }))
        handle = {
          write:  (d) => { try { proc.stdin.write(d) } catch {} },
          resize: ()  => {},
          kill:   ()  => { try { proc.kill() }         catch {} },
        }
      }

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString())
          if (msg.type === 'input')  handle.write(msg.data)
          if (msg.type === 'resize') handle.resize(msg.cols || 100, msg.rows || 24)
        } catch {}
      })

      ws.on('close', () => handle?.kill())
      ws.on('error', (e) => console.error('[terminal] ws error:', e.message))
    })

    // Only intercept our terminal path — let Next.js HMR handle the rest
    server.on('upgrade', (req, socket, head) => {
      const url = req.url || ''
      if (url === '/api/terminal/ws' || url.startsWith('/api/terminal/ws?')) {
        wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
      }
    })
  }

  server.listen(PORT, HOST, (err) => {
    if (err) throw err
    const line = `\x1b[1;32m> AstroLaunch ready\x1b[0m  →  http://localhost:${PORT}`
    console.log('\n' + line)
    if (WebSocketServer) console.log(`  [terminal] WebSocket at ws://localhost:${PORT}/api/terminal/ws`)
  })
}).catch((err) => {
  console.error('[server] startup failed:', err)
  process.exit(1)
})

function safeSend(ws, obj) {
  try {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj))
  } catch {}
}
