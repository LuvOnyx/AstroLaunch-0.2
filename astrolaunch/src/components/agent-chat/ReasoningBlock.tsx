"use client"
/**
 * ReasoningBlock — collapsible "what the agent is thinking" dropdown.
 * Click to toggle visibility. Animates open/close.
 */
import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"

interface Props {
  thinking: string
  streaming?: boolean
}

export function ReasoningBlock({ thinking, streaming }: Props) {
  const [open, setOpen] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number | "auto">("auto")

  useEffect(() => {
    if (contentRef.current) {
      setHeight(open ? contentRef.current.scrollHeight : 0)
    }
  }, [open, thinking])

  if (!thinking) return null

  const charCount = thinking.length
  const wordCount = Math.ceil(charCount / 5)

  return (
    <div className="mb-2 rounded-lg border border-al-accent/20 bg-al-accent/5 overflow-hidden">
      {/* Toggle header */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-[10px] text-muted-foreground hover:bg-al-accent/10 transition-colors"
      >
        {/* Pulsing brain icon when streaming */}
        <span
          className={cn(
            "text-[11px] transition-all duration-300",
            streaming && "animate-pulse"
          )}
        >
          🧠
        </span>
        <span className="text-al-accent/80 font-medium">
          {streaming ? "Reasoning…" : "Reasoning"}
        </span>
        <span className="text-[9px] opacity-50">{wordCount} words · click to {open ? "hide" : "show"}</span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.15 }}
          className="ml-auto opacity-50 text-[10px]"
        >
          ▼
        </motion.span>
      </button>

      {/* Collapsible content */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div
              ref={contentRef}
              className="px-3 py-2 text-[10px] text-muted-foreground/70 leading-relaxed font-mono whitespace-pre-wrap max-h-64 overflow-auto border-t border-al-accent/10"
              style={{ height }}
            >
              {thinking}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
