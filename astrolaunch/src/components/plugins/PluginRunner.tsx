"use client"
/**
 * PluginRunner — mounts the active plugin in a sandboxed iframe and registers
 * it with the global plugin host. Runs in the center panel when a plugin is
 * selected from the Plugins panel.
 */
import { useEffect, useRef, useState } from "react"
import { useWorkspace } from "@/store/workspace"
import { db } from "@/lib/storage/db"
import type { PluginRecord } from "@/types"
import { pluginHost } from "@/lib/plugins/host"
import { Button } from "@/components/ui/button"
import { AppIcon } from "@/lib/iconify"

export function PluginRunner() {
  const { activePluginId, setActivePluginId } = useWorkspace()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [record, setRecord] = useState<PluginRecord | null>(null)

  useEffect(() => {
    (async () => {
      if (!activePluginId) { setRecord(null); return }
      const r = await db.plugins.get(activePluginId)
      setRecord(r ?? null)
    })()
  }, [activePluginId])

  useEffect(() => {
    if (!record || !iframeRef.current) return
    const iframe = iframeRef.current
    const onLoad = () => pluginHost.register(record, iframe)
    iframe.addEventListener("load", onLoad)
    return () => {
      iframe.removeEventListener("load", onLoad)
      pluginHost.unregister(record.id)
    }
  }, [record])

  if (!record) return null

  return (
    <div className="h-full flex flex-col bg-al-canvas">
      <div className="h-9 flex items-center gap-2 px-3 border-b border-border bg-al-panel">
        <div className="w-5 h-5 rounded bg-al-accent/30 flex items-center justify-center text-[10px]">
          {record.name.slice(0, 1)}
        </div>
        <span className="text-xs font-medium">{record.name}</span>
        <span className="text-[10px] text-muted-foreground">v{record.version}</span>
        <span className="text-[10px] text-muted-foreground">sandboxed</span>
        <div className="ml-auto flex gap-1">
          <Button size="icon-sm" variant="ghost" onClick={() => iframeRef.current?.contentWindow?.location.reload()}>
            <AppIcon name="refresh" width={13} />
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={() => setActivePluginId(null)} title="Close">
            <AppIcon name="close" width={13} />
          </Button>
        </div>
      </div>
      <div className="flex-1 relative bg-[#0c0c10]">
        <iframe
          ref={iframeRef}
          src={record.entry}
          className="absolute inset-0 w-full h-full border-0"
          // Note: data: URLs run with `null` origin so we can NOT add allow-same-origin
          sandbox="allow-scripts allow-forms allow-popups allow-modals"
        />
      </div>
    </div>
  )
}
