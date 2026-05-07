"use client"
import { useWorkspace, type LeftPanelTab } from "@/store/workspace"
import { AppIcon } from "@/lib/iconify"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { FileTree } from "@/components/file-tree/FileTree"
import { GitPanel } from "@/components/git-panel/GitPanel"
import { SearchPanel } from "@/components/layout/SearchPanel"
import { PluginPanel } from "@/components/plugins/PluginPanel"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

const TABS: { id: LeftPanelTab; icon: string; label: string; combo: string }[] = [
  { id: "files",   icon: "folder", label: "Explorer",       combo: "⌘⇧E" },
  { id: "search",  icon: "search", label: "Search",         combo: "⌘⇧F" },
  { id: "git",     icon: "git",    label: "Source Control", combo: "⌘⇧G" },
  { id: "plugins", icon: "puzzle", label: "Plugins",        combo: "⌘⇧X" },
]

export function LeftSidebar() {
  const { leftTab, setLeftTab, showLeftSidebar } = useWorkspace()

  return (
    <div className="flex h-full bg-al-sidebar">
      {/* Activity rail (always visible) */}
      <div className="w-12 flex flex-col items-center py-2 gap-1 border-r border-border">
        {TABS.map((t) => (
          <Tooltip key={t.id}>
            <TooltipTrigger asChild>
              <button
                onClick={() => setLeftTab(t.id)}
                className={cn(
                  "relative h-9 w-9 rounded-md flex items-center justify-center transition",
                  leftTab === t.id ? "text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
                )}
                aria-label={t.label}
              >
                {leftTab === t.id && showLeftSidebar && (
                  <motion.div
                    layoutId="left-rail-active"
                    className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-al-accent"
                  />
                )}
                <AppIcon name={t.icon} width={18} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{t.label} <span className="opacity-50 ml-2">{t.combo}</span></TooltipContent>
          </Tooltip>
        ))}
      </div>
      {/* Panel */}
      {showLeftSidebar && (
        <div className="flex-1 min-w-[220px] flex flex-col">
          <div className="h-9 flex items-center px-3 text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
            {TABS.find((t) => t.id === leftTab)?.label}
          </div>
          <div className="flex-1 overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={leftTab}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.15 }}
                className="h-full"
              >
                {leftTab === "files" && <FileTree />}
                {leftTab === "git" && <GitPanel />}
                {leftTab === "search" && <SearchPanel />}
                {leftTab === "plugins" && <PluginPanel />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  )
}
