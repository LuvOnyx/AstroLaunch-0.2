"use client"
/**
 * Penpot canvas embed v2 — config persisted in zustand-friendly localStorage,
 * with the design tokens panel exposed for token → CSS variable export.
 */
import { useEffect, useMemo, useRef, useState } from "react"
import { PenpotBridge, DEFAULT_PENPOT_URL } from "@/lib/penpot/bridge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AppIcon } from "@/lib/iconify"
import { motion } from "framer-motion"
import { toast } from "sonner"

const STORAGE = "astrolaunch.penpot.config.v2"

interface PenpotConfigState { baseUrl: string; fileId: string; pageId: string }

export function PenpotCanvas() {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [cfg, setCfg] = useState<PenpotConfigState>(() => {
    if (typeof window === "undefined") return { baseUrl: DEFAULT_PENPOT_URL, fileId: "", pageId: "" }
    try { return JSON.parse(localStorage.getItem(STORAGE) ?? "") || { baseUrl: DEFAULT_PENPOT_URL, fileId: "", pageId: "" } }
    catch { return { baseUrl: DEFAULT_PENPOT_URL, fileId: "", pageId: "" } }
  })
  const [editingCfg, setEditingCfg] = useState<PenpotConfigState>(cfg)
  const [showConfig, setShowConfig] = useState(!cfg.fileId)

  const bridge = useMemo(() => new PenpotBridge({
    baseUrl: cfg.baseUrl, fileId: cfg.fileId, pageId: cfg.pageId,
  }), [cfg])

  useEffect(() => {
    if (iframeRef.current) bridge.attach(iframeRef.current)
    return () => bridge.detach()
  }, [bridge])

  const save = () => {
    setCfg(editingCfg)
    localStorage.setItem(STORAGE, JSON.stringify(editingCfg))
    setShowConfig(false)
    toast.success("Penpot connection saved")
  }

  const exportTokens = () => {
    bridge.send("request-tokens")
    toast("Token export request sent — supported in Penpot Plugin runtime")
  }

  const embedUrl = bridge.buildEmbedUrl()

  return (
    <div className="h-full flex flex-col bg-al-canvas relative">
      <div className="h-9 flex items-center gap-2 px-3 border-b border-border bg-al-panel">
        <AppIcon name="penpot" width={14} className="text-[#7c3aed]" />
        <span className="text-xs font-medium">Penpot Design Canvas</span>
        {cfg.fileId && <span className="text-[10px] text-muted-foreground truncate">file: {cfg.fileId.slice(0, 12)}…</span>}
        <div className="ml-auto flex gap-1">
          {cfg.fileId && (
            <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={exportTokens}>
              <AppIcon name="download" width={12} /> Tokens
            </Button>
          )}
          <Button size="icon-sm" variant="ghost" onClick={() => setShowConfig(true)}><AppIcon name="settings" width={14} /></Button>
          <Button size="icon-sm" variant="ghost" onClick={() => iframeRef.current?.contentWindow?.location.reload()}>
            <AppIcon name="refresh" width={14} />
          </Button>
        </div>
      </div>
      <div className="flex-1 relative">
        {cfg.fileId && !showConfig ? (
          <iframe
            ref={iframeRef}
            src={embedUrl}
            className="w-full h-full border-0"
            allow="clipboard-read; clipboard-write; fullscreen"
          />
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <div className="w-full max-w-md bg-al-panel border border-border rounded-xl p-6 space-y-4 shadow-2xl">
              <div className="flex items-center gap-2">
                <AppIcon name="penpot" width={24} className="text-[#7c3aed]" />
                <div>
                  <div className="text-sm font-semibold">Connect Penpot</div>
                  <div className="text-xs text-muted-foreground">Embed any Penpot file as your design canvas.</div>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Penpot URL</label>
                <Input value={editingCfg.baseUrl} onChange={(e) => setEditingCfg({ ...editingCfg, baseUrl: e.target.value })} className="text-xs" />
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">File ID</label>
                <Input value={editingCfg.fileId} onChange={(e) => setEditingCfg({ ...editingCfg, fileId: e.target.value })} placeholder="UUID from Penpot URL" className="text-xs" />
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Page ID (optional)</label>
                <Input value={editingCfg.pageId} onChange={(e) => setEditingCfg({ ...editingCfg, pageId: e.target.value })} className="text-xs" />
              </div>
              <Button className="w-full" onClick={save} disabled={!editingCfg.fileId}>Connect Canvas</Button>
              <p className="text-[10px] text-muted-foreground">Tip: open your design in Penpot, copy the file-id from the URL, paste here. Self-host Penpot for full embed support without CSP friction.</p>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}
