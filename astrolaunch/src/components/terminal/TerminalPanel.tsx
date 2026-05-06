"use client"
/**
 * Integrated terminal — xterm.js attached to a jsh process running inside the
 * WebContainer. Multiple sessions can be opened; they are persisted in the
 * `terminals` Dexie table so titles & cwd survive a reload.
 *
 * Renders nothing on the server — the xterm bundle is loaded dynamically.
 */
import { useEffect, useRef, useState, useCallback } from "react"
import { spawnShell, bootWebContainer, syncWorkspaceToContainer, type ShellHandle } from "@/lib/webcontainer/boot"
import { db } from "@/lib/storage/db"
import { Button } from "@/components/ui/button"
import { AppIcon } from "@/lib/iconify"
import { cn } from "@/lib/utils"
import { nanoid } from "nanoid"

// xterm types are loaded only when used; avoid pulling them server-side
type XTerm = import("@xterm/xterm").Terminal
type FitAddon = import("@xterm/addon-fit").FitAddon

interface SessionUI {
  id: string
  title: string
  /** Live terminal instance (lazy-allocated). */
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

  // Load persisted sessions metadata on mount, but don't hydrate xterms until visible
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
        // Auto-create first session
        await createSession()
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const createSession = useCallback(async () => {
    const id = nanoid()
    const title = `bash ${(sessions.length + 1)}`
    if (db) await db.terminals.add({ id, title, cwd: "/", createdAt: Date.now() })
    setSessions((prev) => [...prev, { id, title, buffer: "", ready: false }])
    setActiveId(id)
  }, [sessions.length])

  const closeSession = useCallback(async (id: string) => {
    setSessions((prev) => prev.map((s) => s.id === id ? { ...s, closed: true } : s))
    const target = sessions.find((s) => s.id === id)
    target?.shell?.kill()
    target?.term?.dispose()
    if (db) await db.terminals.delete(id)
    setSessions((prev) => prev.filter((s) => s.id !== id))
    if (activeId === id) {
      setActiveId((prev) => {
        const remaining = sessions.filter((s) => s.id !== id)
        return remaining[0]?.id ?? null
      })
    }
  }, [sessions, activeId])

  // Hydrate xterm for the active session
  useEffect(() => {
    if (!activeId) return
    const target = sessions.find((s) => s.id === activeId)
    if (!target || target.ready || target.closed) return

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
          cursorBlink: true,
          theme: {
            background: "#0c0c10",
            foreground: "#e4e4e7",
            cursor: "#a78bfa",
            selectionBackground: "#3f3f46",
          },
          allowProposedApi: true,
          scrollback: 5000,
        })
        const fit = new FitAddon()
        term.loadAddon(fit)
        term.loadAddon(new WebLinksAddon())

        const el = containerRef.current?.querySelector<HTMLDivElement>(`[data-term="${activeId}"]`)
        if (!el) return
        term.open(el)
        try { fit.fit() } catch {}

        term.writeln("\x1b[1;35m⌁ AstroLaunch terminal — booting WebContainer…\x1b[0m")

        await bootWebContainer()
        // Sync current workspace files so the shell can see them
        try {
          const files = await db.files.toArray()
          await syncWorkspaceToContainer(files)
        } catch {}
        if (cancelled) return

        const shell = await spawnShell()
        shell.onOutput((chunk) => {
          term.write(chunk)
          target.buffer += chunk
          // Persist buffer occasionally (every ~2KB)
          if (target.buffer.length % 2048 < 64 && db) {
            db.terminals.update(activeId, { buffer: target.buffer.slice(-50_000) }).catch(() => {})
          }
        })
        term.onData((d) => shell.write(d))
        term.onResize(({ cols, rows }) => shell.resize(cols, rows))

        target.term = term
        target.fit = fit
        target.shell = shell
        target.ready = true
        setSessions((prev) => prev.map((s) => s.id === activeId ? { ...s, ready: true } : s))

        // Replay persisted buffer
        if (target.buffer) term.write(target.buffer)
      } catch (e) {
        const target = sessions.find((s) => s.id === activeId)
        target?.term?.writeln(`\x1b[31mTerminal error: ${String(e)}\x1b[0m`)
      }
    })()

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, sessions.length])

  // Refit on resize
  useEffect(() => {
    const onResize = () => {
      sessions.forEach((s) => { try { s.fit?.fit() } catch {} })
    }
    window.addEventListener("resize", onResize)
    const ro = new ResizeObserver(onResize)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => { window.removeEventListener("resize", onResize); ro.disconnect() }
  }, [sessions])

  const clear = () => {
    const t = sessions.find((s) => s.id === activeId)?.term
    t?.clear()
  }

  return (
    <div className="h-full flex flex-col bg-al-panel/40">
      <div className="h-8 flex items-center gap-1 px-2 border-b border-border">
        <AppIcon name="terminal" width={13} className="text-al-accent" />
        <div className="flex items-center gap-1 text-[11px] overflow-x-auto">
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveId(s.id)}
              className={cn(
                "px-2 py-0.5 rounded flex items-center gap-1 group",
                s.id === activeId ? "bg-al-accent/20 text-foreground" : "text-muted-foreground hover:bg-accent/30"
              )}
            >
              {s.title}
              <span
                onClick={(e) => { e.stopPropagation(); closeSession(s.id) }}
                className="opacity-0 group-hover:opacity-100 hover:text-destructive"
              >
                <AppIcon name="close" width={10} />
              </span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Button size="icon-sm" variant="ghost" onClick={createSession} title="New terminal">
            <AppIcon name="plus" width={13} />
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={clear} title="Clear">
            <AppIcon name="refresh" width={13} />
          </Button>
        </div>
      </div>
      <div ref={containerRef} className="flex-1 relative bg-[#0c0c10] overflow-hidden">
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
          <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
            No terminal sessions. Press <kbd className="mx-1 px-1 bg-al-panel border border-border rounded">+</kbd>
            to spawn one.
          </div>
        )}
      </div>
    </div>
  )
}
