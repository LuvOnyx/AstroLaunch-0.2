"use client"
/**
 * Side-by-side / unified diff viewer used to inspect agent edits.
 * Open via the workspace.setDiffViewer(true, path).
 */
import { useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useWorkspace } from "@/store/workspace"
import { db } from "@/lib/storage/db"
import { diffLines, type DiffLine } from "@/lib/agents/diff"
import { Button } from "@/components/ui/button"
import { AppIcon } from "@/lib/iconify"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

export function DiffViewer() {
  const { diffViewerOpen, diffViewerPath, setDiffViewer } = useWorkspace()
  const [before, setBefore] = useState("")
  const [after, setAfter] = useState("")
  const [view, setView] = useState<"unified" | "split">("split")

  useEffect(() => {
    (async () => {
      if (!diffViewerOpen || !diffViewerPath) return
      const f = await db.files.where("path").equals(diffViewerPath).first()
      setBefore(f?.baseline ?? "")
      setAfter(f?.content ?? "")
    })()
  }, [diffViewerOpen, diffViewerPath])

  const diff = useMemo(() => diffLines(before, after), [before, after])

  const acceptChanges = async () => {
    if (!diffViewerPath) return
    const f = await db.files.where("path").equals(diffViewerPath).first()
    if (!f) return
    await db.files.update(f.id, { baseline: after, agentTouched: 0 })
    toast.success("Changes accepted")
    setDiffViewer(false)
  }

  const revert = async () => {
    if (!diffViewerPath) return
    const f = await db.files.where("path").equals(diffViewerPath).first()
    if (!f) return
    await db.files.update(f.id, { content: f.baseline ?? "", agentTouched: 0 })
    toast.success("Reverted to baseline")
    setDiffViewer(false)
  }

  return (
    <Dialog open={diffViewerOpen} onOpenChange={(o) => !o && setDiffViewer(false)}>
      <DialogContent className="max-w-5xl p-0 max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AppIcon name="file" width={14} />
            Diff: <span className="font-mono text-xs">{diffViewerPath}</span>
            <div className="ml-auto flex items-center gap-1 text-xs">
              <Button size="sm" variant={view === "split" ? "default" : "ghost"} className="h-7" onClick={() => setView("split")}>Split</Button>
              <Button size="sm" variant={view === "unified" ? "default" : "ghost"} className="h-7" onClick={() => setView("unified")}>Unified</Button>
              <span className="ml-3 text-emerald-400">+{diff.added}</span>
              <span className="text-red-400">-{diff.removed}</span>
            </div>
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-auto font-mono text-[11px] leading-5">
          {view === "split" ? <SplitView lines={diff.lines} /> : <UnifiedView lines={diff.lines} />}
        </div>
        <div className="border-t border-border p-3 flex gap-2 justify-end">
          <Button size="sm" variant="outline" onClick={revert}>Revert to baseline</Button>
          <Button size="sm" onClick={acceptChanges}>Accept changes</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function UnifiedView({ lines }: { lines: DiffLine[] }) {
  return (
    <div className="p-2">
      {lines.map((l, i) => (
        <div key={i} className={cn(
          "flex",
          l.type === "add" && "bg-emerald-500/10",
          l.type === "remove" && "bg-red-500/10",
        )}>
          <span className="w-10 text-right pr-2 text-muted-foreground select-none">{l.before ?? ""}</span>
          <span className="w-10 text-right pr-2 text-muted-foreground select-none">{l.after ?? ""}</span>
          <span className={cn(
            "w-4 select-none",
            l.type === "add" && "text-emerald-400",
            l.type === "remove" && "text-red-400",
          )}>{l.type === "add" ? "+" : l.type === "remove" ? "-" : " "}</span>
          <span className="whitespace-pre flex-1">{l.content}</span>
        </div>
      ))}
    </div>
  )
}

function SplitView({ lines }: { lines: DiffLine[] }) {
  // Render as paired columns
  return (
    <div className="grid grid-cols-2">
      <div className="border-r border-border">
        {lines.map((l, i) => (
          <div key={i} className={cn("flex", l.type === "remove" && "bg-red-500/10", l.type === "add" && "bg-background/30")}>
            <span className="w-10 text-right pr-2 text-muted-foreground select-none">{l.before ?? ""}</span>
            <span className="whitespace-pre flex-1">{l.type !== "add" ? l.content : ""}</span>
          </div>
        ))}
      </div>
      <div>
        {lines.map((l, i) => (
          <div key={i} className={cn("flex", l.type === "add" && "bg-emerald-500/10", l.type === "remove" && "bg-background/30")}>
            <span className="w-10 text-right pr-2 text-muted-foreground select-none">{l.after ?? ""}</span>
            <span className="whitespace-pre flex-1">{l.type !== "remove" ? l.content : ""}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
