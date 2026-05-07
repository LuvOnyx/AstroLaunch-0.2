const { app, BrowserWindow, shell, session, ipcMain } = require("electron")
const path    = require("path")
const crypto  = require("crypto")

const isDev = !app.isPackaged

// ── node-pty (optional — falls back to child_process) ─────────────────────
let pty = null
try { pty = require("node-pty"); console.log("[electron] node-pty loaded") }
catch (e) { console.warn("[electron] node-pty unavailable:", e.message) }

// ── active terminal sessions keyed by UUID ─────────────────────────────────
const termSessions = new Map()

// ── register terminal IPC handlers once ────────────────────────────────────
function registerTerminalHandlers(win) {
  // Create a new shell session — returns session id
  ipcMain.handle("terminal:create", (_e, { cols = 100, rows = 24 } = {}) => {
    const id  = crypto.randomUUID()
    const cwd = process.env.HOME || process.cwd()
    const env = { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor", LANG: "en_US.UTF-8" }

    const sendData = (data) => { try { win.webContents.send("terminal:data", { id, data }) } catch {} }
    const sendExit = (code) => { try { win.webContents.send("terminal:exit", { id, code  }) } catch {} }

    let handle = null

    if (pty) {
      try {
        const sh = pty.spawn("bash", ["--login"], { name: "xterm-256color", cols, rows, cwd, env })
        sh.onData(sendData)
        sh.onExit(({ exitCode }) => sendExit(exitCode))
        handle = {
          write:  (d)    => { try { sh.write(d) }         catch {} },
          resize: (c, r) => { try { sh.resize(c, r) }     catch {} },
          kill:   ()     => { try { sh.kill() }            catch {} },
        }
      } catch (e) {
        console.error("[terminal] pty spawn failed:", e.message)
      }
    }

    if (!handle) {
      const { spawn } = require("child_process")
      const proc = spawn("bash", ["--login"], { cwd, env, stdio: "pipe" })
      proc.stdout.on("data", (d) => sendData(d.toString()))
      proc.stderr.on("data", (d) => sendData(d.toString()))
      proc.on("exit", (code) => sendExit(code ?? 0))
      sendData("\x1b[33m⚠ Compatibility mode — node-pty unavailable.\x1b[0m\r\n")
      handle = {
        write:  (d) => { try { proc.stdin.write(d) } catch {} },
        resize: ()  => {},
        kill:   ()  => { try { proc.kill() }         catch {} },
      }
    }

    termSessions.set(id, handle)
    return id
  })

  ipcMain.handle("terminal:write",  (_e, { id, data })       => { termSessions.get(id)?.write(data) })
  ipcMain.handle("terminal:resize", (_e, { id, cols, rows }) => { termSessions.get(id)?.resize(cols, rows) })
  ipcMain.handle("terminal:kill",   (_e, { id })             => {
    termSessions.get(id)?.kill()
    termSessions.delete(id)
  })
}

// ── window factory ─────────────────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width:        1600,
    height:       1000,
    minWidth:     1200,
    minHeight:    720,
    backgroundColor: "#0c0c10",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration:  false,
      preload: path.join(__dirname, "preload.js"),
      webSecurity: true,
    },
  })

  registerTerminalHandlers(win)

  if (isDev) {
    win.loadURL("http://localhost:5000")
  } else {
    win.loadFile(path.join(__dirname, "..", ".next", "server", "app", "index.html"))
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: "deny" }
  })

  return win
}

// ── app lifecycle ──────────────────────────────────────────────────────────
app.whenReady().then(() => {
  // COEP/COOP headers — needed for certain browser APIs
  session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
    cb({
      responseHeaders: {
        ...details.responseHeaders,
        "Cross-Origin-Embedder-Policy": ["require-corp"],
        "Cross-Origin-Opener-Policy":   ["same-origin"],
      },
    })
  })

  createWindow()
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on("window-all-closed", () => {
  // Kill all orphaned shells on exit
  termSessions.forEach((h) => { try { h.kill() } catch {} })
  termSessions.clear()
  if (process.platform !== "darwin") app.quit()
})
