"use client"
/**
 * WelcomeModal — shown on first launch (or Help > Welcome Screen).
 * Lets the user: create a new workspace, open a project, continue from recent
 * projects, or choose a starter template.
 */
import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useSettings } from "@/store/settings"
import { useWorkspace } from "@/store/workspace"
import { AppIcon } from "@/lib/iconify"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { TEMPLATES, applyTemplate } from "@/lib/templates"
import { db } from "@/lib/storage/db"
import { nanoid } from "nanoid"
import { toast } from "sonner"

interface WelcomeModalProps {
  open: boolean
  onClose: () => void
}

export function WelcomeModal({ open, onClose }: WelcomeModalProps) {
  const { showWelcome, set, recentProjects } = useSettings()
  const { setLeftTab } = useWorkspace()
  const [dontShow, setDontShow] = useState(!showWelcome)
  const [applyingTemplate, setApplyingTemplate] = useState<string | null>(null)

  const handleClose = () => {
    if (dontShow) set("showWelcome", false)
    onClose()
  }

  const handleNewWorkspace = async () => {
    if (!db) return
    await db.files.clear()
    const srcId = nanoid()
    await db.files.add({ id: srcId, name: "src", path: "/src", type: "folder", parentId: null, modified: Date.now() })
    await db.files.add({
      id: nanoid(), name: "main.ts", path: "/src/main.ts", type: "file", parentId: srcId,
      content: "// Start coding here\nconsole.log('Hello, AstroLaunch ⌁')\n",
      baseline: "// Start coding here\nconsole.log('Hello, AstroLaunch ⌁')\n",
      language: "typescript", modified: Date.now(),
    })
    await db.files.add({
      id: nanoid(), name: "README.md", path: "/README.md", type: "file", parentId: null,
      content: "# My Workspace\n\nBuilt with **AstroLaunch** ⌁\n",
      baseline: "# My Workspace\n\nBuilt with **AstroLaunch** ⌁\n",
      language: "markdown", modified: Date.now(),
    })
    setLeftTab("files")
    toast.success("New workspace created")
    handleClose()
  }

  const handleOpenProject = () => {
    // Use the File System Access API if available
    if ("showDirectoryPicker" in window) {
      ;(window as unknown as { showDirectoryPicker: () => Promise<unknown> })
        .showDirectoryPicker()
        .then(() => {
          toast.info("Folder selected — use the agent to scaffold files")
          handleClose()
        })
        .catch(() => {})
    } else {
      toast.info("Folder picker not supported — paste code into the editor or use the agent")
      handleClose()
    }
  }

  const handleTemplate = async (templateId: string) => {
    const t = TEMPLATES.find((t) => t.id === templateId)
    if (!t) return
    setApplyingTemplate(templateId)
    try {
      await applyTemplate(t)
      setLeftTab("files")
      toast.success(`${t.emoji} ${t.name} template applied!`)
      handleClose()
    } catch (e) {
      toast.error(`Failed to apply template: ${String(e)}`)
    } finally {
      setApplyingTemplate(null)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="w-[680px] max-h-[90vh] bg-al-panel border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="px-8 py-6 border-b border-border bg-gradient-to-br from-violet-500/10 via-fuchsia-500/5 to-transparent">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-cyan-400 flex items-center justify-center text-xl font-bold text-white shadow-xl shadow-violet-500/30">
                    ⌁
                  </div>
                  <div>
                    <h1 className="text-xl font-bold tracking-tight">AstroLaunch</h1>
                    <p className="text-xs text-muted-foreground">Next-generation AI-powered IDE</p>
                  </div>
                </div>
                <button
                  onClick={handleClose}
                  className="text-muted-foreground hover:text-foreground transition p-1.5 rounded-md hover:bg-foreground/10"
                >
                  <AppIcon name="close" width={16} />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-auto p-6 space-y-6">
              {/* Quick actions */}
              <div>
                <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-3">Start</h2>
                <div className="grid grid-cols-2 gap-3">
                  <QuickAction
                    icon="plus"
                    title="New Workspace"
                    description="Blank workspace with starter files"
                    accent="violet"
                    onClick={handleNewWorkspace}
                  />
                  <QuickAction
                    icon="folder"
                    title="Open Project Folder"
                    description="Open an existing folder from disk"
                    accent="blue"
                    onClick={handleOpenProject}
                  />
                </div>
              </div>

              {/* Templates */}
              <div>
                <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-3">Templates</h2>
                <div className="grid grid-cols-3 gap-2">
                  {TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => handleTemplate(t.id)}
                      disabled={applyingTemplate !== null}
                      className={cn(
                        "group flex flex-col items-start gap-2 p-3 rounded-lg border border-border hover:border-al-accent/60 hover:bg-al-accent/5 transition text-left",
                        applyingTemplate === t.id && "opacity-70 cursor-wait"
                      )}
                    >
                      <div className="text-2xl">{t.emoji}</div>
                      <div>
                        <div className="text-xs font-semibold">{t.name}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{t.description}</div>
                      </div>
                      {applyingTemplate === t.id && (
                        <div className="text-[10px] text-al-accent animate-pulse">Applying…</div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Recent projects */}
              {recentProjects.length > 0 && (
                <div>
                  <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-3">Recent</h2>
                  <div className="space-y-1">
                    {recentProjects.map((p) => (
                      <button
                        key={p}
                        onClick={() => { toast.info(`Re-open: ${p}`); handleClose() }}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-foreground/5 transition text-left text-xs"
                      >
                        <AppIcon name="folder" width={14} className="text-amber-400 flex-shrink-0" />
                        <span className="truncate text-muted-foreground hover:text-foreground">{p}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-border flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={dontShow}
                  onChange={(e) => setDontShow(e.target.checked)}
                  className="rounded border-border accent-violet-500"
                />
                Don't show again
              </label>
              <Button size="sm" variant="ghost" onClick={handleClose}>
                Skip
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function QuickAction({
  icon, title, description, accent, onClick,
}: {
  icon: string
  title: string
  description: string
  accent: "violet" | "blue"
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group flex items-center gap-3 p-4 rounded-lg border border-border hover:border-opacity-100 transition text-left",
        accent === "violet" ? "hover:border-violet-500/60 hover:bg-violet-500/5" : "hover:border-blue-500/60 hover:bg-blue-500/5"
      )}
    >
      <div className={cn(
        "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0",
        accent === "violet" ? "bg-violet-500/20 text-violet-400" : "bg-blue-500/20 text-blue-400"
      )}>
        <AppIcon name={icon} width={18} />
      </div>
      <div>
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">{description}</div>
      </div>
    </button>
  )
}
