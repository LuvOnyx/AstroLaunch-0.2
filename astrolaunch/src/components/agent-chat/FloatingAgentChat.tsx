"use client"
/**
 * FloatingAgentChat — v3 (Astronaught edition)
 *
 * Layout: [AgentSidebar (collapsible)] | [Chat area]
 *
 * Key upgrades vs v2:
 *   - Integrated AgentSidebar (chat history, create/archive) as a left panel
 *   - Astronaught auto-persona: persona is auto-selected per message via
 *     selectPersonaForPrompt() — no manual dropdown needed
 *   - Per-message persona badge (emoji + name) shows which persona responded
 *   - Sidebar collapses/expands with smooth animation
 *   - All original features preserved: streaming, /build loop, cost meter,
 *     abort, resize, drag, minimize, tasks, stats
 */
import { useState, useRef, useEffect, useCallback } from "react"
import { motion, useDragControls, AnimatePresence } from "framer-motion"
import { useWorkspace } from "@/store/workspace"
import { useSettings } from "@/store/settings"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { AppIcon } from "@/lib/iconify"
import { db } from "@/lib/storage/db"
import { nanoid } from "nanoid"
import { orchestrator, approxUsage } from "@/lib/agents/orchestrator"
import { cn } from "@/lib/utils"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { DEFAULT_PERSONAS, selectPersonaForPrompt, getPersonaById } from "@/lib/agents/personas"
import type { AgentMessage, AgentTask } from "@/types"
import { MessageView } from "./MessageView"
import { AgentSidebar } from "./AgentSidebar"
import { estimateCost, priceFor } from "@/lib/agents/pricing"
import { toast } from "sonner"

