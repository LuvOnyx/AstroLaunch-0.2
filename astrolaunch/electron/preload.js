const { contextBridge, ipcRenderer } = require("electron")

// ── General AstroLaunch bridge ─────────────────────────────────────────────
contextBridge.exposeInMainWorld("astrolaunch", {
  platform: process.platform,
  version:  "0.2.0",
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  on: (channel, fn) => {
    const listener = (_e, ...args) => fn(...args)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },
})

// ── Terminal bridge — used by TerminalPanel when running inside Electron ───
// In the web app this object does NOT exist (window.alTerminal === undefined),
// so TerminalPanel falls back to the WebSocket path automatically.
contextBridge.exposeInMainWorld("alTerminal", {
  /** Spawn a new shell. Returns a session id string. */
  create: (opts) => ipcRenderer.invoke("terminal:create", opts),

  /** Send raw keystrokes / paste data to the shell. */
  write: (id, data) => ipcRenderer.invoke("terminal:write", { id, data }),

  /** Inform the PTY of a resize (cols × rows). */
  resize: (id, cols, rows) => ipcRenderer.invoke("terminal:resize", { id, cols, rows }),

  /** Kill the shell process and free the session. */
  kill: (id) => ipcRenderer.invoke("terminal:kill", { id }),

  /**
   * Subscribe to shell output.
   * Callback receives { id: string, data: string }.
   * Returns an unsubscribe function.
   */
  onData: (cb) => {
    const fn = (_e, msg) => cb(msg)
    ipcRenderer.on("terminal:data", fn)
    return () => ipcRenderer.removeListener("terminal:data", fn)
  },

  /**
   * Subscribe to shell exit.
   * Callback receives { id: string, code: number }.
   * Returns an unsubscribe function.
   */
  onExit: (cb) => {
    const fn = (_e, msg) => cb(msg)
    ipcRenderer.on("terminal:exit", fn)
    return () => ipcRenderer.removeListener("terminal:exit", fn)
  },
})
