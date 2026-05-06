"use client"
import { motion } from "framer-motion"
import { AppIcon } from "@/lib/iconify"
import { Button } from "@/components/ui/button"
import { useWorkspace } from "@/store/workspace"
import { useSettings } from "@/store/settings"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { useEffect, useState } from "react"
import { db } from "@/lib/storage/db"

interface TopbarProps {
  onOpenSettings: () => void
  onRunPreview: () => void
  isRunning: boolean
  onOpenCommandPalette: () => void
}

export function Topbar({ onOpenSettings, onRunPreview, isRunning, onOpenCommandPalette }: TopbarProps) {
  const {
    centerMode, setCenterMode, showRightChat, setShowRightChat,
    showLeftSidebar, setShowLeftSidebar, showBottomPanel, setShowBottomPanel,
    setBottomTab, activePluginId, setActivePluginId,
  } = useWorkspace()
  const { apiKeys, defaultModel } = useSettings()
  const [chatCost, setChatCost] = useState(0)

  useEffect(() => {
    const tick = async () => {
      if (!db) return
      const total = await db.chats.toArray().then((cs) => cs.reduce((s, c) => s + (c.totalCostUsd ?? 0), 0))
      setChatCost(total)
    }
    tick()
    const t = setInterval(tick, 4000)
    return () => clearInterval(t)
  }, [])

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="h-11 flex items-center justify-between px-3 border-b border-border bg-al-topbar text-foreground select-none"
    >
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-2">
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-violet-500 via-fuchsia-500 to-cyan-400 flex items-center justify-center text-[11px] font-bold text-white shadow-lg shadow-violet-500/20">
            ⌁
          </div>
          <span className="text-sm font-semibold tracking-tight">AstroLaunch</span>
          <span className="text-[10px] text-muted-foreground border border-border rounded px-1 py-0.5">v0.2</span>
        </div>
        <div className="h-5 w-px bg-border" />
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Tooltip><TooltipTrigger asChild>
            <button onClick={() => setShowLeftSidebar(!showLeftSidebar)} className="hover:text-foreground px-2 py-1 rounded hover:bg-accent">
              <AppIcon name="layout" width={13} />
            </button>
          </TooltipTrigger><TooltipContent>Toggle sidebar (⌘B)</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild>
            <button onClick={() => { setShowBottomPanel(!showBottomPanel); setBottomTab("terminal") }} className="hover:text-foreground px-2 py-1 rounded hover:bg-accent">
              <AppIcon name="terminal" width={13} />
            </button>
          </TooltipTrigger><TooltipContent>Toggle terminal (⌘`)</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild>
            <button onClick={onOpenCommandPalette} className="hover:text-foreground px-2 py-1 rounded hover:bg-accent">
              <AppIcon name="search" width={13} />
            </button>
          </TooltipTrigger><TooltipContent>Command palette (⌘K)</TooltipContent></Tooltip>
        </nav>
      </div>

      <div className="flex items-center gap-1.5 bg-al-panel rounded-md p-0.5 border border-border">
        {(["preview", "canvas", "split"] as const).map((m) => (
          <Tooltip key={m}>
            <TooltipTrigger asChild>
              <button
                onClick={() => { setCenterMode(m); setActivePluginId(null) }}
                className={cn(
                  "px-3 py-1 rounded text-xs font-medium transition flex items-center gap-1.5",
                  centerMode === m && !activePluginId ? "bg-al-accent/20 text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <AppIcon
                  name={m === "preview" ? "preview" : m === "canvas" ? "canvas" : "layout"}
                  width={14}
                />
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            </TooltipTrigger>
            <TooltipContent>{m === "split" ? "Split: design + live preview" : `${m} only`}</TooltipContent>
          </Tooltip>
        ))}
        {activePluginId && (
          <button className="px-3 py-1 rounded text-xs font-medium flex items-center gap-1.5 bg-al-accent/20 text-foreground">
            <AppIcon name="puzzle" width={14} /> Plugin
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        {chatCost > 0 && (
          <Badge variant="outline" className="text-[10px] py-0 px-1.5">
            ${chatCost.toFixed(3)}
          </Badge>
        )}
        <Badge variant={apiKeys.gemini ? "success" : "warning"} className="text-[10px]">
          {apiKeys.gemini ? defaultModel.replace("gemini-", "") : "no key"}
        </Badge>
        <Button size="sm" variant={isRunning ? "secondary" : "default"} onClick={onRunPreview}>
          <AppIcon name={isRunning ? "stop" : "play"} width={14} />
          {isRunning ? "Stop" : "Run"}
        </Button>
        <Tooltip><TooltipTrigger asChild>
          <Button size="icon-sm" variant="ghost" onClick={() => setShowRightChat(!showRightChat)}>
            <AppIcon name="chat" width={16} />
          </Button>
        </TooltipTrigger><TooltipContent>Toggle agent chat (⌘J)</TooltipContent></Tooltip>
        <Tooltip><TooltipTrigger asChild>
          <Button size="icon-sm" variant="ghost" onClick={onOpenSettings}>
            <AppIcon name="settings" width={16} />
          </Button>
        </TooltipTrigger><TooltipContent>Settings (⌘,)</TooltipContent></Tooltip>
      </div>
    </motion.header>
  )
}
