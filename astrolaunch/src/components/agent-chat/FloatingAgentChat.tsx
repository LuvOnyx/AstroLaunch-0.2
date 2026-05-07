"use client"
/**
 * FloatingAgentChat — v4 (Full Overhaul Edition)
 *
 * New features vs v3:
 *   - Planning / Agent mode switch (replaces /build prefix)
 *   - File + image attachment buttons with context injection
 *   - Agent reasoning/thinking collapsible dropdown per message
 *   - Full multi-model support (Gemini, Claude, Ollama)
 *   - Model selector expanded to all supported models
 *   - Rate-limit-aware orchestrator with exponential backoff
 *   - Gemini image generation (free) auto-triggered on "generate image" requests
 *   - anime.js micro-animations for send button + mode switch
 *   - All v3 features preserved: sidebar, personas, cost meter, abort
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
import { ModeSwitch, type AgentMode } from "./ModeSwitch"
import { AttachmentBar, attachmentsToContent, type Attachment } from "./AttachmentBar"
import { estimateCost, priceFor, modelProvider, MODEL_OPTIONS } from "@/lib/agents/pricing"
import { toast } from "sonner"

// Image gen trigger words
const IMAGE_KEYWORDS = /\b(generate|create|draw|paint|make|design)\s+(an?\s+)?(image|picture|photo|illustration|artwork|logo|icon|visual)/i

export function FloatingAgentChat() {
  const {
    showRightChat, agentChatPosition, setAgentChatPosition,
    agentChatSize, setAgentChatSize, activeChatId, setActiveChatId,
    agentChatMinimized, setAgentChatMinimized,
  } = useWorkspace()
  const { defaultModel, set, apiKeys, showToolDiffs, costCapUsd, ollamaEndpoint, showThinking } = useSettings()
  const dragControls = useDragControls()
  const containerRef = useRef<HTMLDivElement>(null)
  const messagesRef = useRef<HTMLDivElement>(null)
  const sendBtnRef = useRef<HTMLButtonElement>(null)

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
  const [nextPersona, setNextPersona] = useState<string>("builder")
  const [mode, setMode] = useState<AgentMode>("agent")
  const [attachments, setAttachments] = useState<Attachment[]>([])
  /** Thinking text accumulating during current stream */
  const [liveThinking, setLiveThinking] = useState("")
  const abortStreamRef = useRef<AbortController | null>(null)

  // Update auto-persona preview as user types
  useEffect(() => {
    if (input.trim()) setNextPersona(selectPersonaForPrompt(input))
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
      if (e.type === "rate_limit_wait") {
        const u = e.payload as { delay: number; attempt: number }
        toast.info(`Rate limit hit — waiting ${(u.delay / 1000).toFixed(1)}s before retry (attempt ${u.attempt})`)
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

  const addAttachment = (a: Attachment) => setAttachments((prev) => [...prev, a])
  const removeAttachment = (id: string) => setAttachments((prev) => prev.filter((a) => a.id !== id))

  /** Detect if user wants an image generated and call the image API */
  const tryImageGeneration = async (text: string): Promise<boolean> => {
    if (!IMAGE_KEYWORDS.test(text)) return false
    const geminiKey = apiKeys.gemini
    if (!geminiKey) {
      toast.error("Gemini API key required for image generation (Settings → Agents)")
      return false
    }
    if (!activeChatId) return false

    const userMsg: AgentMessage = {
      id: nanoid(), chatId: activeChatId, role: "user", content: text, createdAt: Date.now(),
    }
    await db.messages.add(userMsg)
    setMessages((prev) => [...prev, userMsg])

    const placeholder: AgentMessage = {
      id: nanoid(), chatId: activeChatId, role: "assistant",
      content: "🎨 Generating image…", createdAt: Date.now(), personaId: "builder",
    }
    await db.messages.add(placeholder)
    setMessages((prev) => [...prev, placeholder])
    setStreaming(true)

    try {
      const res = await fetch("/api/agents/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text, apiKey: geminiKey }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      if (!data.images?.length) throw new Error("No images returned")

      const [img] = data.images
      const dataUrl = `data:${img.mimeType};base64,${img.base64}`
      const mdImg = `![Generated image](${dataUrl})\n${data.text ? `\n${data.text}` : ""}`
      const finalMsg: AgentMessage = {
        ...placeholder,
        content: mdImg,
        usage: data.usage ? { ...data.usage, total: (data.usage.input ?? 0) + (data.usage.output ?? 0) } : undefined,
      }
      await db.messages.update(placeholder.id, { content: finalMsg.content, usage: finalMsg.usage })
      setMessages((prev) => prev.map((m) => m.id === placeholder.id ? finalMsg : m))
    } catch (e) {
      setMessages((prev) => prev.map((m) =>
        m.id === placeholder.id ? { ...m, content: `⚠️ Image generation failed: ${String(e)}` } : m
      ))
    } finally {
      setStreaming(false)
    }
    return true
  }

  const send = async () => {
    if (!input.trim() || !activeChatId) return

    const hasGeminiKey = !!apiKeys.gemini
    const hasClaudeKey = !!apiKeys.anthropic
    const isOllama = defaultModel.startsWith("ollama:")
    if (!hasGeminiKey && !hasClaudeKey && !isOllama) {
      toast.error("Set your API key in Settings → Agents.")
      return
    }

    const text = input.trim()
    setInput("")
    const currentAttachments = [...attachments]
    setAttachments([])
    setLiveThinking("")

    // Planning mode — always run the orchestrator loop
    if (mode === "planning") {
      const userMsg: AgentMessage = {
        id: nanoid(), chatId: activeChatId, role: "user", content: text, createdAt: Date.now(),
        attachments: currentAttachments.map((a) => ({ type: a.type, name: a.name })),
      }
      await db.messages.add(userMsg)
      setMessages((prev) => [...prev, userMsg])
      setBuilding(true)
      const placeholder: AgentMessage = {
        id: nanoid(), chatId: activeChatId, role: "system",
        content: `🧭 Planning: ${text}`, createdAt: Date.now(),
      }
      await db.messages.add(placeholder)
      setMessages((prev) => [...prev, placeholder])
      try {
        await orchestrator.run(activeChatId, text)
      } catch (e) {
        setLogs((l) => [...l, `error: ${String(e)}`])
        toast.error(`Build failed: ${String(e)}`)
      }
      setBuilding(false)
      return
    }

    // Agent mode — try image gen first, then streaming chat
    const isImageRequest = await tryImageGeneration(text)
    if (isImageRequest) return

    // Auto-select persona from the prompt
    const autoPersona = selectPersonaForPrompt(text)
    const personaDef = getPersonaById(autoPersona)

    // Build multimodal content with attachments
    const messageContent = attachmentsToContent(text, currentAttachments)

    const userMsg: AgentMessage = {
      id: nanoid(), chatId: activeChatId, role: "user",
      content: typeof messageContent === "string" ? messageContent : text,
      createdAt: Date.now(),
      attachments: currentAttachments.map((a) => ({ type: a.type, name: a.name })),
    }
    await db.messages.add(userMsg)
    setMessages((prev) => [...prev, userMsg])
    setNextPersona("builder")

    // Pick API key based on model provider
    const provider = modelProvider(defaultModel)
    const apiKey = provider === "anthropic" ? (apiKeys.anthropic || apiKeys.gemini) : apiKeys.gemini

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
          messages: [...messages, { role: "user", content: messageContent }].map((m) => ({
            role: m.role === "tool" ? "assistant" : m.role,
            content: (m as AgentMessage).content,
          })),
          apiKey,
          anthropicKey: apiKeys.anthropic,
          model: defaultModel,
          systemPrompt: personaDef?.systemPrompt,
          ollamaEndpoint,
          thinking: showThinking && (defaultModel.includes("2.5") || defaultModel.startsWith("claude")),
        }),
        signal: abortStreamRef.current.signal,
      })
      if (!res.ok || !res.body) throw new Error(await res.text())

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ""
      let acc = ""
      let thinkingAcc = ""
      let finalUsage: { input: number; output: number; model: string } | null = null
      const promptText = JSON.stringify([...messages].map((m) => m.content))

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const frames = buf.split("\n\n")
        buf = frames.pop() ?? ""
        for (const frame of frames) {
          const match = /^data:\s*(.*)$/m.exec(frame)
          if (!match) continue
          try {
            const obj = JSON.parse(match[1])
            if (obj.delta) {
              acc += obj.delta
              setMessages((prev) => prev.map((mm) => mm.id === assistantId ? { ...mm, content: acc } : mm))
            }
            if (obj.thinking) {
              thinkingAcc += obj.thinking
              setLiveThinking(thinkingAcc)
              setMessages((prev) => prev.map((mm) => mm.id === assistantId ? { ...mm, thinking: thinkingAcc } : mm))
            }
            if (obj.usage) finalUsage = obj.usage
            if (obj.error) throw new Error(obj.error)
          } catch {}
        }
      }

      const usageObj = finalUsage
        ? { ...finalUsage, total: finalUsage.input + finalUsage.output, costUsd: estimateCost(finalUsage.model, finalUsage.input, finalUsage.output) }
        : approxUsage(defaultModel, promptText, acc)

      const finalMsg: AgentMessage = {
        ...assistantMsg, content: acc,
        thinking: thinkingAcc || undefined,
        usage: usageObj,
      }
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
      if (String(e).includes("AbortError")) {
        setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: m.content + "\n\n[aborted]" } : m))
      } else {
        setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: `⚠️ ${String(e)}` } : m))
      }
    } finally {
      setStreaming(false)
      setLiveThinking("")
      abortStreamRef.current = null
    }
  }

  const renameChat = async (n: string) => {
    if (!activeChatId) return
    setChatName(n)
    await db.chats.update(activeChatId, { name: n, updatedAt: Date.now() })
  }

  if (!showRightChat) return null

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
        {streaming && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />}
        <Badge variant="outline" className="text-[9px] py-0 px-1">${accumulatedCost.toFixed(3)}</Badge>
      </motion.button>
    )
  }

  const overCap = costCapUsd > 0 && accumulatedCost >= costCapUsd
  const nearCap = costCapUsd > 0 && accumulatedCost >= costCapUsd * 0.8
  const nextPersonaDef = getPersonaById(nextPersona)
  const ALL_MODELS_FLAT = [
    ...MODEL_OPTIONS.gemini,
    ...MODEL_OPTIONS.anthropic,
    ...MODEL_OPTIONS.ollama,
  ]

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

        {/* Model selector — expanded to all providers */}
        <Select value={defaultModel} onValueChange={(v) => set("defaultModel", v)}>
          <SelectTrigger className="h-6 text-[10px] w-[130px] border-border/60 flex-shrink-0 onPointerDown:stop">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-64 text-xs" onPointerDown={(e) => e.stopPropagation()}>
            <div className="px-2 py-1 text-[9px] uppercase text-muted-foreground font-medium">Gemini</div>
            {MODEL_OPTIONS.gemini.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            <div className="px-2 py-1 text-[9px] uppercase text-muted-foreground font-medium mt-1">Claude</div>
            {MODEL_OPTIONS.anthropic.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            <div className="px-2 py-1 text-[9px] uppercase text-muted-foreground font-medium mt-1">Ollama (local)</div>
            {MODEL_OPTIONS.ollama.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>

        <Button
          size="icon-sm" variant="ghost"
          onClick={() => setAgentChatMinimized(true)}
          title="Minimize"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <AppIcon name="close" width={12} />
        </Button>
      </div>

      {/* ── Cost / status bar ──────────────────────────────────────────────*/}
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
        {defaultModel.startsWith("ollama:") && <Badge variant="outline" className="text-[9px] py-0 px-1">local 🆓</Badge>}
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
                    <div className="text-xs text-muted-foreground space-y-3 p-3 bg-background/30 rounded-md border border-border">
                      <div className="font-semibold text-foreground flex items-center gap-1.5">
                        <span>🚀</span> Astronaught Agent
                      </div>
                      <div className="text-muted-foreground/80 text-[11px]">
                        Type anything — auto-routed to the right persona. Switch to <strong>Planning</strong> mode to run the full multi-agent loop.
                      </div>
                      <div className="grid grid-cols-2 gap-1 pt-1">
                        {DEFAULT_PERSONAS.map((p) => (
                          <div key={p.id} className="flex items-center gap-1.5 text-[10px]">
                            <span>{p.emoji}</span>
                            <span className="text-muted-foreground">{p.description.slice(0, 38)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="pt-2 border-t border-border/40 space-y-1">
                        <div className="text-[10px] flex items-center gap-2">
                          <span className="text-al-accent">⚡ Agent</span>
                          <span className="opacity-60">→ streaming chat with auto-persona selection</span>
                        </div>
                        <div className="text-[10px] flex items-center gap-2">
                          <span className="text-amber-400">🧭 Planning</span>
                          <span className="opacity-60">→ Architect → Builder → Reviewer loop</span>
                        </div>
                        <div className="text-[10px] flex items-center gap-2">
                          <span className="text-purple-400">🎨 Image gen</span>
                          <span className="opacity-60">→ say "generate an image of …" (free, Gemini)</span>
                        </div>
                      </div>
                    </div>
                  )}
                  {messages.map((m, idx) => (
                    <MessageView
                      key={m.id}
                      message={m}
                      streaming={streaming && idx === messages.length - 1 && m.role === "assistant"}
                      thinkingStreaming={streaming && idx === messages.length - 1 && m.role === "assistant"}
                      showDiffs={showToolDiffs}
                    />
                  ))}
                </div>

                {/* Input area */}
                <div className="border-t border-border p-2 space-y-1.5 flex-shrink-0">
                  {/* Top row: mode switch + persona indicator */}
                  <div className="flex items-center gap-2">
                    <ModeSwitch mode={mode} onChange={setMode} disabled={streaming || building} />
                    {mode === "planning" && (
                      <span className="text-[10px] text-amber-400/70 flex items-center gap-1">
                        <span className="w-1 h-1 rounded-full bg-amber-400 animate-pulse" />
                        Full agent loop
                      </span>
                    )}
                    {mode === "agent" && input.trim() && (
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <span>→</span>
                        <span className="font-medium text-foreground flex items-center gap-1">
                          <span>{nextPersonaDef?.emoji}</span>
                          <span>{nextPersonaDef?.name}</span>
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Attachment bar */}
                  <AttachmentBar
                    attachments={attachments}
                    onAdd={addAttachment}
                    onRemove={removeAttachment}
                    disabled={streaming || building}
                  />

                  <Textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send() }
                    }}
                    placeholder={
                      mode === "planning"
                        ? "Describe a goal — the agent will plan and execute it…"
                        : "Ask anything… or attach files/images above · 🎨 generate an image…"
                    }
                    className="text-xs resize-none"
                    rows={2}
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">⏎ send · ⇧⏎ newline</span>
                    <Button
                      ref={sendBtnRef}
                      size="sm"
                      onClick={send}
                      disabled={streaming || building || !input.trim()}
                      className={cn(
                        "transition-all duration-150",
                        mode === "planning" && "bg-amber-600 hover:bg-amber-500 text-white border-amber-500"
                      )}
                    >
                      {streaming ? "…" : building ? "Planning…" : mode === "planning" ? "🧭 Plan" : "Send"}
                      {!streaming && !building && <AppIcon name="play" width={10} />}
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
                  <div className="text-muted-foreground">No tasks yet. Switch to <strong>Planning</strong> mode and send a goal.</div>
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
                className="flex-1 overflow-auto p-3 text-xs space-y-3"
              >
                <div className="rounded-md border border-border p-3 space-y-1">
                  <div className="font-semibold text-foreground">Session cost</div>
                  <div className="text-2xl font-mono text-al-accent">${accumulatedCost.toFixed(4)}</div>
                  <div className="text-muted-foreground">{accumulatedTokens.toLocaleString()} tokens · {messages.length} messages</div>
                </div>
                <div className="rounded-md border border-border p-3 space-y-2">
                  <div className="font-semibold text-foreground">Active model</div>
                  <div className="flex items-center gap-2">
                    <code className="bg-background/50 px-2 py-1 rounded text-[11px]">{defaultModel}</code>
                    <Badge variant="outline">{priceFor(defaultModel).provider}</Badge>
                    {defaultModel.startsWith("ollama:") && <Badge variant="success">local 🆓</Badge>}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Input: ${priceFor(defaultModel).input}/1k tok ·
                    Output: ${priceFor(defaultModel).output}/1k tok
                  </div>
                </div>
                <div className="rounded-md border border-border p-3 space-y-2">
                  <div className="font-semibold text-foreground">Mode</div>
                  <ModeSwitch mode={mode} onChange={setMode} />
                  <div className="text-[10px] text-muted-foreground">
                    {mode === "planning"
                      ? "Planning: Architect → Builder → Reviewer multi-agent loop"
                      : "Agent: Streaming chat with auto-persona selection"}
                  </div>
                </div>
                <div className="rounded-md border border-border p-3 space-y-2">
                  <div className="font-semibold text-foreground">Tasks</div>
                  <div className="flex gap-3">
                    <div className="text-center">
                      <div className="text-xl font-mono text-emerald-400">{tasks.filter((t) => t.is_done).length}</div>
                      <div className="text-[10px] text-muted-foreground">done</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xl font-mono text-amber-400">{tasks.filter((t) => t.status === "in_progress").length}</div>
                      <div className="text-[10px] text-muted-foreground">running</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xl font-mono text-red-400">{tasks.filter((t) => t.status === "failed").length}</div>
                      <div className="text-[10px] text-muted-foreground">failed</div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  )
}
