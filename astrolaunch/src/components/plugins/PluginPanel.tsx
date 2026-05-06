"use client"
/**
 * Plugin panel — install / enable / disable / open plugins. Plugins run inside
 * a sandboxed iframe and use the postMessage SDK to talk to the host.
 */
import { useEffect, useState, useCallback } from "react"
import { db } from "@/lib/storage/db"
import type { PluginRecord } from "@/types"
import { Button } from "@/components/ui/button"
import { AppIcon } from "@/lib/iconify"
import { cn } from "@/lib/utils"
import { useWorkspace } from "@/store/workspace"
import { Switch } from "@/components/ui/switch"
import { PluginManifestSchema, describePermission, SENSITIVE_PERMISSIONS, inlineEntry } from "@/lib/plugins/manifest"
import { buildPluginScaffold, SAMPLE_PLUGINS, ASTRO_SDK_SRC } from "@/lib/plugins/sdk"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { nanoid } from "nanoid"

export function PluginPanel() {
  const [plugins, setPlugins] = useState<PluginRecord[]>([])
  const [installerOpen, setInstallerOpen] = useState(false)
  const { setActivePluginId, activePluginId } = useWorkspace()

  const refresh = useCallback(async () => {
    if (!db) return
    setPlugins(await db.plugins.orderBy("installedAt").toArray())
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // Seed with sample plugins on first load
  useEffect(() => {
    (async () => {
      if (!db) return
      const count = await db.plugins.count()
      if (count > 0) return
      for (const sp of SAMPLE_PLUGINS) {
        const html = buildPluginScaffold({ title: sp.manifest.name, script: sp.code })
        const rec: PluginRecord = {
          ...sp.manifest,
          permissions: [...sp.manifest.permissions],
          contributes: sp.manifest.contributes.map((c) => ({ ...c })),
          entry: inlineEntry(html),
          enabled: true,
          installedAt: Date.now(),
          source: { manifest: JSON.stringify(sp.manifest, null, 2), code: sp.code },
        }
        await db.plugins.add(rec)
      }
      refresh()
    })()
  }, [refresh])

  const toggle = async (id: string, enabled: boolean) => {
    await db.plugins.update(id, { enabled })
    refresh()
  }
  const remove = async (id: string) => {
    if (!confirm("Uninstall this plugin?")) return
    await db.plugins.delete(id)
    if (activePluginId === id) setActivePluginId(null)
    refresh()
  }
  const open = async (id: string) => {
    const rec = await db.plugins.get(id)
    if (!rec || !rec.enabled) return
    setActivePluginId(id)
  }

  return (
    <div className="h-full flex flex-col text-xs">
      <div className="p-2 border-b border-border flex items-center gap-2">
        <span className="text-muted-foreground">{plugins.length} installed</span>
        <Button size="sm" className="ml-auto h-7" onClick={() => setInstallerOpen(true)}>
          <AppIcon name="plus" width={12} /> Install
        </Button>
      </div>
      <div className="flex-1 overflow-auto">
        {plugins.length === 0 && (
          <div className="p-4 text-muted-foreground space-y-2">
            <div>No plugins installed yet.</div>
            <Button size="sm" variant="outline" onClick={() => setInstallerOpen(true)}>Install your first plugin</Button>
          </div>
        )}
        {plugins.map((p) => (
          <div
            key={p.id}
            className={cn(
              "p-2 border-b border-border/60 group hover:bg-accent/20",
              activePluginId === p.id && "bg-al-accent/10",
              !p.enabled && "opacity-60"
            )}
          >
            <div className="flex items-start gap-2">
              <div className="w-6 h-6 rounded-md bg-al-accent/20 flex items-center justify-center text-[11px]">
                {p.name.slice(0, 1)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{p.name}</span>
                  <Badge variant="outline" className="text-[9px] py-0 px-1">{p.version}</Badge>
                </div>
                <div className="text-muted-foreground truncate text-[11px]">{p.description ?? ""}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {p.permissions.map((perm) => (
                    <span key={perm} className="text-[9px] px-1 rounded bg-background/60 border border-border">{perm}</span>
                  ))}
                </div>
              </div>
              <Switch checked={p.enabled} onCheckedChange={(v) => toggle(p.id, v)} />
            </div>
            <div className="mt-2 flex gap-1">
              <Button size="sm" variant="outline" className="h-6 flex-1" disabled={!p.enabled} onClick={() => open(p.id)}>
                <AppIcon name="play" width={11} /> Open
              </Button>
              <Button size="sm" variant="ghost" className="h-6" onClick={() => remove(p.id)}>
                <AppIcon name="trash" width={11} />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <PluginInstaller open={installerOpen} onClose={() => { setInstallerOpen(false); refresh() }} />
    </div>
  )
}

const STARTER_MANIFEST = JSON.stringify({
  id: "my-plugin",
  name: "My Plugin",
  version: "0.1.0",
  description: "A demo plugin",
  permissions: ["read_files", "open_dialogs"],
  contributes: [{ surface: "panel", title: "My Plugin", icon: "mdi:puzzle" }],
}, null, 2)

const STARTER_CODE = `// You have an \`al\` client preloaded.
const list = await al.files.list();
document.body.innerHTML = "<h1>Hello!</h1><p>Workspace has " + list.length + " items.</p>";
al.ui.toast("Hi from My Plugin 👋");
`

function PluginInstaller({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [manifestText, setManifestText] = useState(STARTER_MANIFEST)
  const [code, setCode] = useState(STARTER_CODE)
  const [error, setError] = useState<string | null>(null)
  const [confirmingPerms, setConfirmingPerms] = useState<{ manifest: ReturnType<typeof JSON.parse>; html: string } | null>(null)

  const tryInstall = () => {
    setError(null)
    let parsed
    try { parsed = JSON.parse(manifestText) } catch (e) { setError(`Manifest JSON: ${String(e)}`); return }
    const result = PluginManifestSchema.safeParse(parsed)
    if (!result.success) {
      setError(result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n"))
      return
    }
    const html = buildPluginScaffold({ title: result.data.name, script: code })
    setConfirmingPerms({ manifest: result.data, html })
  }

  const confirmInstall = async () => {
    if (!confirmingPerms) return
    const { manifest, html } = confirmingPerms
    const rec: PluginRecord = {
      ...manifest,
      entry: inlineEntry(html),
      enabled: true,
      installedAt: Date.now(),
      source: { manifest: manifestText, code },
      id: (await db.plugins.get(manifest.id)) ? `${manifest.id}-${nanoid(4)}` : manifest.id,
    }
    await db.plugins.add(rec)
    toast.success(`Installed plugin: ${rec.name}`)
    setConfirmingPerms(null)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AppIcon name="plus" width={16} /> Install plugin
          </DialogTitle>
          <DialogDescription>
            Plugins run inside a sandboxed iframe and call AstroLaunch via postMessage. Use the SDK exposed as <code>window.createAstroClient()</code>.
          </DialogDescription>
        </DialogHeader>
        {!confirmingPerms ? (
          <div className="grid grid-cols-2 gap-3 text-xs p-4">
            <div>
              <div className="text-[10px] uppercase text-muted-foreground mb-1">manifest.json</div>
              <Textarea value={manifestText} onChange={(e) => setManifestText(e.target.value)} rows={16} className="font-mono text-[11px]" />
            </div>
            <div>
              <div className="text-[10px] uppercase text-muted-foreground mb-1">plugin code (runs after SDK preload)</div>
              <Textarea value={code} onChange={(e) => setCode(e.target.value)} rows={16} className="font-mono text-[11px]" />
            </div>
            {error && <div className="col-span-2 text-red-400 whitespace-pre-wrap text-[11px]">{error}</div>}
            <div className="col-span-2 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
              <Button size="sm" onClick={tryInstall}>Validate &amp; install</Button>
            </div>
            <details className="col-span-2 text-[11px] text-muted-foreground">
              <summary className="cursor-pointer">Show SDK source (read-only — auto-injected into plugins)</summary>
              <pre className="mt-2 max-h-48 overflow-auto bg-background/50 p-2 rounded">{ASTRO_SDK_SRC}</pre>
            </details>
          </div>
        ) : (
          <div className="p-4 space-y-3 text-sm">
            <div className="font-medium">Grant permissions to <span className="text-al-accent">{confirmingPerms.manifest.name}</span>?</div>
            <ul className="space-y-1 text-xs">
              {confirmingPerms.manifest.permissions.map((p: string) => (
                <li key={p} className="flex items-start gap-2">
                  <span className={cn(
                    "mt-0.5 w-2 h-2 rounded-full",
                    SENSITIVE_PERMISSIONS.includes(p as never) ? "bg-amber-400" : "bg-emerald-400"
                  )} />
                  <span><b>{p}</b> — {describePermission(p as never)}</span>
                </li>
              ))}
            </ul>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmingPerms(null)}>Back</Button>
              <Button size="sm" onClick={confirmInstall}>Confirm install</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
