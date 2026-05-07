"use client"
/**
 * FileTree v3 — full-featured file explorer.
 *
 * Features:
 *  - Create / rename / delete / copy / paste with right-click context menu
 *  - Drag-and-drop within the tree (above / inside / below)
 *  - Desktop drag-drop: drop files from the OS into the explorer
 *  - Agent-touched indicators + diff badge
 *  - Keyboard shortcuts (F2 rename, Delete)
 */
import { useEffect, useState, useCallback, useMemo, useRef } from "react"
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

interface ContextMenu {
  x: number; y: number; node: FileNode | null
}

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
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
  const [clipboard, setClipboard] = useState<{ node: FileNode; op: "copy" | "cut" } | null>(null)
  const [desktopDropOver, setDesktopDropOver] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)

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

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return
    const handler = (e: MouseEvent) => {
      if (!contextMenuRef.current?.contains(e.target as Node)) setContextMenu(null)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [contextMenu])

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

  // ── Create ──────────────────────────────────────────────────────────────────

  const handleCreate = async (type: "file" | "folder", parentId?: string | null, parentPath = "") => {
    const name = prompt(`New ${type} name`)
    if (!name?.trim()) return
    const id = nanoid()
    const cleanName = name.trim()
    const path = parentPath ? `${parentPath}/${cleanName}` : `/${cleanName}`
    await db.files.add({
      id, name: cleanName, path, type, parentId: parentId ?? null,
      content: type === "file" ? "" : undefined,
      baseline: type === "file" ? "" : undefined,
      language: type === "file" ? detectLang(cleanName) : undefined,
      modified: Date.now(), size: 0,
    })
    if (type === "file") openFile(id)
    if (parentId) setExpanded((s) => new Set([...s, parentId]))
    refresh()
  }

  // ── Delete ──────────────────────────────────────────────────────────────────

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}" and all its contents?`)) return
    const queue = [id]
    while (queue.length) {
      const cur = queue.shift()!
      const kids = await db.files.where("parentId").equals(cur).toArray()
      queue.push(...kids.map((k) => k.id))
      await db.files.delete(cur)
    }
    refresh()
  }

  // ── Rename ──────────────────────────────────────────────────────────────────

  const startRename = (node: FileNode) => {
    setRenaming(node.id); setRenameValue(node.name)
    setContextMenu(null)
  }

  const commitRename = async () => {
    if (!renaming) return
    const node = await db.files.get(renaming)
    if (!node || !renameValue.trim() || renameValue === node.name) { setRenaming(null); return }
    const parent = node.parentId ? await db.files.get(node.parentId) : null
    const newPath = parent ? `${parent.path}/${renameValue}` : `/${renameValue}`
    await db.files.update(node.id, { name: renameValue, path: newPath, modified: Date.now() })
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
    setRenaming(null); refresh()
  }

  // ── Copy / Paste ─────────────────────────────────────────────────────────────

  const copyNode = (node: FileNode, op: "copy" | "cut") => {
    setClipboard({ node, op })
    toast.info(`${op === "copy" ? "Copied" : "Cut"}: ${node.name}`)
    setContextMenu(null)
  }

  const pasteNode = async (targetFolder: FileNode | null) => {
    if (!clipboard) return
    const { node, op } = clipboard
    const targetParentId = targetFolder?.id ?? null
    const targetParentPath = targetFolder?.path ?? ""
    const newName = op === "copy" ? `${node.name} copy` : node.name
    const newPath = targetParentPath ? `${targetParentPath}/${newName}` : `/${newName}`

    await db.files.add({
      id: nanoid(), name: newName, path: newPath, type: node.type,
      parentId: targetParentId,
      content: node.content, baseline: node.content,
      language: node.language, modified: Date.now(), size: node.size ?? 0,
    })
    if (op === "cut") await db.files.delete(node.id)
    setClipboard(op === "cut" ? null : clipboard)
    if (targetParentId) setExpanded((s) => new Set([...s, targetParentId]))
    refresh()
    setContextMenu(null)
  }

  // ── Copy path ──────────────────────────────────────────────────────────────

  const copyPath = (node: FileNode) => {
    navigator.clipboard.writeText(node.path).then(() => toast.success("Path copied!"))
    setContextMenu(null)
  }

  // ── Drag-and-drop within tree ────────────────────────────────────────────────

  const onDragStart = (e: React.DragEvent, node: FileNode) => {
    setDragged(node.id)
    setGhostPos({ x: e.clientX, y: e.clientY, label: node.name })
    e.dataTransfer.effectAllowed = "move"
    const img = new Image(); img.src = "data:image/gif;base64,R0lGODlhAQABAAAAACw="
    e.dataTransfer.setDragImage(img, 0, 0)
  }
  const onDrag = (e: React.DragEvent) => {
    if (!ghostPos || !e.clientX) return
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

  // ── Desktop file drop ───────────────────────────────────────────────────────

  const onDesktopDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault()
      e.dataTransfer.dropEffect = "copy"
      setDesktopDropOver(true)
    }
  }
  const onDesktopDragLeave = (e: React.DragEvent) => {
    if (!containerRef.current?.contains(e.relatedTarget as Node)) setDesktopDropOver(false)
  }
  const onDesktopDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDesktopDropOver(false)
    const dropped = Array.from(e.dataTransfer.files)
    if (!dropped.length) return
    for (const f of dropped) {
      try {
        const content = await f.text()
        const id = nanoid()
        await db.files.add({
          id, name: f.name, path: `/${f.name}`, type: "file", parentId: null,
          content, baseline: content, language: detectLang(f.name),
          modified: Date.now(), size: f.size,
        })
      } catch {
        toast.error(`Failed to read: ${f.name}`)
      }
    }
    toast.success(`Imported ${dropped.length} file${dropped.length > 1 ? "s" : ""}`)
    refresh()
  }

  // ── Right-click context menu ─────────────────────────────────────────────────

  const onContextMenu = (e: React.MouseEvent, node: FileNode | null) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, node })
  }

  // ── Seed empty workspace ────────────────────────────────────────────────────

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
          content: `# My AstroLaunch project\n\nAsk the agent to build something amazing!\n`,
          baseline: `# My AstroLaunch project\n\nAsk the agent to build something amazing!\n`,
          language: "markdown", modified: Date.now(),
        })
        refresh()
      }
    })()
  }, [refresh])

  return (
    <div
      ref={containerRef}
      className={cn("h-full flex flex-col text-xs relative", desktopDropOver && "ring-2 ring-al-accent ring-inset")}
      onDragEnd={cleanup}
      onDragOver={onDesktopDragOver}
      onDragLeave={onDesktopDragLeave}
      onDrop={onDesktopDrop}
      onContextMenu={(e) => onContextMenu(e, null)}
    >
      {/* Desktop drop overlay */}
      <AnimatePresence>
        {desktopDropOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 flex items-center justify-center bg-al-accent/10 border-2 border-dashed border-al-accent rounded-lg m-1 pointer-events-none"
          >
            <div className="text-center space-y-1">
              <AppIcon name="plus" width={24} className="mx-auto text-al-accent" />
              <div className="text-al-accent font-medium">Drop files to import</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toolbar */}
      <div className="flex items-center justify-between p-2 gap-1 border-b border-border flex-shrink-0">
        <span className="text-muted-foreground">{files.length} items</span>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon-sm" onClick={() => handleCreate("file")} title="New file (⌘N)">
            <AppIcon name="plus" width={13} />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => handleCreate("folder")} title="New folder (⌘⇧N)">
            <AppIcon name="folder" width={13} />
          </Button>
          {clipboard && (
            <Button variant="ghost" size="icon-sm" onClick={() => pasteNode(null)} title="Paste here">
              <AppIcon name="copy" width={13} className="text-al-accent" />
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" onClick={refresh} title="Refresh">
            <AppIcon name="refresh" width={13} />
          </Button>
        </div>
      </div>

      {/* Tree */}
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
                onDragOver={(e) => { e.stopPropagation(); onDragOver(e, node) }}
                onDragLeave={() => setDropTarget(null)}
                onDrop={(e) => { e.stopPropagation(); onDrop(e, node) }}
                onClick={() => node.type === "folder" ? toggle(node.id) : openFile(node.id)}
                onDoubleClick={(e) => { e.stopPropagation(); startRename(node) }}
                onContextMenu={(e) => onContextMenu(e, node)}
                onKeyDown={(e) => {
                  if (e.key === "F2") startRename(node)
                  if (e.key === "Delete") handleDelete(node.id, node.name)
                }}
                tabIndex={0}
                className={cn(
                  "group flex items-center gap-1.5 px-2 py-0.5 cursor-pointer select-none focus:outline-none focus:bg-al-accent/10",
                  activeFileId === node.id && "bg-al-accent/15 text-foreground",
                  showInside && "al-drop-target",
                  draggedFileId === node.id && "opacity-40",
                  "hover:bg-accent/30"
                )}
                style={{ paddingLeft: 8 + depth * 12 }}
              >
                {node.type === "folder" ? (
                  <AppIcon name={ex ? "folder-open" : "folder"} width={14} className="text-amber-400 flex-shrink-0" />
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
                  <span className="truncate flex-1">{node.name}</span>
                )}

                <div className="flex items-center gap-1 ml-auto">
                  {node.agentTouched && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setDiffViewer(true, node.path) }}
                      title="Agent edits — click for diff"
                      className="w-1.5 h-1.5 rounded-full bg-amber-400 hover:bg-amber-300"
                    />
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(node.id, node.name) }}
                    className="opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
                    title="Delete"
                  >
                    <AppIcon name="trash" width={11} />
                  </button>
                </div>
              </div>
              {showLineAfter && <div className="al-drop-line" />}
            </div>
          )
        })}
      </div>

      {/* Drag ghost */}
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

      {/* Context menu */}
      <AnimatePresence>
        {contextMenu && (
          <motion.div
            ref={contextMenuRef}
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.1 }}
            style={{
              position: "fixed",
              left: contextMenu.x,
              top: contextMenu.y,
              zIndex: 9999,
            }}
            className="min-w-[180px] bg-al-panel border border-border rounded-lg shadow-2xl py-1 text-xs"
          >
            {contextMenu.node ? (
              <>
                <CtxItem icon="plus" label="New File Here" onClick={() => {
                  const n = contextMenu.node!
                  const parent = n.type === "folder" ? n : files.find((f) => f.id === n.parentId)
                  handleCreate("file", parent?.id ?? null, parent?.path ?? "")
                  setContextMenu(null)
                }} />
                <CtxItem icon="folder" label="New Folder Here" onClick={() => {
                  const n = contextMenu.node!
                  const parent = n.type === "folder" ? n : files.find((f) => f.id === n.parentId)
                  handleCreate("folder", parent?.id ?? null, parent?.path ?? "")
                  setContextMenu(null)
                }} />
                <CtxSep />
                <CtxItem icon="edit" label="Rename" shortcut="F2" onClick={() => startRename(contextMenu.node!)} />
                <CtxItem icon="copy" label="Copy" onClick={() => copyNode(contextMenu.node!, "copy")} />
                <CtxItem icon="copy" label="Cut" onClick={() => copyNode(contextMenu.node!, "cut")} />
                {clipboard && contextMenu.node.type === "folder" && (
                  <CtxItem icon="copy" label="Paste Inside" onClick={() => pasteNode(contextMenu.node!)} />
                )}
                <CtxSep />
                <CtxItem icon="link" label="Copy Path" onClick={() => copyPath(contextMenu.node!)} />
                {contextMenu.node.agentTouched && (
                  <CtxItem icon="diff" label="View Diff" onClick={() => {
                    setDiffViewer(true, contextMenu.node!.path)
                    setContextMenu(null)
                  }} />
                )}
                <CtxSep />
                <CtxItem icon="trash" label="Delete" danger onClick={() => {
                  handleDelete(contextMenu.node!.id, contextMenu.node!.name)
                  setContextMenu(null)
                }} />
              </>
            ) : (
              <>
                <CtxItem icon="plus" label="New File" onClick={() => { handleCreate("file"); setContextMenu(null) }} />
                <CtxItem icon="folder" label="New Folder" onClick={() => { handleCreate("folder"); setContextMenu(null) }} />
                {clipboard && <CtxItem icon="copy" label="Paste Here" onClick={() => pasteNode(null)} />}
                <CtxSep />
                <CtxItem icon="refresh" label="Refresh" onClick={() => { refresh(); setContextMenu(null) }} />
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Context menu helpers ──────────────────────────────────────────────────────

function CtxItem({
  icon, label, shortcut, onClick, danger,
}: {
  icon: string
  label: string
  shortcut?: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors",
        danger ? "text-red-400 hover:bg-red-500/10" : "text-foreground hover:bg-foreground/10"
      )}
    >
      <AppIcon name={icon} width={12} className={cn("flex-shrink-0", danger && "text-red-400")} />
      <span className="flex-1">{label}</span>
      {shortcut && <span className="text-muted-foreground text-[10px]">{shortcut}</span>}
    </button>
  )
}

function CtxSep() {
  return <div className="my-0.5 h-px bg-border/60" />
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function detectLang(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? ""
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescriptreact", js: "javascript", jsx: "javascriptreact",
    json: "json", css: "css", html: "html", md: "markdown", lua: "lua",
    py: "python", rs: "rust", go: "go", sh: "shell", yaml: "yaml", yml: "yaml",
  }
  return map[ext] ?? "plaintext"
}
