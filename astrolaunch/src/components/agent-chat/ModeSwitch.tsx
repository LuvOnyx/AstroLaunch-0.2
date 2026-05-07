"use client"
/**
 * ModeSwitch — futuristic pill toggle between "Planning" and "Agent" mode.
 * Planning = full multi-agent orchestrator loop (was /build)
 * Agent    = streaming chat (was default)
 */
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

export type AgentMode = "agent" | "planning"

interface Props {
  mode: AgentMode
  onChange: (mode: AgentMode) => void
  disabled?: boolean
}

export function ModeSwitch({ mode, onChange, disabled }: Props) {
  return (
    <div
      className={cn(
        "relative flex items-center rounded-full p-0.5 select-none",
        "bg-background/60 border border-border/60 backdrop-blur-sm",
        "text-[10px] font-medium h-6",
        disabled && "opacity-50 pointer-events-none"
      )}
      style={{ width: 152 }}
    >
      {/* Sliding pill */}
      <motion.div
        className="absolute h-[18px] rounded-full bg-al-accent/30 border border-al-accent/50 shadow-[0_0_8px_hsl(var(--al-accent)/0.4)]"
        style={{ width: 72, left: 2 }}
        animate={{ x: mode === "planning" ? 74 : 0 }}
        transition={{ type: "spring", stiffness: 500, damping: 32 }}
      />

      {(["agent", "planning"] as const).map((m) => (
        <button
          key={m}
          onClick={() => !disabled && onChange(m)}
          className={cn(
            "relative z-10 flex-1 flex items-center justify-center gap-1 py-0.5 rounded-full transition-colors duration-150",
            mode === m ? "text-foreground" : "text-muted-foreground hover:text-foreground/70"
          )}
          style={{ height: 18 }}
        >
          <span className="text-[9px]">{m === "agent" ? "⚡" : "🧭"}</span>
          <span className="capitalize">{m === "agent" ? "Agent" : "Planning"}</span>
        </button>
      ))}
    </div>
  )
}
