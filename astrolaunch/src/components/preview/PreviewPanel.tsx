"use client"
/**
 * PreviewPanel v3 — auto-watches WebContainer server-ready.
 * No "Run" button needed: user starts their dev server from the integrated terminal.
 */
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { AppIcon } from "@/lib/iconify"
import { bootWebContainer } from "@/lib/webcontainer/boot"
import { motion } from "framer-motion"

export function PreviewPanel() {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<"idle" | "booting" | "live" | "error">("idle")
  const [statusText, setStatusText] = useState("Starting WebContainer…")

  useEffect(() => {
    // Check if a dev server is already running (e.g. page reload after starting)
    const existing = (window as unknown as { alPreviewUrl?: string }).alPreviewUrl
    if (existing) {
      setUrl(existing)
      setStatus("live")
      setStatusText("Live")
      return
    }

    let cancelled = false
    setStatus("booting")
    setStatusText("Starting WebContainer…")

    ;(async () => {
      try {
        const wc = await bootWebContainer()
        if (cancelled) return
        setStatusText("Run `npm run dev` in the terminal →")
        setStatus("idle")

        wc.on("server-ready", (_port, ready) => {
          if (cancelled) return
          setUrl(ready)
          setStatus("live")
          setStatusText("Live")
          ;(window as unknown as { alPreviewUrl?: string }).alPreviewUrl = ready
        })
      } catch (e) {
        if (cancelled) return
        setStatus("error")
        setStatusText(`Error: ${String(e)}`)
      }
    })()

    return () => { cancelled = true }
  }, [])

  const reload = () => iframeRef.current?.contentWindow?.location.reload()
  const openExternal = () => url && window.open(url, "_blank")

  return (
    <div className="h-full flex flex-col bg-al-canvas">
      {/* Status bar */}
      <div className="h-9 flex items-center gap-2 px-3 border-b border-border bg-al-panel flex-shrink-0">
        <span className={[
          "w-2 h-2 rounded-full transition-colors",
          status === "live" ? "bg-emerald-500 animate-pulse" :
          status === "booting" ? "bg-amber-400 animate-pulse" :
          status === "error" ? "bg-red-500" :
          "bg-muted-foreground/30",
        ].join(" ")} />
        <span className="text-xs text-muted-foreground">{statusText}</span>
        {url && (
          <span className="text-xs text-muted-foreground/60 truncate max-w-[50%] font-mono">{url}</span>
        )}
        <div className="ml-auto flex gap-1">
          {url && (
            <>
              <Button size="icon-sm" variant="ghost" onClick={reload} title="Reload preview">
                <AppIcon name="refresh" width={14} />
              </Button>
              <Button size="icon-sm" variant="ghost" onClick={openExternal} title="Open in new tab">
                <AppIcon name="preview" width={14} />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Preview iframe or waiting state */}
      <div className="flex-1 relative bg-white overflow-hidden">
        {url ? (
          <motion.iframe
            ref={iframeRef}
            key={url}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.35 }}
            src={url}
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-modals"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-al-canvas">
            <div className="text-center space-y-4 px-6">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-al-panel border border-border flex items-center justify-center">
                <AppIcon name="preview" width={32} className="opacity-30" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">No dev server running</p>
                <p className="text-xs text-muted-foreground">Open the terminal and run:</p>
              </div>
              <div className="bg-background/60 border border-border rounded-lg px-4 py-2.5 font-mono text-xs text-foreground text-left space-y-0.5">
                <div><span className="text-muted-foreground">$</span> npm install</div>
                <div><span className="text-muted-foreground">$</span> npm run dev</div>
              </div>
              <p className="text-[11px] text-muted-foreground/60">
                The preview will appear automatically when the server is ready
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
