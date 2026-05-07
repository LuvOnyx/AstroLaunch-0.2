"use client"
/**
 * TerminalPanel v6 — dual-mode terminal, correct cleanup
 *
 * • Electron: window.alTerminal IPC → node-pty in main process
 * • Web app:  WebSocket → /api/terminal/ws → node-pty in server.js
 *
 * Fixes vs v5:
 *   - Removed term.onDispose() call (not part of xterm.js v5 public API)
 *   - Connection handles (ws / shellId / IPC unsubs) stored in a ref Map,
 *     not in React state, so killSession can properly tear them down
 *   - React StrictMode: bootedIds entry removed on cleanup so the second
 *     (real) invocation can proceed normally
 */
import { useEffect, useRef, useState, useCallback } from "react"
import { db } from "@/lib/storage/db"
import { Button } from "@/components/ui/button"
import { AppIcon } from "@/lib/iconify"
import { cn } from "@/lib/utils"
import { nanoid } from "nanoid"

type XTerm    = import("@xterm/xterm").Terminal
type FitAddon = import("@xterm/addon-fit").FitAddon

interface Session {
  id:         string
  title:      string
  term?:      XTerm
  fit?:       FitAddon
  ready:      boolean
  connecting: boolean
}

/** Mutable connection state — kept outside React state to avoid re-renders */
interface ConnHandle {
  ws?:     WebSocket
  shellId?: string
  unsubs:  Array<() => void>
}

