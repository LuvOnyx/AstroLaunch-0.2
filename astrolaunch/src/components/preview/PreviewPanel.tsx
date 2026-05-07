"use client"
/**
 * PreviewPanel v4 — URL-bar iframe preview.
 *
 * No WebContainer dependency.  User runs their dev server in the terminal
 * (e.g. `npm run dev`) and pastes the URL here, OR the panel auto-detects
 * a local server on common ports via a simple health-check poll.
 */
import { useEffect, useRef, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { AppIcon } from "@/lib/iconify"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"

const POLL_MS = 3_000

/**
 * Detect a running dev server by asking our own API route (server-side check).
 * This avoids ERR_CONNECTION_REFUSED noise in the browser console.
 */
async function detectServer(): Promise<string | null> {
  try {
    const res = await fetch("/api/detect-server", { method: "GET" })
    if (!res.ok) return null
    const { url } = await res.json()
    return url ?? null
  } catch {
    return null
  }
}

export function PreviewPanel() {
  const iframeRef        = useRef<HTMLIFrameElement>(null)
  const [url, setUrl]    = useState<string | null>(null)
  const [input, setInput] = useState("")
  const [detecting, setDetecting] = useState(true)
  const pollRef          = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── auto-detect loop ────────────────────────────────────────────────────
  const startPolling = useCallback(() => {
    let alive = true
    const tick = async () => {
      if (!alive) return
      const found = await detectServer()
      if (found && alive) {
        setUrl(found)
        setInput(found)
        setDetecting(false)
        return // stop once found
      }
      if (alive) pollRef.current = setTimeout(tick, POLL_MS)
    }
    tick()
    return () => { alive = false; if (pollRef.current) clearTimeout(pollRef.current) }
  }, [])

  useEffect(() => {
    const cleanup = startPolling()
    return cleanup
  }, [startPolling])

  // ── manual navigation ────────────────────────────────────────────────────
  const navigate = () => {
    let u = input.trim()
    if (!u) return
    if (!/^https?:\/\//i.test(u)) u = "http://" + u
    setUrl(u)
    if (pollRef.current) { clearTimeout(pollRef.current); setDetecting(false) }
  }

  const reload = () => iframeRef.current?.contentWindow?.location.reload()

  const openExternal = () => url && window.open(url, "_blank")

  const clear = () => {
    setUrl(null)
    setInput("")
    setDetecting(true)
    startPolling()
  }

  // ── render ───────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col bg-al-canvas">
      {/* ── URL bar ── */}
      <div className="h-9 flex items-center gap-1.5 px-2 border-b border-border bg-al-panel flex-shrink-0">
        {/* status dot */}
        <span className={cn(
          "w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors",
          url          ? "bg-emerald-500"              :
          detecting    ? "bg-amber-400 animate-pulse"  :
                         "bg-muted-foreground/30"
        )} />

        {/* URL input */}
        <form
          className="flex-1 flex items-center min-w-0"
          onSubmit={(e) => { e.preventDefault(); navigate() }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={detecting ? "Detecting dev server…" : "http://localhost:3000"}
            className="flex-1 min-w-0 bg-transparent text-[11px] font-mono text-muted-foreground placeholder:text-muted-foreground/40 outline-none py-1"
          />
        </form>

        {/* actions */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <Button size="icon-sm" variant="ghost" onClick={navigate} title="Navigate" className="h-6 w-6">
            <AppIcon name="arrow-right" width={13} />
          </Button>
          {url && (
            <>
              <Button size="icon-sm" variant="ghost" onClick={reload} title="Reload" className="h-6 w-6">
                <AppIcon name="refresh" width={13} />
              </Button>
              <Button size="icon-sm" variant="ghost" onClick={openExternal} title="Open in new tab" className="h-6 w-6">
                <AppIcon name="preview" width={13} />
              </Button>
              <Button size="icon-sm" variant="ghost" onClick={clear} title="Clear" className="h-6 w-6 text-muted-foreground/50">
                <AppIcon name="close" width={11} />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ── content area ── */}
      <div className="flex-1 relative overflow-hidden bg-al-canvas">
        <AnimatePresence mode="wait">
          {url ? (
            <motion.iframe
              key={url}
              ref={iframeRef}
              src={url}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="absolute inset-0 w-full h-full border-0 bg-white"
              sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-modals allow-pointer-lock"
            />
          ) : (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <div className="text-center space-y-4 px-8 max-w-xs">
                <div className="w-14 h-14 mx-auto rounded-xl bg-al-panel border border-border flex items-center justify-center">
                  <AppIcon name="preview" width={28} className="opacity-25" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">Live Preview</p>
                  <p className="text-xs text-muted-foreground">
                    {detecting
                      ? "Watching for a dev server on common ports…"
                      : "Open the terminal and start a server:"}
                  </p>
                </div>
                {!detecting && (
                  <div className="bg-background/50 border border-border rounded-lg px-4 py-2.5 text-left space-y-0.5">
                    <div className="font-mono text-[11px]">
                      <span className="text-muted-foreground">$ </span>npm install
                    </div>
                    <div className="font-mono text-[11px]">
                      <span className="text-muted-foreground">$ </span>npm run dev
                    </div>
                  </div>
                )}
                {detecting && (
                  <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground/60">
                    <span className="w-1 h-1 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1 h-1 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1 h-1 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
