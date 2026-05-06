"use client"
/**
 * FileTree v2 — drag-and-drop with above/below/inside drop zones, agent-touched
 * indicators (yellow dot), pending-diff badge, and right-click context menu.
 */
import { useEffect, useState, useCallback, useMemo } from "react"
import { db } from "@/lib/storage/db"
import type { FileNode } from "@/types"
import { useWorkspace } from "@/store/workspace"
import { AppIcon, FileIcon } from "@/lib/iconify"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { nanoid } from "nanoid"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

interface TreeRow { node: FileNode; depth: number; expanded: boolean }

export function FileTree() {
  const [files, setFiles] = useState<FileNode[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const {
    activeFileId, openFile, draggedFileId, setDragged,
    dropTargetId, dropPosition, setDropTarget, setDiffViewer,
  } = useWorkspace()
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number; label: string } | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")

  const refresh = useCallback(async () => {
    if (!db) return
    const all = await db.files.toArray()
    setFiles(all)
  }, [])

  useEffect(() => { refresh() }, [refresh])
  useEffect(() => {
    const t = setInterval(refresh, 1500)
    return () => clearInterval(t)
  }, [refresh])

  const rows: TreeRow[] = useMemo(() => {
    const byParent = new Map<string | null, FileNode[]>()
    for (const f of files) {
      const list = byParent.get(f.parentId) ?? []
      list.push(f)
      byParent.set(f.parentId, list)
    }
    for (const list of byParent.values()) {
      list.sort((a, b) => {
        if (a.type !== b.type) return a.type === "folder" ? -1 : 1
        return a.name.localeCompare(b.name)
      })
    }
    const out: TreeRow[] = []
    const walk = (parent: string | null, depth: number) => {
      const list = byParent.get(parent) ?? []
      for (const node of list) {
        const isExpanded = expanded.has(node.id)
        out.push({ node, depth, expanded: isExpanded })
        if (node.type === "folder" && isExpanded) walk(node.id, depth + 1)
      }
    }
    walk(null, 0)
    return out
  }, [files, expanded])

  const toggle = (id: string) => {
    setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const handleCreate = async (type: "file" | "folder", parentPath = "") => {
    const name = prompt(`New ${type} name`)
    if (!name) return
    const id = nanoid()
    const path = parentPath ? `${parentPath}/${name}` : `/${name}`
    const parent = parentPath ? await db.files.where("path").equals(parentPath).first() : null
    await db.files.add({
      id, name, path, type, parentId: parent?.id ?? null,
      content: type === "file" ? "" : undefined,
      modified: Date.now(), size: 0,
    })
    if (type === "file") openFile(id)
    refresh()
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this item (and its descendants)?")) return
    const queue = [id]
    while (queue.length) {
      const cur = queue.shift()!
      const kids = await db.files.where("parentId").equals(cur).toArray()
      queue.push(...kids.map((k) => k.id))
      await db.files.delete(cur)
    }
    refresh()
  }

  const startRename = (node: FileNode) => {
    setRenaming(node.id); setRenameValue(node.name)
  }
  const commitRename = async () => {
    if (!renaming) return
    const node = await db.files.get(renaming)
    if (!node || !renameValue.trim() || renameValue === node.name) { setRenaming(null); return }
    const parent = node.parentId ? await db.files.get(node.parentId) : null
    const newPath = parent ? `${parent.path}/${renameValue}` : `/${renameValue}`
    await db.files.update(node.id, { name: renameValue, path: newPath, modified: Date.now() })
    // Rename descendants' paths
    if (node.type === "folder") {
      const queue = [node.id]
      while (queue.length) {
        const cur = queue.shift()!
        const kids = await db.files.where("parentId").equals(cur).toArray()
        for (const k of kids) {
          const kp = await db.files.get(k.parentId!)
          await db.files.update(k.id, { path: `${kp!.path}/${k.name}` })
          queue.push(k.id)
        }
      }
    }
    setRenaming(null)
    refresh()
  }

  // DnD with drop position (above/inside/below)
  const onDragStart = (e: React.DragEvent, node: FileNode) => {
    setDragged(node.id)
    setGhostPos({ x: e.clientX, y: e.clientY, label: node.name })
    e.dataTransfer.effectAllowed = "move"
    const img = new Image(); img.src = "data:image/gif;base64,R0lGODlhAQABAAAAACw="
    e.dataTransfer.setDragImage(img, 0, 0)
  }
  const onDrag = (e: React.DragEvent) => {
    if (!ghostPos) return
    setGhostPos((p) => p ? { ...p, x: e.clientX, y: e.clientY } : p)
  }
  const onDragOver = (e: React.DragEvent, node: FileNode) => {
    e.preventDefault(); e.dataTransfer.dropEffect = "move"
    if (node.id === draggedFileId) return
    const rect = e.currentTarget.getBoundingClientRect()
    const offset = e.clientY - rect.top
    const h = rect.height
    let pos: "before" | "inside" | "after"
    if (node.type === "folder") {
      pos = offset < h * 0.25 ? "before" : offset > h * 0.75 ? "after" : "inside"
    } else {
      pos = offset < h * 0.5 ? "before" : "after"
    }
    setDropTarget(node.id, pos)
  }
  const onDrop = async (e: React.DragEvent, target: FileNode) => {
    e.preventDefault()
    if (!draggedFileId || draggedFileId === target.id) return cleanup()
    const dragged = await db.files.get(draggedFileId)
    if (!dragged) return cleanup()
    if (dragged.type === "folder") {
      let cur: FileNode | undefined = target
      while (cur) {
        if (cur.id === dragged.id) return cleanup()
        cur = cur.parentId ? await db.files.get(cur.parentId) : undefined
      }
    }
    let newParentId: string | null
    if (dropPosition === "inside" && target.type === "folder") newParentId = target.id
    else newParentId = target.parentId
    const parentNode = newParentId ? await db.files.get(newParentId) : null
    const newPath = parentNode ? `${parentNode.path}/${dragged.name}` : `/${dragged.name}`
    await db.files.update(dragged.id, { parentId: newParentId, path: newPath, modified: Date.now() })
    cleanup(); refresh()
  }
  const cleanup = () => { setDragged(null); setDropTarget(null); setGhostPos(null) }

  // Seed an empty workspace with a starter file
  useEffect(() => {
    (async () => {
      if (!db) return
      const count = await db.files.count()
      if (count === 0) {
        const srcId = nanoid()
        await db.files.add({ id: srcId, name: "src", path: "/src", type: "folder", parentId: null, modified: Date.now() })
        await db.files.add({
          id: nanoid(), name: "App.tsx", path: "/src/App.tsx", type: "file", parentId: srcId,
          content: `export default function App() {\n  return <div className="p-8 text-2xl">Hello AstroLaunch ⌁</div>\n}\n`,
          baseline: `export default function App() {\n  return <div className="p-8 text-2xl">Hello AstroLaunch ⌁</div>\n}\n`,
          language: "typescript", modified: Date.now(),
        })
        await db.files.add({
          id: nanoid(), name: "README.md", path: "/README.md", type: "file", parentId: null,
          content: `# My AstroLaunch project\n\nStart with \`/build <goal>\` in the agent chat.\n`,
          baseline: `# My AstroLaunch project\n\nStart with \`/build <goal>\` in the agent chat.\n`,
          language: "markdown", modified: Date.now(),
        })
        refresh()
      }
    })()
  }, [refresh])

  return (
    <div className="h-full flex flex-col text-xs" onDragEnd={cleanup}>
      <div className="flex items-center justify-between p-2 gap-1 border-b border-border">
        <span className="text-muted-foreground">{files.length} items</span>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon-sm" onClick={() => handleCreate("file")} title="New file"><AppIcon name="plus" width={14} /></Button>
          <Button variant="ghost" size="icon-sm" onClick={() => handleCreate("folder")} title="New folder"><AppIcon name="folder" width={14} /></Button>
          <Button variant="ghost" size="icon-sm" onClick={refresh} title="Refresh"><AppIcon name="refresh" width={14} /></Button>
        </div>
      </div>
      <div className="flex-1 overflow-auto py-1">
        {rows.map(({ node, depth, expanded: ex }) => {
          const isDropTarget = dropTargetId === node.id
          const showLineBefore = isDropTarget && dropPosition === "before"
          const showLineAfter = isDropTarget && dropPosition === "after"
          const showInside = isDropTarget && dropPosition === "inside"
          return (
            <div key={node.id}>
              {showLineBefore && <div className="al-drop-line" />}
              <div
                draggable={renaming !== node.id}
                onDragStart={(e) => onDragStart(e, node)}
                onDrag={onDrag}
                onDragOver={(e) => onDragOver(e, node)}
                onDragLeave={() => setDropTarget(null)}
                onDrop={(e) => onDrop(e, node)}
                onClick={() => node.type === "folder" ? toggle(node.id) : openFile(node.id)}
                onDoubleClick={(e) => { e.stopPropagation(); startRename(node) }}
                className={cn(
                  "group flex items-center gap-1.5 px-2 py-0.5 cursor-pointer select-none",
                  activeFileId === node.id && "bg-al-accent/15 text-foreground",
                  showInside && "al-drop-target",
                  draggedFileId === node.id && "opacity-40",
                  "hover:bg-accent/30"
                )}
                style={{ paddingLeft: 8 + depth * 12 }}
              >
                {node.type === "folder" ? (
                  <AppIcon name={ex ? "folder-open" : "folder"} width={14} className="text-amber-400" />
                ) : (
                  <FileIcon filename={node.name} width={14} />
                )}
                {renaming === node.id ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenaming(null) }}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-background border border-al-accent rounded px-1 outline-none flex-1 text-xs"
                  />
                ) : (
                  <span className="truncate">{node.name}</span>
                )}
                {node.agentTouched && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setDiffViewer(true, node.path) }}
                    title="Agent edits — click for diff"
                    className="ml-auto w-1.5 h-1.5 rounded-full bg-amber-400"
                  />
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(node.id) }}
                  className={cn("ml-1 opacity-0 group-hover:opacity-100 hover:text-destructive", node.agentTouched && "ml-1")}
                >
                  <AppIcon name="trash" width={12} />
                </button>
              </div>
              {showLineAfter && <div className="al-drop-line" />}
            </div>
          )
        })}
      </div>
      <AnimatePresence>
        {ghostPos && (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="al-drag-ghost"
            style={{ left: ghostPos.x + 12, top: ghostPos.y + 12 }}
          >
            <span className="flex items-center gap-1.5">
              <AppIcon name="drag" width={12} />
              {ghostPos.label}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
