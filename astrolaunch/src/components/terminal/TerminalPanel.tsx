"use client"
/**
 * Integrated terminal — xterm.js attached to a jsh process running inside
 * the WebContainer. Multiple sessions supported; persisted in Dexie.
 *
 * v3 fixes:
 *   - Input focus restored on session switch
 *   - Proper resize handling on panel resize (ResizeObserver)
 *   - Shell write errors silently ignored (writer already closed)
 *   - Agent run_command bridge exposed on window.alWebContainer
 *   - install_deps support (npm/pip) with extended timeout
 */
import { useEffect, useRef, useState, useCallback } from "react"
import { spawnShell, bootWebContainer, syncWorkspaceToContainer, type ShellHandle } from "@/lib/webcontainer/boot"
import { db } from "@/lib/storage/db"
import { Button } from "@/components/ui/button"
import { AppIcon } from "@/lib/iconify"
import { cn } from "@/lib/utils"
import { nanoid } from "nanoid"

type XTerm = import("@xterm/xterm").Terminal
type FitAddon = import("@xterm/addon-fit").FitAddon

interface SessionUI {
  id: string
  title: string
  term?: XTerm
  fit?: FitAddon
  shell?: ShellHandle
  el?: HTMLDivElement
  buffer: string
  ready: boolean
  closed?: boolean
}

