"use client"
/**
 * Command palette v2 — full action registry (files, view toggles, agent, plugins, terminal),
 * fuzzy match, recent items, keyboard navigation.
 */
import { useEffect, useState, useMemo, useRef } from "react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { db } from "@/lib/storage/db"
import { useWorkspace } from "@/store/workspace"
import { FileIcon, AppIcon } from "@/lib/iconify"
import { useHotkeys } from "react-hotkeys-hook"
import { cn } from "@/lib/utils"
import type { PluginRecord } from "@/types"

interface Cmd {
  id: string
  label: string
  hint?: string
  category: string
  run: () => void
  icon?: string
  /** Shortcut display text. */
  shortcut?: string
}

const RECENT_KEY = "astrolaunch.cmdpalette.recent.v2"

export function CommandPalette({ onOpenSettings }: { onOpenSettings: () => void }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
  const ws = useWorkspace()
  const inputRef = useRef<HTMLInputElement>(null)
  const [items, setItems] = useState<Cmd[]>([])
  const [recent, setRecent] = useState<string[]>([])

  useHotkeys("meta+k, ctrl+k", (e) => { e.preventDefault(); setOpen((o) => !o) })
  useHotkeys("meta+p, ctrl+p", (e) => { e.preventDefault(); setOpen(true); setQ(">") /* trigger file mode below */
    setTimeout(() => { setQ(""); inputRef.current?.focus() }, 0)
  })
  useHotkeys("meta+comma, ctrl+comma", (e) => { e.preventDefault(); onOpenSettings() })
  useHotkeys("meta+j, ctrl+j", (e) => { e.preventDefault(); ws.setShowRightChat(!ws.showRightChat) })
  useHotkeys("meta+b, ctrl+b", (e) => { e.preventDefault(); ws.setShowLeftSidebar(!ws.showLeftSidebar) })
  useHotkeys("meta+`, ctrl+`", (e) => { e.preventDefault(); ws.setBottomTab("terminal"); ws.setShowBottomPanel(!ws.showBottomPanel) })
  useHotkeys("meta+shift+e", (e) => { e.preventDefault(); ws.setLeftTab("files"); ws.setShowLeftSidebar(true) })
  useHotkeys("meta+shift+f", (e) => { e.preventDefault(); ws.setLeftTab("search"); ws.setShowLeftSidebar(true) })
  useHotkeys("meta+shift+g", (e) => { e.preventDefault(); ws.setLeftTab("git"); ws.setShowLeftSidebar(true) })
  useHotkeys("meta+shift+a", (e) => { e.preventDefault(); ws.setLeftTab("agents"); ws.setShowLeftSidebar(true) })
  useHotkeys("meta+shift+x", (e) => { e.preventDefault(); ws.setLeftTab("plugins"); ws.setShowLeftSidebar(true) })

  useEffect(() => {
    if (typeof window === "undefined") return
    try { setRecent(JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]")) } catch {}
  }, [open])

  useEffect(() => {
    if (!open) return
    (async () => {
      const files = await db.files.where("type").equals("file").toArray()
      const plugins = await db.plugins.toArray()
      const fileCmds: Cmd[] = files.map((f) => ({
        id: `file:${f.id}`, label: f.path, category: "Files", icon: "file",
        run: () => { ws.openFile(f.id); close(`file:${f.id}`) },
      }))
      const pluginCmds: Cmd[] = plugins.filter((p) => p.enabled).flatMap((p: PluginRecord) =>
        p.contributes
          .filter((c) => c.surface === "command" || c.surface === "panel")
          .map((c) => ({
            id: `plugin:${p.id}:${c.title}`,
            label: `${c.title} — ${p.name}`,
            category: "Plugins", icon: "puzzle",
            run: () => { ws.setActivePluginId(p.id); close(`plugin:${p.id}`) },
          }))
      )
      const actions: Cmd[] = [
        { id: "view:files",   category: "Views", label: "View: Explorer",        icon: "folder",   shortcut: "⌘⇧E", run: () => { ws.setLeftTab("files"); ws.setShowLeftSidebar(true); close("view:files") } },
        { id: "view:git",     category: "Views", label: "View: Source Control",  icon: "git",      shortcut: "⌘⇧G", run: () => { ws.setLeftTab("git"); ws.setShowLeftSidebar(true); close("view:git") } },
        { id: "view:agents",  category: "Views", label: "View: Agents",          icon: "agent",    shortcut: "⌘⇧A", run: () => { ws.setLeftTab("agents"); ws.setShowLeftSidebar(true); close("view:agents") } },
        { id: "view:plugins", category: "Views", label: "View: Plugins",         icon: "puzzle",   shortcut: "⌘⇧X", run: () => { ws.setLeftTab("plugins"); ws.setShowLeftSidebar(true); close("view:plugins") } },
        { id: "view:search",  category: "Views", label: "View: Search",          icon: "search",   shortcut: "⌘⇧F", run: () => { ws.setLeftTab("search"); ws.setShowLeftSidebar(true); close("view:search") } },
        { id: "mode:preview", category: "Center", label: "Center: Live preview", icon: "preview",  run: () => { ws.setCenterMode("preview"); ws.setActivePluginId(null); close("mode:preview") } },
        { id: "mode:canvas",  category: "Center", label: "Center: Penpot canvas", icon: "canvas",  run: () => { ws.setCenterMode("canvas"); ws.setActivePluginId(null); close("mode:canvas") } },
        { id: "mode:split",   category: "Center", label: "Center: Split (canvas + preview)", icon: "layout", run: () => { ws.setCenterMode("split"); ws.setActivePluginId(null); close("mode:split") } },
        { id: "panel:terminal", category: "Panels", label: "Toggle terminal", icon: "terminal", shortcut: "⌘`", run: () => { ws.setBottomTab("terminal"); ws.setShowBottomPanel(!ws.showBottomPanel); close("panel:terminal") } },
        { id: "panel:agent-log", category: "Panels", label: "Show agent log", icon: "agent", run: () => { ws.setBottomTab("agent-log"); ws.setShowBottomPanel(true); close("panel:agent-log") } },
        { id: "panel:output", category: "Panels", label: "Show output", icon: "file", run: () => { ws.setBottomTab("output"); ws.setShowBottomPanel(true); close("panel:output") } },
        { id: "settings", category: "App", label: "Open settings", icon: "settings", shortcut: "⌘,", run: () => { onOpenSettings(); close("settings") } },
        { id: "chat",     category: "App", label: "Toggle agent chat", icon: "chat", shortcut: "⌘J", run: () => { ws.setShowRightChat(!ws.showRightChat); close("chat") } },
      ]
      setItems([...actions, ...pluginCmds, ...fileCmds])
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const close = (chosenId?: string) => {
    if (chosenId) {
      const next = [chosenId, ...recent.filter((r) => r !== chosenId)].slice(0, 12)
      setRecent(next)
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)) } catch {}
    }
    setOpen(false); setQ(""); setActiveIndex(0)
  }

  const filtered = useMemo(() => {
    const ql = q.toLowerCase().trim()
    if (!ql) {
      // Sort by recent first, then alphabetic
      const recentSet = new Set(recent)
      const recentItems = recent.map((id) => items.find((it) => it.id === id)).filter(Boolean) as Cmd[]
      const rest = items.filter((i) => !recentSet.has(i.id))
      return [...recentItems, ...rest].slice(0, 60)
    }
    return items
      .map((it) => ({ it, score: fuzzyScore(it.label, ql) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 60)
      .map(({ it }) => it)
  }, [items, q, recent])

  const grouped = useMemo(() => {
    const m = new Map<string, Cmd[]>()
    for (const it of filtered) {
      const arr = m.get(it.category) ?? []
      arr.push(it)
      m.set(it.category, arr)
    }
    return Array.from(m.entries())
  }, [filtered])

  // Reset active index on filter change
  useEffect(() => { setActiveIndex(0) }, [q])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex((i) => Math.min(filtered.length - 1, i + 1)) }
    if (e.key === "ArrowUp")   { e.preventDefault(); setActiveIndex((i) => Math.max(0, i - 1)) }
    if (e.key === "Enter")     { e.preventDefault(); filtered[activeIndex]?.run() }
    if (e.key === "Escape")    { e.preventDefault(); close() }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => o ? setOpen(true) : close()}>
      <DialogContent className="max-w-xl p-0">
        <Input
          ref={inputRef}
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type a command, file, or action…  (↑↓ to navigate, ⏎ to run)"
          className="border-0 rounded-none h-12 text-sm focus-visible:ring-0"
        />
        <div className="max-h-96 overflow-auto border-t border-border">
          {grouped.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No results.</div>
          ) : (
            grouped.map(([cat, list]) => (
              <div key={cat}>
                <div className="px-4 pt-2 pb-1 text-[10px] uppercase text-muted-foreground tracking-wider">{cat}</div>
                {list.map((c) => {
                  const idx = filtered.indexOf(c)
                  return (
                    <button
                      key={c.id}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={c.run}
                      className={cn(
                        "w-full flex items-center gap-2 px-4 py-2 text-sm text-left",
                        idx === activeIndex && "bg-accent/40"
                      )}
                    >
                      {c.icon === "file" && c.label.includes(".") ? (
                        <FileIcon filename={c.label} width={14} />
                      ) : (
                        <AppIcon name={c.icon ?? "file"} width={14} />
                      )}
                      <span className="flex-1 truncate">{c.label}</span>
                      {c.shortcut && (
                        <kbd className="text-[10px] text-muted-foreground bg-background/60 px-1 rounded border border-border">{c.shortcut}</kbd>
                      )}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function fuzzyScore(haystack: string, needle: string): number {
  if (!needle) return 1
  const h = haystack.toLowerCase()
  let i = 0, score = 0, lastIdx = -1
  for (const ch of needle) {
    const idx = h.indexOf(ch, lastIdx + 1)
    if (idx === -1) return 0
    score += 1 + (lastIdx >= 0 && idx - lastIdx === 1 ? 2 : 0)
    lastIdx = idx
    i++
  }
  return score
}
