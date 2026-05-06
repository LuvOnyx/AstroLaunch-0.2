"use client"
/**
 * AgentSidebar — collapsible left panel inside FloatingAgentChat.
 *
 * Inspired by 1code's agents-sidebar.tsx design:
 *   - Chat history list with search
 *   - Quick-create new chat (auto-persona, no manual picker)
 *   - Archive / rename inline
 *   - Pin indicator for cost-heavy chats
 *   - Smooth framer-motion animations
 */
import { useState, useEffect, useCallback, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { db } from "@/lib/storage/db"
import { useWorkspace } from "@/store/workspace"
import { nanoid } from "nanoid"
import { cn } from "@/lib/utils"
import { AppIcon } from "@/lib/iconify"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import type { AgentChat } from "@/types"
import { DEFAULT_PERSONAS } from "@/lib/agents/personas"

interface AgentSidebarProps {
  streaming: boolean
  building: boolean
}

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

export function AgentSidebar({ streaming, building }: AgentSidebarProps) {
  const { activeChatId, setActiveChatId } = useWorkspace()
  const [chats, setChats] = useState<AgentChat[]>([])
  const [query, setQuery] = useState("")
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const renameRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    if (!db) return
    const all = await db.chats.orderBy("updatedAt").reverse().toArray()
    setChats(all.filter((c) => !c.archived))
  }, [])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 3000)
    return () => clearInterval(t)
  }, [refresh])

  useEffect(() => {
    if (renamingId) renameRef.current?.focus()
  }, [renamingId])

  const createChat = async () => {
    const id = nanoid()
    await db.chats.add({
      id,
      name: "New Chat",
      agentId: "builder",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    setActiveChatId(id)
    refresh()
  }

  const archiveChat = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await db.chats.update(id, { archived: 1 })
    if (activeChatId === id) setActiveChatId(null)
    refresh()
  }

  const startRename = (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setRenamingId(id)
    setRenameValue(name)
  }

  const commitRename = async () => {
    if (!renamingId) return
    if (renameValue.trim()) {
      await db.chats.update(renamingId, { name: renameValue.trim(), updatedAt: Date.now() })
    }
    setRenamingId(null)
    refresh()
  }

  const filtered = chats.filter((c) =>
    !query.trim() || c.name.toLowerCase().includes(query.toLowerCase())
  )

  const grouped = {
    today: filtered.filter((c) => Date.now() - c.updatedAt < 86400000),
    older: filtered.filter((c) => Date.now() - c.updatedAt >= 86400000),
  }

  return (
    <div className="h-full flex flex-col bg-al-panel border-r border-border text-xs min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between px-2.5 py-2 border-b border-border">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          <AppIcon name="chat" width={12} />
          Chats
        </div>
        <button
          onClick={createChat}
          className="flex items-center gap-0.5 text-[10px] text-al-accent hover:text-foreground transition rounded px-1 py-0.5 hover:bg-al-accent/10"
          title="New chat"
        >
          <AppIcon name="plus" width={12} />
          New
        </button>
      </div>

      {/* Search */}
      <div className="px-2 pt-2 pb-1">
        <div className="relative">
          <AppIcon name="search" width={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="h-6 pl-6 text-[11px] bg-background/50 border-border/60 focus:border-al-accent/60"
          />
        </div>
      </div>

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-1 py-1 space-y-0.5">
        {filtered.length === 0 && (
          <div className="text-[11px] text-muted-foreground px-2 py-4 text-center">
            {query ? "No matching chats" : "No chats yet — click New above"}
          </div>
        )}

        {grouped.today.length > 0 && (
          <GroupLabel>Today</GroupLabel>
        )}
        {grouped.today.map((c) => (
          <ChatRow
            key={c.id}
            chat={c}
            isActive={c.id === activeChatId}
            isStreaming={(streaming || building) && c.id === activeChatId}
            isRenaming={renamingId === c.id}
            renameValue={renameValue}
            renameRef={renameRef}
            onSelect={() => setActiveChatId(c.id)}
            onArchive={(e) => archiveChat(c.id, e)}
            onRenameStart={(e) => startRename(c.id, c.name, e)}
            onRenameChange={setRenameValue}
            onRenameCommit={commitRename}
          />
        ))}

        {grouped.older.length > 0 && (
          <GroupLabel>Earlier</GroupLabel>
        )}
        {grouped.older.map((c) => (
          <ChatRow
            key={c.id}
            chat={c}
            isActive={c.id === activeChatId}
            isStreaming={(streaming || building) && c.id === activeChatId}
            isRenaming={renamingId === c.id}
            renameValue={renameValue}
            renameRef={renameRef}
            onSelect={() => setActiveChatId(c.id)}
            onArchive={(e) => archiveChat(c.id, e)}
            onRenameStart={(e) => startRename(c.id, c.name, e)}
            onRenameChange={setRenameValue}
            onRenameCommit={commitRename}
          />
        ))}
      </div>
    </div>
  )
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 pt-2 pb-0.5 text-[9px] uppercase tracking-wider text-muted-foreground/50 font-medium select-none">
      {children}
    </div>
  )
}