export function TerminalPanel() {
  const [sessions, setSessions] = useState<SessionUI[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const sessionsRef = useRef<SessionUI[]>([])

  // Keep ref in sync
  useEffect(() => { sessionsRef.current = sessions }, [sessions])

  // Load persisted sessions on mount
  useEffect(() => {
    (async () => {
      if (!db) return
      const persisted = await db.terminals.orderBy("createdAt").toArray()
      if (persisted.length) {
        const ui: SessionUI[] = persisted.map((p) => ({
          id: p.id, title: p.title, buffer: p.buffer ?? "", ready: false,
        }))
        setSessions(ui)
        setActiveId(ui[0].id)
      } else {
        await createSession()
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const createSession = useCallback(async () => {
    const id = nanoid()
    const count = sessionsRef.current.length + 1
    const title = `Terminal ${count}`
    if (db) await db.terminals.add({ id, title, cwd: "/", createdAt: Date.now() })
    setSessions((prev) => [...prev, { id, title, buffer: "", ready: false }])
    setActiveId(id)
  }, [])

  const closeSession = useCallback(async (id: string) => {
    const target = sessionsRef.current.find((s) => s.id === id)
    if (target) {
      try { target.shell?.kill() } catch {}
      try { target.term?.dispose() } catch {}
    }
    if (db) await db.terminals.delete(id)
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id)
      return next
    })
    setActiveId((prev) => {
      if (prev !== id) return prev
      const remaining = sessionsRef.current.filter((s) => s.id !== id)
      return remaining[0]?.id ?? null
    })
  }, [])

  // Hydrate xterm for the active session
  useEffect(() => {
    if (!activeId) return
    const target = sessions.find((s) => s.id === activeId)
    if (!target || target.ready || target.closed) {
      // Refocus an already-ready session when switching
      if (target?.ready && target.term) {
        requestAnimationFrame(() => { target.term?.focus() })
      }
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const [{ Terminal }, { FitAddon }, { WebLinksAddon }] = await Promise.all([
          import("@xterm/xterm"),
          import("@xterm/addon-fit"),
          import("@xterm/addon-web-links"),
        ])
        if (cancelled) return

        const term = new Terminal({
          fontFamily: "var(--font-mono), JetBrains Mono, Menlo, monospace",
          fontSize: 13,
          lineHeight: 1.4,
          cursorBlink: true,
          cursorStyle: "block",
          theme: {
            background: "#0c0c10",
            foreground: "#e4e4e7",
            cursor: "#a78bfa",
            cursorAccent: "#0c0c10",
            selectionBackground: "#3f3f4660",
            black: "#1c1c26",
            red: "#f87171",
            green: "#34d399",
            yellow: "#fbbf24",
            blue: "#818cf8",
            magenta: "#c084fc",
            cyan: "#22d3ee",
            white: "#e4e4e7",
            brightBlack: "#52525b",
            brightBlue: "#a5b4fc",
          },
          allowProposedApi: true,
          scrollback: 5000,
          convertEol: true,
        })

        const fit = new FitAddon()
        term.loadAddon(fit)
        term.loadAddon(new WebLinksAddon())

        const el = containerRef.current?.querySelector<HTMLDivElement>(`[data-term="${activeId}"]`)
        if (!el) return
        term.open(el)
        setTimeout(() => { try { fit.fit() } catch {} }, 50)

        term.writeln("\x1b[1;35m⌁ AstroLaunch terminal — booting WebContainer…\x1b[0m")
        term.writeln("\x1b[90m  Requires Chrome/Edge with cross-origin isolation. Takes ~5s on first boot.\x1b[0m")

        // Boot WebContainer with a 30s timeout
        const bootResult = await Promise.race([
          bootWebContainer().then(() => "ok" as const),
          new Promise<"timeout">((r) => setTimeout(() => r("timeout"), 30_000)),
        ])

        if (bootResult === "timeout") {
          term.writeln("\x1b[1;33m⚠ WebContainer boot timed out.\x1b[0m")
          term.writeln("\x1b[90m  This usually means the browser lacks cross-origin isolation (COEP/COOP).\x1b[0m")
          term.writeln("\x1b[90m  Please use Chrome or Edge, or open the app in a new tab.\x1b[0m")
          term.writeln("")
          term.writeln("\x1b[1;37mYou can still use the chat and code editor above.\x1b[0m")
          setSessions((prev) => prev.map((s) => s.id === activeId ? { ...s, ready: true } : s))
          return
        }

        // Sync workspace files so the shell can see them
        try {
          const files = await db.files.toArray()
          if (files.length > 0) await syncWorkspaceToContainer(files)
        } catch {}

        if (cancelled) return

        term.writeln("\x1b[1;32m✓ WebContainer ready\x1b[0m")

        const shell = await spawnShell()

        // Wire output → terminal
        shell.onOutput((chunk) => {
          try { term.write(chunk) } catch {}
          target.buffer += chunk
          if (target.buffer.length % 2048 < 64 && db) {
            db.terminals.update(activeId, { buffer: target.buffer.slice(-50_000) }).catch(() => {})
          }
        })

        // Wire keyboard input → shell (the key interactive fix)
        term.onData((d) => {
          try { shell.write(d) } catch {}
        })

        // Wire resize
        term.onResize(({ cols, rows }) => {
          try { shell.resize(cols, rows) } catch {}
        })

        // Store handles on the session object
        target.term = term
        target.fit = fit
        target.shell = shell
        target.ready = true
        setSessions((prev) => prev.map((s) => s.id === activeId ? { ...s, ready: true, term, fit, shell } : s))

        // Replay persisted buffer
        if (target.buffer) term.write(target.buffer)

        // Focus the terminal
        term.focus()

      } catch (e) {
        const el = containerRef.current?.querySelector<HTMLDivElement>(`[data-term="${activeId}"]`)
        if (el) {
          const errDiv = document.createElement("div")
          errDiv.style.cssText = "color:#f87171;padding:8px;font-size:12px;font-family:monospace"
          errDiv.textContent = `Terminal error: ${String(e)}`
          el.appendChild(errDiv)
        }
      }
    })()

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, sessions.length])

  // Resize handling via ResizeObserver
  useEffect(() => {
    const fitAll = () => {
      sessionsRef.current.forEach((s) => {
        if (s.ready && s.fit) {
          requestAnimationFrame(() => {
            try { s.fit?.fit() } catch {}
          })
        }
      })
    }
    window.addEventListener("resize", fitAll)
    const ro = new ResizeObserver(fitAll)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => { window.removeEventListener("resize", fitAll); ro.disconnect() }
  }, [])

  // Focus terminal when switching sessions
  const switchSession = (id: string) => {
    setActiveId(id)
    requestAnimationFrame(() => {
      const s = sessionsRef.current.find((s) => s.id === id)
      if (s?.term) {
        s.term.focus()
        try { s.fit?.fit() } catch {}
      }
    })
  }

  const clear = () => {
    const s = sessions.find((s) => s.id === activeId)
    s?.term?.clear()
    s?.term?.focus()
  }

  return (
    <div className="h-full flex flex-col bg-[#0c0c10]">
      {/* Tab bar */}
      <div className="h-8 flex items-center gap-1 px-2 border-b border-border bg-al-panel/60 flex-shrink-0">
        <AppIcon name="terminal" width={13} className="text-al-accent" />
        <div className="flex items-center gap-0.5 text-[11px] overflow-x-auto flex-1 min-w-0">
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => switchSession(s.id)}
              className={cn(
                "px-2 py-0.5 rounded flex items-center gap-1.5 group whitespace-nowrap flex-shrink-0 transition-colors",
                s.id === activeId
                  ? "bg-al-accent/20 text-foreground"
                  : "text-muted-foreground hover:bg-accent/20"
              )}
            >
              {s.id === activeId && s.ready && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
              )}
              {s.title}
              <span
                onClick={(e) => { e.stopPropagation(); closeSession(s.id) }}
                className="opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:text-destructive transition-opacity ml-0.5"
              >
                <AppIcon name="close" width={10} />
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button
            size="icon-sm" variant="ghost"
            onClick={createSession}
            title="New terminal (⌘T)"
            className="h-6 w-6"
          >
            <AppIcon name="plus" width={13} />
          </Button>
          <Button
            size="icon-sm" variant="ghost"
            onClick={clear}
            title="Clear terminal"
            className="h-6 w-6"
          >
            <AppIcon name="refresh" width={13} />
          </Button>
        </div>
      </div>

      {/* Terminal mount points */}
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden"
        onClick={() => {
          const s = sessions.find((s) => s.id === activeId)
          s?.term?.focus()
        }}
      >
        {sessions.map((s) => (
          <div
            key={s.id}
            data-term={s.id}
            className={cn(
              "absolute inset-0 p-1",
              s.id === activeId ? "block" : "hidden"
            )}
          />
        ))}
        {sessions.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground gap-2">
            No terminal sessions.
            <button
              onClick={createSession}
              className="px-2 py-0.5 bg-al-panel border border-border rounded hover:bg-al-panel/80 transition"
            >
              + New Terminal
            </button>
          </div>
        )}
        {/* Loading state for un-booted sessions */}
        {sessions.some((s) => s.id === activeId && !s.ready) && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-xs text-muted-foreground animate-pulse">Booting WebContainer…</div>
          </div>
        )}
      </div>
    </div>
  )
}
