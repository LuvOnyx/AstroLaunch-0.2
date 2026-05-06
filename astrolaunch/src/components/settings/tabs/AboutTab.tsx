"use client"
import { Button } from "@/components/ui/button"
import { useSettings } from "@/store/settings"
import { db } from "@/lib/storage/db"
import { toast } from "sonner"

export function AboutTab() {
  const reset = useSettings((s) => s.reset)

  const exportProject = async () => {
    if (!db) return
    const files = await db.files.toArray()
    const chats = await db.chats.toArray()
    const messages = await db.messages.toArray()
    const tasks = await db.tasks.toArray()
    const plugins = await db.plugins.toArray()
    const blob = new Blob([JSON.stringify({ files, chats, messages, tasks, plugins, exportedAt: Date.now() }, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `astrolaunch-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success("Workspace exported")
  }

  const importProject = async () => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = "application/json"
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      const text = await file.text()
      try {
        const data = JSON.parse(text)
        if (Array.isArray(data.files)) await db.files.bulkPut(data.files)
        if (Array.isArray(data.chats)) await db.chats.bulkPut(data.chats)
        if (Array.isArray(data.messages)) await db.messages.bulkPut(data.messages)
        if (Array.isArray(data.tasks)) await db.tasks.bulkPut(data.tasks)
        if (Array.isArray(data.plugins)) await db.plugins.bulkPut(data.plugins)
        toast.success("Imported workspace")
      } catch (e) { toast.error(`Import failed: ${String(e)}`) }
    }
    input.click()
  }

  const wipe = async () => {
    if (!confirm("This will delete all files, chats, tasks, and plugins. Continue?")) return
    await db.files.clear(); await db.chats.clear(); await db.messages.clear()
    await db.tasks.clear(); await db.plugins.clear(); await db.usage.clear(); await db.terminals.clear()
    toast.success("Workspace cleared. Reload to re-seed defaults.")
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-violet-500 via-fuchsia-500 to-cyan-400 flex items-center justify-center text-2xl text-white">⌁</div>
          <div>
            <div className="text-lg font-semibold">AstroLaunch</div>
            <div className="text-xs text-muted-foreground">v0.2.0 — IDE + Design Workstation</div>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          AstroLaunch unifies VS Code-class editing, Penpot design canvas, WebContainers live preview,
          a multi-agent task system with intelligent <code>is_done</code> flags, an integrated
          xterm.js terminal, and a sandboxed plugin SDK into one workstation.
        </p>
      </div>
      <div className="rounded-md border border-border p-4 space-y-2 text-xs">
        <div><span className="text-muted-foreground">Editor:</span> Monaco + rainbow brackets + ⌘I AI inline edit</div>
        <div><span className="text-muted-foreground">Design:</span> Penpot embed bridge</div>
        <div><span className="text-muted-foreground">Live preview:</span> StackBlitz WebContainers</div>
        <div><span className="text-muted-foreground">Terminal:</span> xterm.js attached to a jsh process inside the WebContainer</div>
        <div><span className="text-muted-foreground">Agents:</span> Architect → Builder → Reviewer with bounded iterations, retries, cost cap, streaming, tool diffs</div>
        <div><span className="text-muted-foreground">Plugins:</span> sandboxed iframes + postMessage SDK + permission prompts</div>
        <div><span className="text-muted-foreground">Storage:</span> IndexedDB (Dexie v2) — files, chats, tasks, plugins, terminals, usage</div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={exportProject}>Export workspace JSON</Button>
        <Button variant="outline" size="sm" onClick={importProject}>Import workspace JSON</Button>
        <Button variant="destructive" size="sm" onClick={wipe}>Wipe workspace</Button>
        <Button variant="destructive" size="sm" onClick={() => { if (confirm("Reset all settings to defaults?")) reset() }}>Reset settings</Button>
      </div>
    </div>
  )
}
