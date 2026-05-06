"use client"
/**
 * Bottom panel that hosts terminal / problems / output / agent log.
 * Resizable from the top edge; persisted via the workspace store.
 */
import { useWorkspace, type BottomPanelTab } from "@/store/workspace"
import { TerminalPanel } from "@/components/terminal/TerminalPanel"
import { Button } from "@/components/ui/button"
import { AppIcon } from "@/lib/iconify"
import { cn } from "@/lib/utils"
import { useEffect, useRef, useState } from "react"
import { db } from "@/lib/storage/db"

const TABS: { id: BottomPanelTab; label: string; icon: string }[] = [
  { id: "terminal", label: "Terminal", icon: "terminal" },
  { id: "problems", label: "Problems", icon: "close" },
  { id: "output", label: "Output", icon: "file" },
  { id: "agent-log", label: "Agent log", icon: "agent" },
]

export function BottomPanel() {
  const { showBottomPanel, bottomTab, setBottomTab, setShowBottomPanel, bottomHeight, setBottomHeight } = useWorkspace()
  const dragRef = useRef<{ startY: number; startH: number } | null>(null)

  if (!showBottomPanel) return null

  const onResize = (e: React.PointerEvent) => {
    e.preventDefault()
    dragRef.current = { startY: e.clientY, startH: bottomHeight }
    const move = (ev: PointerEvent) => {
      if (!dragRef.current) return
      const next = Math.max(120, Math.min(window.innerHeight - 200, dragRef.current.startH - (ev.clientY - dragRef.current.startY)))
      setBottomHeight(next)
    }
    const up = () => {
      dragRef.current = null
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }

  return (
    <div className="border-t border-border bg-al-panel flex flex-col" style={{ height: bottomHeight }}>
      <div onPointerDown={onResize} className="h-1 -mt-1 cursor-ns-resize hover:bg-al-accent transition" />
      <div className="h-8 flex items-center px-2 gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setBottomTab(t.id)}
            className={cn(
              "px-2 py-0.5 rounded text-[11px] flex items-center gap-1 transition",
              bottomTab === t.id ? "bg-al-accent/20 text-foreground" : "text-muted-foreground hover:bg-accent/30"
            )}
          >
            <AppIcon name={t.icon} width={11} />
            {t.label}
          </button>
        ))}
        <Button size="icon-sm" variant="ghost" className="ml-auto" onClick={() => setShowBottomPanel(false)} title="Close panel">
          <AppIcon name="close" width={13} />
        </Button>
      </div>
      <div className="flex-1 min-h-0">
        {bottomTab === "terminal" && <TerminalPanel />}
        {bottomTab === "problems" && <ProblemsView />}
        {bottomTab === "output" && <OutputView />}
        {bottomTab === "agent-log" && <AgentLogView />}
      </div>
    </div>
  )
}

function ProblemsView() {
  // Placeholder — wires to typecheck output once we add it; for now lists agent-touched files
  const [items, setItems] = useState<{ path: string; size: number }[]>([])
  useEffect(() => {
    (async () => {
      if (!db) return
      const all = await db.files.where("agentTouched").equals(1).toArray()
      setItems(all.map((f) => ({ path: f.path, size: f.size ?? 0 })))
    })()
  }, [])
  return (
    <div className="p-3 text-xs text-muted-foreground space-y-1">
      <div>0 problems · diagnostics from typecheck/lint will surface here.</div>
      {items.length > 0 && (
        <div className="pt-2">
          <div className="text-[10px] uppercase">Agent-touched files</div>
          {items.map((i) => <div key={i.path} className="font-mono text-[11px]">{i.path}</div>)}
        </div>
      )}
    </div>
  )
}

function OutputView() {
  const [lines, setLines] = useState<string[]>([])
  useEffect(() => {
    if (typeof window === "undefined") return
    const wc = (window as unknown as { alWebContainer?: { onOutput?: (cb: (s: string) => void) => () => void } }).alWebContainer
    if (!wc?.onOutput) return
    return wc.onOutput((chunk) => {
      setLines((prev) => [...prev.slice(-400), ...chunk.split("\n")].slice(-400))
    })
  }, [])
  return (
    <div className="h-full overflow-auto p-2 font-mono text-[11px] text-muted-foreground whitespace-pre-wrap">
      {lines.length === 0 ? "(no output yet — start a process from the terminal or Run preview)" : lines.join("\n")}
    </div>
  )
}

function AgentLogView() {
  const [lines, setLines] = useState<string[]>([])
  useEffect(() => {
    const onLog = (e: Event) => {
      const ce = e as CustomEvent<string>
      setLines((prev) => [...prev.slice(-200), ce.detail])
    }
    window.addEventListener("astrolaunch:agent-log", onLog as EventListener)
    return () => window.removeEventListener("astrolaunch:agent-log", onLog as EventListener)
  }, [])
  return (
    <div className="h-full overflow-auto p-2 font-mono text-[11px] text-muted-foreground whitespace-pre-wrap">
      {lines.length === 0 ? "(idle — agent events will appear here once /build runs)" : lines.join("\n")}
    </div>
  )
}