export function FloatingAgentChat() {
  const {
    showRightChat, agentChatPosition, setAgentChatPosition,
    agentChatSize, setAgentChatSize, activeChatId, setActiveChatId,
    agentChatMinimized, setAgentChatMinimized,
  } = useWorkspace()
  const { defaultModel, set, apiKeys, showToolDiffs, costCapUsd } = useSettings()
  const dragControls = useDragControls()
  const containerRef = useRef<HTMLDivElement>(null)
  const messagesRef = useRef<HTMLDivElement>(null)

  const [messages, setMessages] = useState<AgentMessage[]>([])
  const [tasks, setTasks] = useState<AgentTask[]>([])
  const [input, setInput] = useState("")
  const [streaming, setStreaming] = useState(false)
  const [building, setBuilding] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const [tab, setTab] = useState<"chat" | "tasks" | "stats">("chat")
  const [chatName, setChatName] = useState<string>("New Chat")
  const [accumulatedCost, setAccumulatedCost] = useState(0)
  const [accumulatedTokens, setAccumulatedTokens] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  // Auto-detected persona for the next message (shown as preview)
  const [nextPersona, setNextPersona] = useState<string>("builder")
  const abortStreamRef = useRef<AbortController | null>(null)

  // Update auto-persona preview as user types
  useEffect(() => {
    if (input.trim()) {
      setNextPersona(selectPersonaForPrompt(input))
    }
  }, [input])

  // Ensure a chat exists
  useEffect(() => {
    ;(async () => {
      if (!db) return
      let id = activeChatId
      if (!id) {
        const allChats = await db.chats.orderBy("updatedAt").reverse().toArray()
        const existing = allChats.find((c) => c.archived !== 1)
        if (existing) {
          id = existing.id
          setActiveChatId(id)
        } else {
          id = nanoid()
          await db.chats.add({
            id, name: "New Chat", agentId: "builder",
            createdAt: Date.now(), updatedAt: Date.now(),
          })
          setActiveChatId(id)
        }
      }
      const msgs = await db.messages.where("chatId").equals(id!).sortBy("createdAt")
      setMessages(msgs)
      const ts = await db.tasks.where("chatId").equals(id!).toArray()
      setTasks(ts)
      const meta = await db.chats.get(id!)
      if (meta) {
        setChatName(meta.name)
        setAccumulatedCost(meta.totalCostUsd ?? 0)
        setAccumulatedTokens(meta.totalTokens ?? 0)
      }
    })()
  }, [activeChatId, setActiveChatId])

  // Subscribe to orchestrator events
  useEffect(() => {
    return orchestrator.on(async (e) => {
      const line = `${e.type}: ${typeof e.payload === "string" ? e.payload : JSON.stringify(e.payload).slice(0, 220)}`
      setLogs((l) => [...l.slice(-300), line])
      try { window.dispatchEvent(new CustomEvent("astrolaunch:agent-log", { detail: line })) } catch {}
      if (activeChatId && (e.type === "plan" || e.type === "task_done" || e.type === "task_start" || e.type === "task_failed")) {
        const ts = await db.tasks.where("chatId").equals(activeChatId).toArray()
        setTasks(ts)
      }
      if (e.type === "message" && activeChatId) {
        const msgs = await db.messages.where("chatId").equals(activeChatId).sortBy("createdAt")
        setMessages(msgs)
      }
      if (e.type === "usage") {
        const u = e.payload as { costUsd: number; input: number; output: number; accumulated: number }
        setAccumulatedCost(u.accumulated)
        setAccumulatedTokens((prev) => prev + u.input + u.output)
      }
      if (e.type === "cost_cap_hit") {
        const u = e.payload as { spent: number; cap: number }
        toast.warning(`Cost cap hit: $${u.spent.toFixed(3)} ≥ $${u.cap.toFixed(2)}. Run paused.`)
      }
      if (e.type === "stop") {
        setBuilding(false)
        const r = e.payload as { reason?: string }
        if (r.reason === "all_done") toast.success("All tasks completed ✨")
        else if (r.reason === "user_aborted") toast("Run aborted")
      }
    })
  }, [activeChatId])

  useEffect(() => {
    messagesRef.current?.scrollTo({ top: 99999, behavior: "smooth" })
  }, [messages, streaming])

  const abortAll = useCallback(() => {
    abortStreamRef.current?.abort()
    orchestrator.abort()
  }, [])

  const send = async () => {
    if (!input.trim() || !activeChatId) return
    if (!apiKeys.gemini) {
      toast.error("Set your Gemini API key in Settings → Agents.")
      return
    }

    // Auto-select persona from the prompt (Astronaught system)
    const autoPersona = selectPersonaForPrompt(input)
    const personaDef = getPersonaById(autoPersona)

    const userMsg: AgentMessage = {
      id: nanoid(), chatId: activeChatId, role: "user", content: input, createdAt: Date.now(),
    }
    await db.messages.add(userMsg)
    setMessages((prev) => [...prev, userMsg])
    const text = input
    setInput("")
    setNextPersona("builder") // reset preview

    if (text.startsWith("/build ")) {
      setBuilding(true)
      const goal = text.slice(7)
      const placeholder: AgentMessage = {
        id: nanoid(), chatId: activeChatId, role: "system",
        content: `🧭 Planning: ${goal}`,
        createdAt: Date.now(),
      }
      await db.messages.add(placeholder)
      setMessages((prev) => [...prev, placeholder])
      try { await orchestrator.run(activeChatId, goal) }
      catch (e) {
        setLogs((l) => [...l, `error: ${String(e)}`])
        toast.error(`Build failed: ${String(e)}`)
      }
      setBuilding(false)
      return
    }

    // Streaming chat with auto-selected persona
    setStreaming(true)
    const assistantId = nanoid()
    const assistantMsg: AgentMessage = {
      id: assistantId, chatId: activeChatId, role: "assistant",
      content: "", createdAt: Date.now(), personaId: autoPersona,
    }
    setMessages((prev) => [...prev, assistantMsg])
    abortStreamRef.current = new AbortController()

    try {
      const res = await fetch("/api/agents/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMsg].map((m) => ({
            role: m.role === "tool" ? "assistant" : m.role,
            content: m.content,
          })),
          apiKey: apiKeys.gemini,
          model: defaultModel,
          systemPrompt: personaDef?.systemPrompt,
        }),
        signal: abortStreamRef.current.signal,
      })
      if (!res.ok || !res.body) throw new Error(await res.text())
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      let acc = ""
      let finalUsage: { input: number; output: number; model: string } | null = null
      const promptText = JSON.stringify([...messages, userMsg].map((m) => m.content))
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const frames = buffer.split("\n\n")
        buffer = frames.pop() ?? ""
        for (const frame of frames) {
          const match = /^data:\s*(.*)$/m.exec(frame)
          if (!match) continue
          try {
            const obj = JSON.parse(match[1])
            if (obj.delta) {
              acc += obj.delta
              setMessages((prev) => prev.map((mm) => mm.id === assistantId ? { ...mm, content: acc } : mm))
            } else if (obj.usage) {
              finalUsage = obj.usage
            } else if (obj.error) {
              throw new Error(obj.error)
            }
          } catch {}
        }
      }
      const usageObj = finalUsage
        ? { ...finalUsage, total: finalUsage.input + finalUsage.output, costUsd: estimateCost(finalUsage.model, finalUsage.input, finalUsage.output) }
        : approxUsage(defaultModel, promptText, acc)
      const finalMsg: AgentMessage = { ...assistantMsg, content: acc, usage: usageObj }
      await db.messages.add(finalMsg)
      setMessages((prev) => prev.map((mm) => mm.id === assistantId ? finalMsg : mm))
      setAccumulatedCost((c) => c + usageObj.costUsd)
      setAccumulatedTokens((t) => t + usageObj.total)
      const chat = await db.chats.get(activeChatId)
      if (chat) {
        await db.chats.update(activeChatId, {
          agentId: autoPersona,
          totalCostUsd: (chat.totalCostUsd ?? 0) + usageObj.costUsd,
          totalTokens: (chat.totalTokens ?? 0) + usageObj.total,
          updatedAt: Date.now(),
        })
      }
    } catch (e) {
      const msg = String(e)
      setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: `⚠️ ${msg}` } : m))
    } finally {
      setStreaming(false)
      abortStreamRef.current = null
    }
  }

  const renameChat = async (n: string) => {
    if (!activeChatId) return
    setChatName(n)
    await db.chats.update(activeChatId, { name: n, updatedAt: Date.now() })
  }

  if (!showRightChat) return null

  // ── Minimized bubble ──────────────────────────────────────────────────────
  if (agentChatMinimized) {
    return (
      <motion.button
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={() => setAgentChatMinimized(false)}
        style={{ left: agentChatPosition.x, top: agentChatPosition.y }}
        className="fixed z-40 rounded-full bg-al-chat border border-border shadow-2xl px-3 py-2 flex items-center gap-2 text-xs hover:bg-al-panel"
      >
        <AppIcon name="agent" width={14} className="text-al-accent" />
        Astronaught
        {building && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
        <Badge variant="outline" className="text-[9px] py-0 px-1">${accumulatedCost.toFixed(3)}</Badge>
      </motion.button>
    )
  }

  const overCap = costCapUsd > 0 && accumulatedCost >= costCapUsd
  const nearCap = costCapUsd > 0 && accumulatedCost >= costCapUsd * 0.8
  const nextPersonaDef = getPersonaById(nextPersona)

  return (
    <motion.div
      ref={containerRef}
      drag
      dragControls={dragControls}
      dragListener={false}
      dragMomentum={false}
      initial={{ x: agentChatPosition.x, y: agentChatPosition.y, opacity: 0, scale: 0.96 }}
      animate={{ x: agentChatPosition.x, y: agentChatPosition.y, opacity: 1, scale: 1 }}
      onDragEnd={(_, info) => setAgentChatPosition({ x: info.point.x - 200, y: info.point.y - 16 })}
      className="fixed z-40 rounded-xl border border-border shadow-2xl bg-al-chat backdrop-blur-xl flex flex-col overflow-hidden"
      style={{ width: agentChatSize.w, height: agentChatSize.h }}
    >
      {/* ── Drag handle / header ─────────────────────────────────────────── */}
      <div
        onPointerDown={(e) => dragControls.start(e)}
        className="h-9 flex items-center gap-2 px-3 bg-al-panel border-b border-border cursor-move select-none flex-shrink-0"
      >
        {/* Sidebar toggle */}
        <button
          onClick={() => setSidebarOpen((o) => !o)}
          className="flex-shrink-0 p-1 rounded hover:bg-foreground/10 transition"
          title={sidebarOpen ? "Hide chat list" : "Show chat list"}
        >
          <AppIcon name={sidebarOpen ? "arrowRight" : "chat"} width={13} className="text-muted-foreground" />
        </button>

        <AppIcon name="agent" width={14} className="text-al-accent flex-shrink-0" />

        <input
          value={chatName}
          onChange={(e) => renameChat(e.target.value)}
          onPointerDown={(e) => e.stopPropagation()}
          className="bg-transparent border-0 outline-none text-xs font-medium flex-1 min-w-0"
        />

        {/* Tab bar */}
        <div className="flex bg-background/50 rounded-md p-0.5 text-[10px] flex-shrink-0">
          {(["chat", "tasks", "stats"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-2 py-0.5 rounded transition",
                tab === t ? "bg-al-accent/30 text-foreground" : "text-muted-foreground"
              )}
            >
              {t === "chat" ? "Chat"
                : t === "tasks" ? `Tasks (${tasks.filter((x) => !x.is_done).length}/${tasks.length})`
                : "Stats"}
            </button>
          ))}
        </div>

        {/* Model selector */}
        <Select value={defaultModel} onValueChange={(v) => set("defaultModel", v as "gemini-2.5-pro" | "gemini-2.5-flash")}>
          <SelectTrigger className="h-6 text-[10px] w-[128px] border-border/60 flex-shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="gemini-2.5-pro">Gemini 2.5 Pro</SelectItem>
            <SelectItem value="gemini-2.5-flash">Gemini 2.5 Flash</SelectItem>
          </SelectContent>
        </Select>

        <Button size="icon-sm" variant="ghost" onClick={() => setAgentChatMinimized(true)} title="Minimize">
          <AppIcon name="close" width={12} />
        </Button>
      </div>

      {/* ── Cost / status bar ────────────────────────────────────────────── */}
      <div className={cn(
        "px-3 py-1 flex items-center gap-3 text-[10px] border-b border-border/60 flex-shrink-0",
        overCap ? "bg-red-500/10 text-red-300"
          : nearCap ? "bg-amber-500/10 text-amber-300"
          : "bg-background/30 text-muted-foreground"
      )}>
        <span>${accumulatedCost.toFixed(4)}</span>
        {costCapUsd > 0 && <span>· cap ${costCapUsd.toFixed(2)}</span>}
        <span>· {accumulatedTokens.toLocaleString()} tok</span>
        <span className="opacity-50">· {priceFor(defaultModel).provider}</span>
        {(streaming || building) && (
          <Button size="sm" variant="ghost" className="h-5 ml-auto text-[10px]" onClick={abortAll}>
            <AppIcon name="stop" width={10} /> Abort
          </Button>
        )}
      </div>

      {/* ── Body: sidebar + content ──────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left sidebar — collapsible */}
        <AnimatePresence initial={false}>
          {sidebarOpen && (
            <motion.div
              key="sidebar"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 168, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="flex-shrink-0 overflow-hidden border-r border-border"
            >
              <div className="w-[168px] h-full">
                <AgentSidebar streaming={streaming} building={building} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Right: chat / tasks / stats */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <AnimatePresence mode="wait">
            {tab === "chat" ? (
              <motion.div
                key="chat"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex flex-col min-h-0"
              >
                {/* Messages */}
                <div ref={messagesRef} className="flex-1 overflow-auto px-3 py-3 space-y-3 text-sm">
                  {messages.length === 0 && (
                    <div className="text-xs text-muted-foreground space-y-2 p-3 bg-background/30 rounded-md border border-border">
                      <div className="font-semibold text-foreground flex items-center gap-1.5">
                        <span>🚀</span> Astronaught Agent
                      </div>
                      <div className="text-muted-foreground/80">
                        Type anything — your message is automatically routed to the right persona:
                      </div>
                      <div className="grid grid-cols-2 gap-1 pt-1">
                        {DEFAULT_PERSONAS.map((p) => (
                          <div key={p.id} className="flex items-center gap-1.5 text-[10px]">
                            <span>{p.emoji}</span>
                            <span className="text-muted-foreground">{p.description.slice(0, 38)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="pt-1 border-t border-border/40 text-[10px]">
                        Use <code className="bg-background px-1 rounded">/build &lt;goal&gt;</code> to start the full agent loop.
                      </div>
                    </div>
                  )}
                  {messages.map((m, idx) => (
                    <MessageView
                      key={m.id}
                      message={m}
                      streaming={streaming && idx === messages.length - 1 && m.role === "assistant"}
                      showDiffs={showToolDiffs}
                    />
                  ))}
                </div>

                {/* Input area */}
                <div className="border-t border-border p-2 space-y-2 flex-shrink-0">
                  {/* Auto-persona indicator */}
                  {input.trim() && (
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground px-1">
                      <span>Auto-routing to</span>
                      <span className="font-medium text-foreground flex items-center gap-1">
                        <span>{nextPersonaDef?.emoji}</span>
                        <span>{nextPersonaDef?.name}</span>
                      </span>
                      <span className="opacity-50">· {nextPersonaDef?.description.slice(0, 40)}</span>
                    </div>
                  )}
                  <Textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send() }
                    }}
                    placeholder="Ask anything, or /build <goal> to start the agent loop…"
                    className="text-xs resize-none"
                    rows={2}
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">⏎ send · ⇧⏎ newline</span>
                    <Button size="sm" onClick={send} disabled={streaming || building || !input.trim()}>
                      {streaming || building ? "…" : "Send"} <AppIcon name="play" width={10} />
                    </Button>
                  </div>
                </div>
              </motion.div>
            ) : tab === "tasks" ? (
              <motion.div
                key="tasks"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 overflow-auto p-3 space-y-2 text-xs"
              >
                {tasks.length === 0 && (
                  <div className="text-muted-foreground">No tasks yet. Use <code>/build &lt;goal&gt;</code> to spawn.</div>
                )}
                {tasks.map((t) => (
                  <div key={t.id} className={cn(
                    "rounded-md border border-border p-2 space-y-1",
                    t.is_done && "border-emerald-600/40 bg-emerald-500/5",
                    t.status === "failed" && "border-red-600/40 bg-red-500/5",
                    t.status === "in_progress" && "border-al-accent/40 bg-al-accent/5"
                  )}>
                    <div className="flex items-center gap-2">
                      <span>{t.is_done ? "✓" : t.status === "failed" ? "✗" : t.status === "in_progress" ? "▶" : "○"}</span>
                      <span className="font-medium flex-1 truncate">{t.title}</span>
                      <span className="text-[10px] text-muted-foreground">{t.iterations}/{t.maxIterations}</span>
                      {!!t.retries && <Badge variant="outline" className="text-[9px] py-0 px-1">⟲{t.retries}</Badge>}
                    </div>
                    <div className="text-[11px] text-muted-foreground">{t.description}</div>
                    <div className="text-[10px] text-muted-foreground italic">done if: {t.doneCriteria}</div>
                    {t.evidence && <div className="text-[10px] text-emerald-400">✓ {t.evidence}</div>}
                    {t.toolHistory && t.toolHistory.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {t.toolHistory.slice(-6).map((h, i) => (
                          <span key={i} className={cn(
                            "text-[9px] px-1 rounded",
                            h.ok ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"
                          )}>{h.name}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                <div className="pt-2 border-t border-border">
                  <div className="text-[10px] uppercase text-muted-foreground mb-1">Orchestrator log</div>
                  <div className="font-mono text-[10px] text-muted-foreground space-y-0.5 max-h-32 overflow-auto">
                    {logs.slice(-30).map((l, i) => <div key={i} className="truncate">{l}</div>)}
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="stats"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 overflow-auto p-3 space-y-3 text-xs"
              >
                <StatGrid messages={messages} tasks={tasks} cost={accumulatedCost} tokens={accumulatedTokens} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Resize handle (bottom-right) ─────────────────────────────────── */}
      <div
        onPointerDown={(e) => {
          e.preventDefault()
          const startW = agentChatSize.w, startH = agentChatSize.h
          const sx = e.clientX, sy = e.clientY
          const move = (ev: PointerEvent) => setAgentChatSize({
            w: Math.max(440, startW + (ev.clientX - sx)),
            h: Math.max(360, startH + (ev.clientY - sy)),
          })
          const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up) }
          window.addEventListener("pointermove", move)
          window.addEventListener("pointerup", up)
        }}
        className="absolute bottom-0 right-0 w-3 h-3 cursor-nwse-resize opacity-50 hover:opacity-100"
        style={{ background: "linear-gradient(135deg, transparent 50%, hsl(var(--al-accent)) 50%)" }}
      />
    </motion.div>
  )
}

// ── Stats grid ──────────────────────────────────────────────────────────────
function StatGrid({ messages, tasks, cost, tokens }: {
  messages: AgentMessage[]; tasks: AgentTask[]; cost: number; tokens: number
}) {
  const toolCalls = messages.filter((m) => m.role === "tool").length
  const toolErrors = messages.filter((m) => m.role === "tool" && m.toolCalls?.[0]?.status === "error").length
  const completed = tasks.filter((t) => t.is_done).length
  const failed = tasks.filter((t) => t.status === "failed").length

  // Persona breakdown
  const personaCounts = messages
    .filter((m) => m.role === "assistant" && m.personaId)
    .reduce<Record<string, number>>((acc, m) => {
      const pid = m.personaId!
      acc[pid] = (acc[pid] ?? 0) + 1
      return acc
    }, {})

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Cost" value={`$${cost.toFixed(4)}`} />
        <Stat label="Tokens" value={tokens.toLocaleString()} />
        <Stat label="Tasks done" value={`${completed}/${tasks.length}`} accent="text-emerald-400" />
        <Stat label="Tasks failed" value={String(failed)} accent={failed > 0 ? "text-red-400" : ""} />
        <Stat label="Tool calls" value={String(toolCalls)} />
        <Stat label="Tool errors" value={String(toolErrors)} accent={toolErrors > 0 ? "text-amber-400" : ""} />
        <Stat label="Messages" value={String(messages.length)} />
        <Stat label="Avg/task" value={tasks.length ? `${(tokens / tasks.length).toFixed(0)} tok` : "—"} />
      </div>

      {Object.keys(personaCounts).length > 0 && (
        <div>
          <div className="text-[10px] uppercase text-muted-foreground mb-1.5">Persona usage (Astronaught)</div>
          <div className="space-y-1">
            {Object.entries(personaCounts).map(([pid, count]) => {
              const p = DEFAULT_PERSONAS.find((x) => x.id === pid)
              return (
                <div key={pid} className="flex items-center gap-2 text-[11px]">
                  <span>{p?.emoji ?? "🤖"}</span>
                  <span className="flex-1 text-muted-foreground">{p?.name ?? pid}</span>
                  <span className="font-medium">{count}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-md border border-border p-2 bg-background/40">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className={cn("text-sm font-semibold", accent)}>{value}</div>
    </div>
  )
}
