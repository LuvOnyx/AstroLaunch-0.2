"use client"
/**
 * Single chat message rendering — handles assistant streaming, tool diffs,
 * tool-call status, and per-message usage badge.
 */
import type { AgentMessage } from "@/types"
import { cn } from "@/lib/utils"
import { AppIcon } from "@/lib/iconify"
import { Badge } from "@/components/ui/badge"
import { useWorkspace } from "@/store/workspace"
import { useState } from "react"
import { DEFAULT_PERSONAS } from "@/lib/agents/personas"

interface Props {
  message: AgentMessage
  streaming?: boolean
  showDiffs?: boolean
}

export function MessageView({ message: m, streaming, showDiffs = true }: Props) {
  const { setDiffViewer } = useWorkspace()
  const persona = m.personaId ? DEFAULT_PERSONAS.find((p) => p.id === m.personaId) : null

  if (m.role === "tool") {
    const tc = m.toolCalls?.[0]
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className={cn(
            "w-1.5 h-1.5 rounded-full",
            tc?.status === "success" ? "bg-emerald-400" :
            tc?.status === "error" ? "bg-red-400" :
            "bg-amber-400"
          )} />
          <code className="bg-background/50 px-1 rounded">{tc?.name}</code>
          <span className="opacity-60">→ {tc?.status}</span>
          {!!tc?.retries && <Badge variant="outline" className="text-[9px] py-0 px-1">retries: {tc.retries}</Badge>}
          {!!tc?.durationMs && <span className="opacity-60">{tc.durationMs}ms</span>}
        </div>
        {showDiffs && m.toolDiffs?.map((d, i) => (
          <button
            key={i}
            onClick={() => setDiffViewer(true, d.path)}
            className="block w-full text-left rounded border border-border bg-background/40 p-2 hover:bg-background/70"
          >
            <div className="flex items-center gap-2 text-[11px]">
              <span className={cn(
                "px-1 rounded text-[9px]",
                d.kind === "create" && "bg-emerald-500/20 text-emerald-300",
                d.kind === "update" && "bg-amber-500/20 text-amber-300",
                d.kind === "delete" && "bg-red-500/20 text-red-300",
              )}>{d.kind}</span>
              <span className="font-mono truncate flex-1">{d.path}</span>
              <span className="text-emerald-400">+{d.added ?? 0}</span>
              <span className="text-red-400">-{d.removed ?? 0}</span>
            </div>
            {d.unified && <UnifiedSnippet text={d.unified} />}
          </button>
        ))}
      </div>
    )
  }

  if (m.role === "system") {
    return <div className="text-[11px] italic text-muted-foreground border-l-2 border-border pl-2">{m.content}</div>
  }

  return (
    <div className={cn("flex gap-2", m.role === "user" && "justify-end")}>
      {m.role !== "user" && (
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center text-xs flex-shrink-0"
          style={{ background: persona ? `${persona.color}33` : "hsl(var(--al-accent) / 0.2)" }}
          title={persona?.name ?? "Assistant"}
        >
          {persona?.emoji ?? "⌁"}
        </div>
      )}
      <div className={cn(
        "rounded-lg px-3 py-2 max-w-[85%] whitespace-pre-wrap break-words text-[13px] leading-relaxed",
        m.role === "user" ? "bg-al-accent/20 text-foreground" : "bg-background/50 border border-border"
      )}>
        {m.content || (streaming ? <span className="opacity-60 animate-pulse">…</span> : "")}
        {m.usage && (
          <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
            <span>{m.usage.input}↑ {m.usage.output}↓ tokens</span>
            <span>· ${m.usage.costUsd.toFixed(4)}</span>
            <span className="opacity-60">· {m.usage.model}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function UnifiedSnippet({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const lines = text.split("\n").slice(0, 30)
  return (
    <div className="mt-1">
      <button onClick={(e) => { e.stopPropagation(); setOpen(!open) }} className="text-[10px] text-muted-foreground hover:text-foreground">
        {open ? "▼" : "▶"} {open ? "hide diff" : "show diff"}
      </button>
      {open && (
        <pre className="mt-1 font-mono text-[10px] leading-4 max-h-48 overflow-auto bg-[#0c0c10] rounded p-2">
          {lines.map((l, i) => (
            <div key={i} className={cn(
              l.startsWith("+") && !l.startsWith("+++") && "text-emerald-400",
              l.startsWith("-") && !l.startsWith("---") && "text-red-400",
              l.startsWith("@@") && "text-cyan-400",
            )}>{l}</div>
          ))}
          {text.split("\n").length > 30 && <div className="opacity-60">… (truncated)</div>}
        </pre>
      )}
    </div>
  )
}
