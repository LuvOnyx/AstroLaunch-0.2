"use client"
/**
 * Git / GitHub source-control panel.
 *
 * v0.2 polish:
 *   - real change detection by comparing each file's content to its baseline
 *   - per-file checkbox staging
 *   - revert button per file
 *   - history list (last 20 commits, kept locally)
 */
import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { AppIcon } from "@/lib/iconify"
import { db } from "@/lib/storage/db"
import { cn } from "@/lib/utils"
import { useWorkspace } from "@/store/workspace"
import { toast } from "sonner"

interface GitFileChange {
  path: string
  status: "added" | "modified" | "deleted"
  fileId: string
}

interface LocalCommit {
  sha: string
  message: string
  branch: string
  files: string[]
  ts: number
}

const HISTORY_KEY = "astrolaunch.git.history.v2"

export function GitPanel() {
  const [branch, setBranch] = useState("main")
  const [changes, setChanges] = useState<GitFileChange[]>([])
  const [staged, setStaged] = useState<Set<string>>(new Set())
  const [commitMsg, setCommitMsg] = useState("")
  const [remote, setRemote] = useState("")
  const [token, setToken] = useState("")
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [history, setHistory] = useState<LocalCommit[]>([])
  const { setDiffViewer } = useWorkspace()

  const append = (s: string) => setLog((l) => [...l.slice(-50), `[${new Date().toLocaleTimeString()}] ${s}`])

  const refresh = useCallback(async () => {
    const files = await db.files.where("type").equals("file").toArray()
    const out: GitFileChange[] = []
    for (const f of files) {
      const baseline = f.baseline ?? ""
      const current = f.content ?? ""
      if (baseline === "" && current !== "") out.push({ path: f.path, status: "added", fileId: f.id })
      else if (baseline !== current) out.push({ path: f.path, status: "modified", fileId: f.id })
    }
    setChanges(out)
    setStaged((prev) => {
      const valid = new Set<string>()
      for (const c of out) if (prev.has(c.path)) valid.add(c.path)
      return valid
    })
  }, [])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 2000)
    return () => clearInterval(t)
  }, [refresh])

  useEffect(() => {
    if (typeof window === "undefined") return
    try { setHistory(JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]")) } catch {}
  }, [])

  const toggleStage = (path: string) => {
    setStaged((s) => { const n = new Set(s); n.has(path) ? n.delete(path) : n.add(path); return n })
  }
  const stageAll = () => setStaged(new Set(changes.map((c) => c.path)))
  const stageNone = () => setStaged(new Set())

  const revertFile = async (c: GitFileChange) => {
    if (!confirm(`Revert ${c.path} to baseline?`)) return
    const f = await db.files.get(c.fileId)
    if (!f) return
    await db.files.update(c.fileId, { content: f.baseline ?? "", agentTouched: 0 })
    refresh()
  }

  const onCommit = async () => {
    if (!commitMsg.trim()) { toast.error("Enter a commit message"); return }
    const stagedChanges = changes.filter((c) => staged.has(c.path))
    if (stagedChanges.length === 0) { toast.error("No staged files"); return }
    setBusy(true)
    append(`Committing ${stagedChanges.length} files: "${commitMsg}"`)
    try {
      const res = await fetch("/api/git", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "commit", branch, message: commitMsg, files: stagedChanges.map((c) => c.path) }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? "commit failed")
      // Update baselines for staged files so they stop showing as changed
      for (const c of stagedChanges) {
        const f = await db.files.get(c.fileId)
        if (f) await db.files.update(c.fileId, { baseline: f.content ?? "", agentTouched: 0 })
      }
      const entry: LocalCommit = { sha: data.sha, message: commitMsg, branch, files: stagedChanges.map((c) => c.path), ts: Date.now() }
      const next = [entry, ...history].slice(0, 20)
      setHistory(next)
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)) } catch {}
      append(`✓ Commit ${data.sha.slice(0, 7)}`)
      setCommitMsg("")
      setStaged(new Set())
      refresh()
      toast.success("Commit recorded")
    } catch (e) {
      append(`✗ ${String(e)}`)
      toast.error(`Commit failed: ${String(e)}`)
    }
    finally { setBusy(false) }
  }

  const onPush = async () => {
    if (!remote || !token) return toast.error("Set remote URL and a GitHub token first.")
    setBusy(true)
    append(`Pushing to ${remote} (${branch})…`)
    try {
      const res = await fetch("/api/git", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "push", branch, remote, token }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? "push failed")
      append(`✓ Pushed as @${data.user}`)
      toast.success(`Pushed as @${data.user}`)
    } catch (e) {
      append(`✗ ${String(e)}`)
      toast.error(`Push failed: ${String(e)}`)
    }
    finally { setBusy(false) }
  }

  return (
    <div className="h-full flex flex-col text-xs">
      <div className="p-2 border-b border-border space-y-2">
        <div className="flex items-center gap-2">
          <AppIcon name="branch" width={14} className="text-emerald-400" />
          <Input value={branch} onChange={(e) => setBranch(e.target.value)} className="h-7 text-xs" />
        </div>
        <Textarea
          rows={2}
          value={commitMsg}
          onChange={(e) => setCommitMsg(e.target.value)}
          placeholder="Commit message…"
          className="text-xs"
        />
        <div className="flex gap-1">
          <Button size="sm" className="flex-1 h-7" onClick={onCommit} disabled={busy || !commitMsg || staged.size === 0}>
            <AppIcon name="commit" width={12} /> Commit ({staged.size})
          </Button>
          <Button size="sm" variant="outline" className="flex-1 h-7" onClick={onPush} disabled={busy}>
            <AppIcon name="github" width={12} /> Push
          </Button>
        </div>
      </div>

      <div className="p-2 border-b border-border space-y-1">
        <div className="text-[10px] uppercase text-muted-foreground">GitHub Remote</div>
        <Input
          value={remote}
          onChange={(e) => setRemote(e.target.value)}
          placeholder="https://github.com/user/repo.git"
          className="h-7 text-xs"
        />
        <Input
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Personal access token (ghp_…)"
          type="password"
          className="h-7 text-xs"
        />
      </div>

      <div className="flex-1 overflow-auto">
        <div className="px-2 pt-2 flex items-center justify-between">
          <span className="text-[10px] uppercase text-muted-foreground">Changes ({changes.length})</span>
          <div className="flex gap-1">
            <button onClick={stageAll} className="text-[10px] text-muted-foreground hover:text-foreground">Stage all</button>
            <span className="text-[10px] text-muted-foreground">·</span>
            <button onClick={stageNone} className="text-[10px] text-muted-foreground hover:text-foreground">Unstage all</button>
          </div>
        </div>
        {changes.length === 0 && <div className="px-3 py-3 text-muted-foreground">Working tree clean.</div>}
        {changes.map((c) => (
          <div key={c.path} className="group flex items-center gap-2 px-2 py-1 hover:bg-accent/30">
            <input
              type="checkbox"
              checked={staged.has(c.path)}
              onChange={() => toggleStage(c.path)}
              className="accent-violet-500"
            />
            <span className={cn(
              "w-3 text-center font-bold",
              c.status === "modified" && "text-amber-400",
              c.status === "deleted" && "text-red-400",
              c.status === "added" && "text-emerald-400"
            )}>{c.status[0].toUpperCase()}</span>
            <button
              className="truncate flex-1 text-left hover:text-foreground"
              onClick={() => setDiffViewer(true, c.path)}
              title="Open diff"
            >
              {c.path}
            </button>
            <button
              onClick={() => revertFile(c)}
              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
              title="Revert"
            >
              <AppIcon name="refresh" width={11} />
            </button>
          </div>
        ))}

        {history.length > 0 && (
          <>
            <div className="px-2 pt-3 text-[10px] uppercase text-muted-foreground">History</div>
            {history.slice(0, 8).map((h) => (
              <div key={h.sha} className="px-3 py-1 border-l-2 border-border ml-2 text-[11px]">
                <div className="flex items-center gap-2">
                  <code className="text-emerald-400">{h.sha.slice(0, 7)}</code>
                  <span className="truncate">{h.message}</span>
                </div>
                <div className="text-[10px] text-muted-foreground">{h.files.length} files · {new Date(h.ts).toLocaleString()}</div>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="border-t border-border h-24 overflow-auto bg-al-panel/40 p-2 text-[10px] font-mono text-muted-foreground">
        {log.map((l, i) => <div key={i}>{l}</div>)}
      </div>
    </div>
  )
}
