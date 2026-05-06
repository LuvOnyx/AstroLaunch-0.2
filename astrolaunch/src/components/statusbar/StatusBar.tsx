"use client"
import { useEffect, useState } from "react"
import { db } from "@/lib/storage/db"
import { AppIcon } from "@/lib/iconify"
import { useSettings } from "@/store/settings"
import { useWorkspace } from "@/store/workspace"
import { cn } from "@/lib/utils"

export function StatusBar() {
  const { defaultModel, apiKeys } = useSettings()
  const { activeFileId, setBottomTab, setShowBottomPanel, showBottomPanel } = useWorkspace()
  const [counts, setCounts] = useState({ files: 0, tasks: 0, openTasks: 0, agentTouched: 0 })
  const [activeMeta, setActiveMeta] = useState<{ path: string; lines: number; lang: string }>({ path: "", lines: 0, lang: "" })
  const [totalCost, setTotalCost] = useState(0)
  const [orchestratorRunning, setOrchestratorRunning] = useState(false)

  useEffect(() => {
    const tick = async () => {
      if (!db) return
      const files = await db.files.where("type").equals("file").count()
      const tasks = await db.tasks.count()
      const all = await db.tasks.toArray()
      const openTasks = all.filter((t) => !t.is_done).length
      const agentTouched = (await db.files.where("agentTouched").equals(1).toArray()).length
      setCounts({ files, tasks, openTasks, agentTouched })

      const chats = await db.chats.toArray()
      setTotalCost(chats.reduce((s, c) => s + (c.totalCostUsd ?? 0), 0))

      if (activeFileId) {
        const f = await db.files.get(activeFileId)
        const lines = (f?.content ?? "").split("\n").length
        const ext = (f?.path ?? "").split(".").pop() ?? ""
        setActiveMeta({ path: f?.path ?? "", lines, lang: ext })
      } else setActiveMeta({ path: "", lines: 0, lang: "" })
    }
    tick()
    const t = setInterval(tick, 1500)
    return () => clearInterval(t)
  }, [activeFileId])

  // Subscribe to orchestrator events for live indicator
  useEffect(() => {
    const onLog = () => {
      // Re-derive: we don't have the import path circular-safe here, so use a global heuristic
      try {
        // @ts-expect-error - test via window probe
        const r = !!window.__al_orchestrator_running
        setOrchestratorRunning(r)
      } catch {}
    }
    window.addEventListener("astrolaunch:agent-log", onLog)
    return () => window.removeEventListener("astrolaunch:agent-log", onLog)
  }, [])

  return (
    <div className="h-6 flex items-center justify-between px-3 text-[10px] bg-al-accent/80 text-white select-none">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1"><AppIcon name="branch" width={10} /> main</span>
        <span className="flex items-center gap-1"><AppIcon name="folder" width={10} /> {counts.files} files</span>
        <span
          className="flex items-center gap-1 cursor-pointer"
          onClick={() => { setBottomTab("agent-log"); setShowBottomPanel(!showBottomPanel) }}
          title="Click to toggle agent log"
        >
          <AppIcon name="agent" width={10} /> {counts.tasks - counts.openTasks}/{counts.tasks} tasks
          {orchestratorRunning && <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse ml-1" />}
        </span>
        {counts.agentTouched > 0 && (
          <span className="flex items-center gap-1 text-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-300" /> {counts.agentTouched} agent edits pending
          </span>
        )}
        {activeMeta.path && (
          <span className="opacity-90 truncate max-w-[40vw]">{activeMeta.path} · {activeMeta.lines} lines · {activeMeta.lang || "?"}</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className={cn(totalCost > 1 && "font-semibold")}>${totalCost.toFixed(3)} spent</span>
        <span>{apiKeys.gemini ? "● connected" : "○ no API key"}</span>
        <span>{defaultModel}</span>
        <span>UTF-8</span>
        <span>AstroLaunch ⌁</span>
      </div>
    </div>
  )
}