interface ChatRowProps {
  chat: AgentChat
  isActive: boolean
  isStreaming: boolean
  isRenaming: boolean
  renameValue: string
  renameRef: React.RefObject<HTMLInputElement>
  onSelect: () => void
  onArchive: (e: React.MouseEvent) => void
  onRenameStart: (e: React.MouseEvent) => void
  onRenameChange: (v: string) => void
  onRenameCommit: () => void
}

function ChatRow({
  chat, isActive, isStreaming, isRenaming,
  renameValue, renameRef,
  onSelect, onArchive, onRenameStart, onRenameChange, onRenameCommit,
}: ChatRowProps) {
  const persona = DEFAULT_PERSONAS.find((p) => p.id === chat.agentId)
  const costHigh = (chat.totalCostUsd ?? 0) > 0.5

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -6 }}
      transition={{ duration: 0.15 }}
      onClick={onSelect}
      className={cn(
        "group relative flex items-start gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors duration-75 select-none",
        isActive
          ? "bg-al-accent/15 text-foreground"
          : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
      )}
    >
      {/* Persona emoji + streaming dot */}
      <div className="relative flex-shrink-0 mt-0.5">
        <span className="text-sm leading-none">{persona?.emoji ?? "🤖"}</span>
        <AnimatePresence>
          {isStreaming && (
            <motion.span
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0 }}
              className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 border border-al-panel"
              style={{ boxShadow: "0 0 4px #34d399" }}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Name / rename input */}
      <div className="flex-1 min-w-0">
        {isRenaming ? (
          <input
            ref={renameRef}
            value={renameValue}
            onChange={(e) => onRenameChange(e.target.value)}
            onBlur={onRenameCommit}
            onKeyDown={(e) => {
              if (e.key === "Enter") onRenameCommit()
              if (e.key === "Escape") onRenameCommit()
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-background border border-al-accent/60 rounded px-1 text-[11px] outline-none"
          />
        ) : (
          <>
            <div className="truncate text-[11px] leading-tight font-medium">{chat.name}</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[9px] text-muted-foreground/60">
                {formatTimeAgo(chat.updatedAt)}
              </span>
              {(chat.totalCostUsd ?? 0) > 0 && (
                <span className="text-[9px] text-muted-foreground/50">
                  ${(chat.totalCostUsd ?? 0).toFixed(3)}
                </span>
              )}
              {costHigh && (
                <Badge variant="outline" className="text-[8px] py-0 px-0.5 h-3 text-amber-400 border-amber-400/40">
                  $$$
                </Badge>
              )}
            </div>
          </>
        )}
      </div>

      {/* Action buttons on hover */}
      {!isRenaming && (
        <div className="flex-shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onRenameStart}
            className="p-0.5 rounded hover:bg-foreground/10 hover:text-foreground transition"
            title="Rename"
          >
            <AppIcon name="edit" width={10} />
          </button>
          <button
            onClick={onArchive}
            className="p-0.5 rounded hover:bg-red-500/20 hover:text-red-400 transition"
            title="Archive"
          >
            <AppIcon name="trash" width={10} />
          </button>
        </div>
      )}
    </motion.div>
  )
}
