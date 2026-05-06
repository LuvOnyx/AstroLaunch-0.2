"use client"
/**
 * PreviewPanel v2 — same WebContainer dev server, but exposes the live URL on
 * window.alPreviewUrl (for plugins) and routes output to the bottom Output
 * panel via the alWebContainer.onOutput bus.
 */
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { AppIcon } from "@/lib/iconify"
import { bootWebContainer, mountFiles } from "@/lib/webcontainer/boot"
import { db } from "@/lib/storage/db"
import { motion } from "framer-motion"
import { useWorkspace } from "@/store/workspace"

interface Props { running: boolean }

export function PreviewPanel({ running }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<string>("Idle")
  const [logs, setLogs] = useState<string[]>([])
  const { setBottomTab, setShowBottomPanel } = useWorkspace()

  const append = (s: string) => setLogs((l) => [...l.slice(-200), s])

  useEffect(() => {
    if (!running) return
    let cancelled = false
    ;(async () => {
      try {
        setStatus("Booting WebContainer…")
        const wc = await bootWebContainer()
        if (cancelled) return
        setStatus("Mounting files…")
        const files = await db.files.where("type").equals("file").toArray()
        const tree: Record<string, string> = {}
        for (const f of files) tree[f.path.replace(/^\//, "")] = f.content ?? ""
        if (!tree["package.json"]) {
          tree["package.json"] = JSON.stringify({
            name: "astro-preview", private: true, type: "module",
            scripts: { dev: "vite --host 0.0.0.0 --port 3001" },
            dependencies: { react: "^19.0.0", "react-dom": "^19.0.0" },
            devDependencies: { vite: "^5.4.0", "@vitejs/plugin-react": "^4.3.0" },
          }, null, 2)
          tree["vite.config.js"] = `import react from "@vitejs/plugin-react"\nexport default { plugins: [react()] }`
          tree["index.html"] = `<!doctype html><html><head><meta charset="utf-8"><title>AstroLaunch Preview</title></head><body><div id="root"></div><script type="module" src="/main.jsx"></script></body></html>`
          tree["main.jsx"] = `import { createRoot } from "react-dom/client"\nimport App from "./src/App"\ncreateRoot(document.getElementById("root")).render(<App />)`
        }
        await mountFiles(wc, tree)
        if (cancelled) return
        setStatus("Installing deps…")
        const install = await wc.spawn("npm", ["install"])
        install.output.pipeTo(new WritableStream({ write(c) { append(c) } }))
        const code = await install.exit
        if (code !== 0) { setStatus("Install failed"); return }
        if (cancelled) return
        setStatus("Starting dev server…")
        const dev = await wc.spawn("npm", ["run", "dev"])
        dev.output.pipeTo(new WritableStream({ write(c) { append(c) } }))
        wc.on("server-ready", (_port, ready) => {
          if (cancelled) return
          setUrl(ready)
          setStatus("Live")
          ;(window as unknown as { alPreviewUrl?: string }).alPreviewUrl = ready
        })
      } catch (e) {
        setStatus(`Error: ${String(e)}`)
      }
    })()
    return () => { cancelled = true }
  }, [running])

  const showFullLog = () => { setBottomTab("output"); setShowBottomPanel(true) }

  return (
    <div className="h-full flex flex-col bg-al-canvas">
      <div className="h-9 flex items-center gap-2 px-3 border-b border-border bg-al-panel">
        <span className={`w-2 h-2 rounded-full ${status === "Live" ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"}`} />
        <span className="text-xs">{status}</span>
        {url && <span className="ml-2 text-xs text-muted-foreground truncate max-w-[60%]">{url}</span>}
        <div className="ml-auto flex gap-1">
          <Button size="icon-sm" variant="ghost" onClick={showFullLog} title="Full output log">
            <AppIcon name="terminal" width={14} />
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={() => iframeRef.current?.contentWindow?.location.reload()} title="Reload">
            <AppIcon name="refresh" width={14} />
          </Button>
          {url && (
            <Button size="icon-sm" variant="ghost" onClick={() => window.open(url, "_blank")} title="Open in new tab">
              <AppIcon name="preview" width={14} />
            </Button>
          )}
        </div>
      </div>
      <div className="flex-1 relative bg-white">
        {url ? (
          <motion.iframe
            ref={iframeRef}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            src={url}
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-modals"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
            <div className="text-center space-y-2">
              <AppIcon name="preview" width={48} className="mx-auto opacity-30" />
              <div>{running ? status : "Press Run to start the live preview."}</div>
            </div>
          </div>
        )}
      </div>
      {logs.length > 0 && (
        <div className="h-24 border-t border-border bg-al-panel/60 overflow-auto p-2 text-[10px] font-mono text-muted-foreground whitespace-pre-wrap">
          {logs.slice(-12).join("")}
        </div>
      )}
    </div>
  )
}
