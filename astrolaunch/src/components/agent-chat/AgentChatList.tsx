"use client"
import { useEffect, useState } from "react"
import { db } from "@/lib/storage/db"
import { useWorkspace } from "@/store/workspace"
import type { AgentChat } from "@/types"
import { Button } from "@/components/ui/button"
import { AppIcon } from "@/lib/iconify"
import { nanoid } from "nanoid"
import { cn } from "@/lib/utils"
import { DEFAULT_PERSONAS } from "@/lib/agents/personas"
import { motion } from "framer-motion"
import { Badge } from "@/components/ui/badge"

export function AgentChatList() {
  const { activeChatId, setActiveChatId, setShowRightChat, setAgentChatMinimized } = useWorkspace()
  const [chats, setChats] = useState<AgentChat[]>([])

  const refresh = async () => {
    if (!db) return
    setChats(await db.chats.orderBy("updatedAt").reverse().toArray())
  }
  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 2000)
    return () => clearInterval(t)
  }, [])

  const create = async (agentId: string) => {
    const id = nanoid()
    await db.chats.add({
      id, name: `${DEFAULT_PERSONAS.find((p) => p.id === agentId)?.name ?? "Agent"} Chat`,
      agentId, createdAt: Date.now(), updatedAt: Date.now(),
    })
    setActiveChatId(id); setShowRightChat(true); setAgentChatMinimized(false); refresh()
  }

  const remove = async (id: string) => {
    if (!confirm("Archive this chat?")) return
    await db.chats.update(id, { archived: 1 })
    if (activeChatId === id) setActiveChatId(null)
    refresh()
  }

  const visible = chats.filter((c) => !c.archived)

  return (
    <div className="h-full flex flex-col text-xs">
      <div className="p-2 border-b border-border space-y-1">
        <div className="text-[10px] uppercase text-muted-foreground">Spawn Agent</div>
        <div className="grid grid-cols-2 gap-1">
          {DEFAULT_PERSONAS.map((p) => (
            <button
              key={p.id}
              onClick={() => create(p.id)}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded border border-border hover:bg-accent/40 transition text-left"
              style={{ borderLeftColor: p.color, borderLeftWidth: 2 }}
            >
              <span className="text-base">{p.emoji}</span>
              <div className="overflow-hidden">
                <div className="font-medium truncate">{p.name}</div>
                <div className="text-[10px] text-muted-foreground truncate">{p.description}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="px-2 py-2 text-[10px] uppercase text-muted-foreground">Saved Chats ({visible.length})</div>
        {visible.map((c) => {
          const persona = DEFAULT_PERSONAS.find((p) => p.id === c.agentId)
          return (
            <motion.div
              key={c.id}
              whileHover={{ x: 2 }}
              onClick={() => { setActiveChatId(c.id); setShowRightChat(true); setAgentChatMinimized(false) }}
              className={cn(
                "group flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-accent/30",
                activeChatId === c.id && "bg-al-accent/15 text-foreground"
              )}
            >
              <span>{persona?.emoji ?? "🤖"}</span>
              <div className="truncate flex-1">
                <div className="truncate">{c.name}</div>
                {(c.totalCostUsd ?? 0) > 0 && (
                  <div className="text-[9px] text-muted-foreground">
                    ${(c.totalCostUsd ?? 0).toFixed(4)} · {(c.totalTokens ?? 0).toLocaleString()} tok
                  </div>
                )}
              </div>
              {(c.totalCostUsd ?? 0) > 0.5 && <Badge variant="warning" className="text-[9px] py-0 px-1">$</Badge>}
              <button
                onClick={(e) => { e.stopPropagation(); remove(c.id) }}
                className="opacity-0 group-hover:opacity-100 hover:text-destructive"
              >
                <AppIcon name="trash" width={11} />
              </button>
            </motion.div>
          )
        })}
        {visible.length === 0 && (
          <div className="p-3 text-muted-foreground">No chats yet. Spawn an agent above.</div>
        )}
      </div>

      <div className="border-t border-border p-2">
        <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => { setShowRightChat(true); setAgentChatMinimized(false) }}>
          <AppIcon name="chat" width={12} /> Open Floating Chat
        </Button>
      </div>
    </div>
  )
}
