"use client"
/**
 * SearchPanel v2 — debounced full-text search with regex support, case-insensitive
 * by default, grouped by file, click to jump.
 */
import { useState, useEffect, useMemo } from "react"
import { Input } from "@/components/ui/input"
import { db } from "@/lib/storage/db"
import type { FileNode } from "@/types"
import { useWorkspace } from "@/store/workspace"
import { FileIcon, AppIcon } from "@/lib/iconify"
import { cn } from "@/lib/utils"
import { Switch } from "@/components/ui/switch"

interface Hit { file: FileNode; line: number; preview: string }

export function SearchPanel() {
  const [q, setQ] = useState("")
  const [useRegex, setUseRegex] = useState(false)
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [results, setResults] = useState<Hit[]>([])
  const [searching, setSearching] = useState(false)
  const { openFile } = useWorkspace()

  useEffect(() => {
    if (!q.trim()) { setResults([]); return }
    let cancelled = false
    setSearching(true)
    const timer = setTimeout(async () => {
      const all = await db.files.where("type").equals("file").toArray()
      const out: Hit[] = []
      let needle: RegExp
      try {
        needle = useRegex
          ? new RegExp(q, caseSensitive ? "" : "i")
          : new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), caseSensitive ? "" : "i")
      } catch { setResults([]); setSearching(false); return }
      for (const f of all) {
        const lines = (f.content ?? "").split("\n")
        for (let i = 0; i < lines.length; i++) {
          if (needle.test(lines[i])) {
            out.push({ file: f, line: i + 1, preview: lines[i].trim().slice(0, 160) })
            if (out.length > 200) break
          }
        }
        if (out.length > 200) break
      }
      if (!cancelled) { setResults(out); setSearching(false) }
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [q, useRegex, caseSensitive])

  const grouped = useMemo(() => {
    const m = new Map<string, Hit[]>()
    for (const h of results) {
      const arr = m.get(h.file.path) ?? []
      arr.push(h); m.set(h.file.path, arr)
    }
    return Array.from(m.entries())
  }, [results])

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 border-b border-border space-y-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={useRegex ? "Regex pattern…" : "Search across files…"}
          className="h-8 text-xs"
        />
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <label className="flex items-center gap-1 cursor-pointer">
            <Switch checked={useRegex} onCheckedChange={setUseRegex} className="scale-75" /> regex
          </label>
          <label className="flex items-center gap-1 cursor-pointer">
            <Switch checked={caseSensitive} onCheckedChange={setCaseSensitive} className="scale-75" /> Aa
          </label>
          <span className="ml-auto">{searching ? "searching…" : `${results.length} hits`}</span>
        </div>
      </div>
      <div className="flex-1 overflow-auto text-xs">
        {grouped.length === 0 && q && !searching && (
          <div className="p-3 text-muted-foreground">No matches.</div>
        )}
        {grouped.map(([path, hits]) => (
          <div key={path}>
            <div className="px-3 py-1 flex items-center gap-2 bg-background/30 sticky top-0 border-b border-border/40">
              <FileIcon filename={path.split("/").pop() ?? ""} width={13} />
              <span className="font-medium truncate">{path}</span>
              <span className="ml-auto text-[10px] text-muted-foreground">{hits.length}</span>
            </div>
            {hits.map((h, i) => (
              <button
                key={`${h.file.id}:${h.line}:${i}`}
                onClick={() => openFile(h.file.id)}
                className={cn("w-full text-left px-4 py-1 hover:bg-accent/40 flex items-center gap-2")}
              >
                <span className="text-muted-foreground w-8 text-right">{h.line}</span>
                <span className="text-muted-foreground truncate font-mono">{h.preview}</span>
              </button>
            ))}
          </div>
        ))}
        {!q && (
          <div className="p-4 text-muted-foreground space-y-1">
            <div>Type to search across all files.</div>
            <div className="flex items-center gap-1 text-[10px]"><AppIcon name="info" width={11} /> Toggle regex / case-sensitive above.</div>
          </div>
        )}
      </div>
    </div>
  )
}