// ── Electron detection ────────────────────────────────────────────────────
function isElectron(): boolean {
  return typeof window !== "undefined" &&
    typeof (window as Record<string, unknown>).alTerminal !== "undefined"
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ipc = () => (window as any).alTerminal as {
  create  : (opts?: { cols?: number; rows?: number }) => Promise<string>
  write   : (id: string, data: string)                => Promise<void>
  resize  : (id: string, cols: number, rows: number)  => Promise<void>
  kill    : (id: string)                              => Promise<void>
  onData  : (cb: (msg: { id: string; data: string }) => void) => () => void
  onExit  : (cb: (msg: { id: string; code: number }) => void) => () => void
}

// ── xterm theme / options (shared) ────────────────────────────────────────
const THEME = {
  background:          "#0c0c10",
  foreground:          "#e4e4e7",
  cursor:              "#a78bfa",
  cursorAccent:        "#0c0c10",
  selectionBackground: "#3f3f4660",
  black:               "#1c1c26",
  red:                 "#f87171",
  green:               "#34d399",
  yellow:              "#fbbf24",
  blue:                "#818cf8",
  magenta:             "#c084fc",
  cyan:                "#22d3ee",
  white:               "#e4e4e7",
  brightBlack:         "#52525b",
  brightRed:           "#fca5a5",
  brightGreen:         "#6ee7b7",
  brightYellow:        "#fde68a",
  brightBlue:          "#a5b4fc",
  brightMagenta:       "#d8b4fe",
  brightCyan:          "#67e8f9",
  brightWhite:         "#f4f4f5",
}

// ─────────────────────────────────────────────────────────────────────────────
export function TerminalPanel() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const containerRef            = useRef<HTMLDivElement>(null)
  const sessionsRef             = useRef<Session[]>([])
  const bootedIds               = useRef(new Set<string>())
  const handles                 = useRef(new Map<string, ConnHandle>())

  useEffect(() => { sessionsRef.current = sessions }, [sessions])

  useEffect(() => { spawnSession() }, []) // eslint-disable-line

  // ── session management ─────────────────────────────────────────────────
  const spawnSession = useCallback(async () => {
    const id    = nanoid()
    const count = sessionsRef.current.length + 1
    const title = `Terminal ${count}`
    if (db) await db.terminals.add({ id, title, cwd: "/", createdAt: Date.now() }).catch(() => {})
    setSessions((p) => [...p, { id, title, ready: false, connecting: true }])
    setActiveId(id)
  }, [])

  const killSession = useCallback(async (id: string) => {
    // Tear down the backend connection
    const h = handles.current.get(id)
    if (h) {
      try { h.ws?.close() }        catch {}
      if (h.shellId) try { ipc().kill(h.shellId) } catch {}
      h.unsubs.forEach((fn) => { try { fn() } catch {} })
      handles.current.delete(id)
    }
    bootedIds.current.delete(id)

    // Dispose xterm
    const s = sessionsRef.current.find((x) => x.id === id)
    try { s?.term?.dispose() } catch {}

    if (db) await db.terminals.delete(id).catch(() => {})
    setSessions((p) => p.filter((x) => x.id !== id))
    setActiveId((prev) => {
      if (prev !== id) return prev
      const rest = sessionsRef.current.filter((x) => x.id !== id)
      return rest[0]?.id ?? null
    })
  }, [])

  // ── boot xterm + backend ─────────────────────────────────────────────
  useEffect(() => {
    if (!activeId) return
    const alreadyBooted = bootedIds.current.has(activeId)

    if (alreadyBooted) {
      // Refocus
      const s = sessionsRef.current.find((x) => x.id === activeId)
      if (s?.term) requestAnimationFrame(() => s.term?.focus())
      return
    }

    // Mark as booting immediately so the cleanup/re-run (React StrictMode)
    // sees it and skips; we remove the mark in cleanup so the *real* second
    // invocation (after StrictMode cleanup) can proceed.
    bootedIds.current.add(activeId)

    let dead = false
    const sid = activeId

    ;(async () => {
      try {
        const [{ Terminal }, { FitAddon }, { WebLinksAddon }] = await Promise.all([
          import("@xterm/xterm"),
          import("@xterm/addon-fit"),
          import("@xterm/addon-web-links"),
        ])
        if (dead) return

        const term = new Terminal({
          fontFamily:       'var(--font-mono), "JetBrains Mono", Menlo, monospace',
          fontSize:         13,
          lineHeight:       1.4,
          cursorBlink:      true,
          cursorStyle:      "block",
          allowProposedApi: true,
          scrollback:       10_000,
          convertEol:       false,
          theme:            THEME,
        })

        const fit = new FitAddon()
        term.loadAddon(fit)
        term.loadAddon(new WebLinksAddon())

        const el = containerRef.current?.querySelector<HTMLDivElement>(`[data-term="${sid}"]`)
        if (!el || dead) { term.dispose(); return }

        term.open(el)
        setTimeout(() => { try { fit.fit() } catch {} }, 30)
        term.write("\x1b[1;35m⌁ AstroLaunch Terminal\x1b[0m\r\n")

        // ── connect backend ────────────────────────────────────────────
        if (isElectron()) {
          await bootElectron(sid, term, fit, () => dead, handles.current)
        } else {
          await bootWebSocket(sid, term, fit, () => dead, handles.current)
        }

        if (dead) return

        setSessions((p) =>
          p.map((s) => s.id === sid
            ? { ...s, ready: true, connecting: false, term, fit }
            : s
          )
        )
        term.focus()

      } catch (err) {
        if (dead) return
        console.error("[TerminalPanel]", err)
        const el = containerRef.current?.querySelector<HTMLDivElement>(`[data-term="${sid}"]`)
        if (el) el.innerHTML = `<div style="color:#f87171;padding:8px;font-size:12px;font-family:monospace">Terminal error: ${String(err)}</div>`
        setSessions((p) =>
          p.map((s) => s.id === sid ? { ...s, connecting: false } : s)
        )
      }
    })()

    return () => {
      dead = true
      // Remove the boot marker so that React StrictMode's second invocation
      // (or a genuine retry) can boot the terminal properly.
      bootedIds.current.delete(sid)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, sessions.length])

  // ── global resize ──────────────────────────────────────────────────────
  useEffect(() => {
    const fitAll = () =>
      sessionsRef.current.forEach((s) => {
        if (s.ready && s.fit)
          requestAnimationFrame(() => { try { s.fit?.fit() } catch {} })
      })
    window.addEventListener("resize", fitAll)
    const ro = new ResizeObserver(fitAll)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => { window.removeEventListener("resize", fitAll); ro.disconnect() }
  }, [])

  // ── tab helpers ────────────────────────────────────────────────────────
  const switchTo = (id: string) => {
    setActiveId(id)
    requestAnimationFrame(() => {
      const s = sessionsRef.current.find((x) => x.id === id)
      if (s?.term) { s.term.focus(); try { s.fit?.fit() } catch {} }
    })
  }

  const clearActive = () => {
    const s = sessions.find((x) => x.id === activeId)
    s?.term?.clear(); s?.term?.focus()
  }

  // ── render ─────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col bg-[#0c0c10]">
      {/* tab bar */}
      <div className="h-8 flex items-center gap-1 px-2 border-b border-border bg-al-panel/60 flex-shrink-0">
        <AppIcon name="terminal" width={13} className="text-al-accent flex-shrink-0" />

        <div className="flex items-center gap-0.5 text-[11px] overflow-x-auto flex-1 min-w-0">
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => switchTo(s.id)}
              className={cn(
                "px-2 py-0.5 rounded flex items-center gap-1.5 group whitespace-nowrap flex-shrink-0 transition-colors",
                s.id === activeId
                  ? "bg-al-accent/20 text-foreground"
                  : "text-muted-foreground hover:bg-accent/20",
              )}
            >
              {s.id === activeId && s.ready && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
              )}
              {s.id === activeId && s.connecting && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
              )}
              {s.title}
              <span
                role="button"
                tabIndex={-1}
                onClick={(e) => { e.stopPropagation(); killSession(s.id) }}
                className="opacity-0 group-hover:opacity-50 hover:!opacity-100 hover:text-destructive transition-opacity ml-0.5"
              >
                <AppIcon name="close" width={10} />
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <Button size="icon-sm" variant="ghost" onClick={spawnSession} title="New terminal" className="h-6 w-6">
            <AppIcon name="plus" width={13} />
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={clearActive} title="Clear" className="h-6 w-6">
            <AppIcon name="refresh" width={13} />
          </Button>
        </div>
      </div>

      {/* terminal mount points */}
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden"
        onClick={() => sessions.find((s) => s.id === activeId)?.term?.focus()}
      >
        {sessions.map((s) => (
          <div
            key={s.id}
            data-term={s.id}
            className={cn("absolute inset-0 p-1", s.id === activeId ? "block" : "hidden")}
          />
        ))}
        {sessions.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <button
              onClick={spawnSession}
              className="px-2 py-1 bg-al-panel border border-border rounded hover:bg-al-panel/80 transition"
            >
              + New Terminal
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Electron IPC backend
// ─────────────────────────────────────────────────────────────────────────────
async function bootElectron(
  sid:    string,
  term:   XTerm,
  fit:    FitAddon,
  isDead: () => boolean,
  handles: Map<string, ConnHandle>,
) {
  term.write("\x1b[90mConnecting via IPC…\x1b[0m\r\n")
  try { fit.fit() } catch {}

  const api     = ipc()
  const shellId = await api.create({ cols: term.cols, rows: term.rows })
  if (isDead()) { api.kill(shellId); return }

  const unsubData = api.onData(({ id, data }) => { if (id === shellId) term.write(data) })
  const unsubExit = api.onExit(({ id, code }) => {
    if (id !== shellId) return
    term.write(`\r\n\x1b[1;33m[process exited: ${code}]\x1b[0m\r\n`)
    term.write("\x1b[90mClose this tab or open a new one.\x1b[0m\r\n")
  })

  handles.set(sid, { shellId, unsubs: [unsubData, unsubExit] })

  term.onData((d)           => { api.write(shellId, d)              })
  term.onResize(({ cols, rows }) => { api.resize(shellId, cols, rows) })

  term.write("\x1b[1A\x1b[2K")
  term.write("\x1b[1;32m✓ Shell ready\x1b[0m\r\n\r\n")
}

// ─────────────────────────────────────────────────────────────────────────────
// WebSocket backend (web / Electron dev)
// ─────────────────────────────────────────────────────────────────────────────
function bootWebSocket(
  sid:    string,
  term:   XTerm,
  fit:    FitAddon,
  isDead: () => boolean,
  handles: Map<string, ConnHandle>,
): Promise<void> {
  term.write("\x1b[90mConnecting to shell…\x1b[0m\r\n")

  const proto = window.location.protocol === "https:" ? "wss:" : "ws:"
  const ws    = new WebSocket(`${proto}//${window.location.host}/api/terminal/ws`)
  handles.set(sid, { ws, unsubs: [] })

  return new Promise<void>((resolve, reject) => {
    ws.onopen = () => {
      if (isDead()) { ws.close(); return }
      try {
        fit.fit()
        ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }))
      } catch {}

      term.write("\x1b[1A\x1b[2K")
      term.write("\x1b[1;32m✓ Shell ready\x1b[0m\r\n\r\n")

      term.onData((d) => {
        if (ws.readyState === WebSocket.OPEN)
          ws.send(JSON.stringify({ type: "input", data: d }))
      })
      term.onResize(({ cols, rows }) => {
        if (ws.readyState === WebSocket.OPEN)
          ws.send(JSON.stringify({ type: "resize", cols, rows }))
      })

      resolve()
    }

    ws.onmessage = ({ data }) => {
      try {
        const msg = JSON.parse(data)
        if (msg.type === "output") term.write(msg.data)
        if (msg.type === "exit") {
          term.write(`\r\n\x1b[1;33m[process exited: ${msg.code}]\x1b[0m\r\n`)
          term.write("\x1b[90mClose this tab or open a new one.\x1b[0m\r\n")
        }
      } catch {}
    }

    ws.onerror = () => {
      if (isDead()) return
      term.write("\r\n\x1b[1;31m✗ WebSocket connection failed.\x1b[0m\r\n")
      term.write("\x1b[90m  Check that the dev server is running.\x1b[0m\r\n")
      reject(new Error("WebSocket connection failed"))
    }

    ws.onclose = (ev) => {
      if (!isDead() && ev.code !== 1000)
        term.write("\r\n\x1b[90m[disconnected]\x1b[0m\r\n")
    }
  })
}
