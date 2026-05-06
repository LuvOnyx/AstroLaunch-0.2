"use client"
/**
 * CodeEditor v2 — Monaco with:
 *   - autosave + dirty indicator
 *   - AI inline edit (⌘I): selects current selection or full file, opens a
 *     prompt overlay, sends to /api/agents/chat as a transform request,
 *     applies the diff inline.
 *   - quick-save (⌘S)
 *   - keyboard-friendly tab close
 */
import dynamic from "next/dynamic"
import { useEffect, useRef, useState, useCallback } from "react"
import { db } from "@/lib/storage/db"
import { useWorkspace } from "@/store/workspace"
import { useSettings } from "@/store/settings"
import { detectLanguage } from "@/lib/editor/lang"
import { AppIcon, FileIcon } from "@/lib/iconify"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { motion, AnimatePresence } from "framer-motion"

const Monaco = dynamic(() => import("@monaco-editor/react"), { ssr: false })

interface InlineEditState {
  visible: boolean
  prompt: string
  loading: boolean
  selection: string
  range?: import("monaco-editor").IRange
}

export function CodeEditor() {
  const { activeFileId, openFileIds, setActiveFile, closeFile, setDiffViewer } = useWorkspace()
  const settings = useSettings()
  const [content, setContent] = useState<string>("")
  const [tabs, setTabs] = useState<{ id: string; name: string; dirty: boolean; touched?: boolean; path?: string }[]>([])
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editorRef = useRef<import("monaco-editor").editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof import("monaco-editor") | null>(null)
  const [inline, setInline] = useState<InlineEditState>({ visible: false, prompt: "", loading: false, selection: "" })

  // Load active file content
  useEffect(() => {
    (async () => {
      if (!activeFileId) { setContent(""); return }
      const f = await db.files.get(activeFileId)
      setContent(f?.content ?? "")
    })()
  }, [activeFileId])

  // Sync open tabs metadata
  const syncTabs = useCallback(async () => {
    const files = await db.files.bulkGet(openFileIds)
    setTabs(files.filter(Boolean).map((f) => ({
      id: f!.id, name: f!.name, dirty: false, touched: f!.agentTouched, path: f!.path,
    })))
  }, [openFileIds])
  useEffect(() => { syncTabs() }, [syncTabs, activeFileId])
  useEffect(() => {
    const t = setInterval(syncTabs, 1500)
    return () => clearInterval(t)
  }, [syncTabs])

  const onChange = (val?: string) => {
    setContent(val ?? "")
    if (!activeFileId) return
    setTabs((prev) => prev.map((t) => t.id === activeFileId ? { ...t, dirty: true } : t))
    if (!settings.autoSave) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      await db.files.update(activeFileId, { content: val ?? "", modified: Date.now(), size: (val ?? "").length })
      setTabs((prev) => prev.map((t) => t.id === activeFileId ? { ...t, dirty: false } : t))
    }, settings.autoSaveDelay)
  }

  const saveNow = useCallback(async () => {
    if (!activeFileId) return
    await db.files.update(activeFileId, { content, modified: Date.now(), size: content.length })
    setTabs((prev) => prev.map((t) => t.id === activeFileId ? { ...t, dirty: false } : t))
    toast.success("Saved")
  }, [activeFileId, content])

  const openInlineEdit = useCallback(() => {
    if (!settings.aiInlineEdit) { toast("Enable AI inline edit in Settings → Editor"); return }
    const ed = editorRef.current
    if (!ed) return
    const sel = ed.getSelection()
    const model = ed.getModel()
    if (!model || !sel) return
    const text = sel.isEmpty() ? model.getValue() : model.getValueInRange(sel)
    setInline({ visible: true, prompt: "", loading: false, selection: text, range: sel.isEmpty() ? model.getFullModelRange() : sel })
  }, [settings.aiInlineEdit])

  const submitInlineEdit = async () => {
    if (!inline.prompt.trim() || !inline.range) return
    if (!settings.apiKeys.gemini) { toast.error("No Gemini API key set"); return }
    setInline((s) => ({ ...s, loading: true }))
    try {
      const res = await fetch("/api/agents/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { role: "user", content: `Transform this code per the instruction. Output ONLY the new code, no fences, no commentary.\n\nInstruction: ${inline.prompt}\n\nCode:\n${inline.selection}` },
          ],
          apiKey: settings.apiKeys.gemini,
          model: settings.defaultModel,
          systemPrompt: "You are a precise code-editing assistant. Output the rewritten code only.",
        }),
      })
      if (!res.ok || !res.body) throw new Error(await res.text())
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      let out = ""
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const frames = buffer.split("\n\n")
        buffer = frames.pop() ?? ""
        for (const f of frames) {
          const m = /^data:\s*(.*)$/m.exec(f)
          if (!m) continue
          try {
            const obj = JSON.parse(m[1])
            if (obj.delta) out += obj.delta
          } catch {}
        }
      }
      const cleaned = out.replace(/^```[a-z]*\n?/, "").replace(/\n?```$/, "")
      const ed = editorRef.current
      if (ed && inline.range) {
        ed.executeEdits("ai-inline", [{ range: inline.range, text: cleaned, forceMoveMarkers: true }])
        toast.success("AI edit applied")
      }
    } catch (e) { toast.error(`AI edit failed: ${String(e)}`) }
    finally { setInline({ visible: false, prompt: "", loading: false, selection: "" }) }
  }

  const handleMount = (editor: import("monaco-editor").editor.IStandaloneCodeEditor, monaco: typeof import("monaco-editor")) => {
    editorRef.current = editor
    monacoRef.current = monaco

    monaco.editor.defineTheme("astrolaunch-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": "#0c0c10",
        "editor.foreground": "#e4e4e7",
        "editorBracketHighlight.foreground1": "#ffd700",
        "editorBracketHighlight.foreground2": "#da70d6",
        "editorBracketHighlight.foreground3": "#87ceeb",
        "editorBracketHighlight.foreground4": "#ff7f50",
        "editorBracketHighlight.foreground5": "#98fb98",
        "editorBracketHighlight.foreground6": "#ff69b4",
        "editorIndentGuide.background1": "#1a1a22",
        "editorIndentGuide.activeBackground1": "#3a3a4a",
        "editor.selectionBackground": "#a78bfa33",
        "editor.lineHighlightBackground": "#16161d",
      },
    })
    monaco.editor.setTheme("astrolaunch-dark")

    // Bind ⌘S / Ctrl+S
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => { saveNow() })
    // Bind ⌘I — AI inline edit
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyI, () => { openInlineEdit() })
  }

  const activeTab = tabs.find((t) => t.id === activeFileId)

  if (!activeFileId) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
        <div className="text-center space-y-3">
          <div className="text-5xl">⌁</div>
          <div className="text-lg font-medium">AstroLaunch Editor</div>
          <div className="text-xs">Select a file from the Explorer or ask an agent to scaffold one.</div>
          <div className="text-[10px] opacity-60">⌘P quick-open · ⌘K command palette · ⌘I AI inline edit</div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col relative">
      {/* Tabs */}
      <div className="h-9 flex items-center bg-al-panel border-b border-border overflow-x-auto">
        {tabs.map((t) => (
          <div
            key={t.id}
            onClick={() => setActiveFile(t.id)}
            className={cn(
              "h-9 px-3 flex items-center gap-2 border-r border-border text-xs cursor-pointer group",
              activeFileId === t.id ? "bg-background text-foreground" : "text-muted-foreground hover:bg-accent/30"
            )}
          >
            <FileIcon filename={t.name} width={13} />
            <span>{t.name}</span>
            {t.touched && (
              <button
                title="Agent edits — open diff"
                onClick={(e) => { e.stopPropagation(); if (t.path) setDiffViewer(true, t.path) }}
                className="w-1.5 h-1.5 rounded-full bg-amber-400 hover:scale-125 transition"
              />
            )}
            {t.dirty && <span className="w-1.5 h-1.5 rounded-full bg-al-accent" />}
            <button
              onClick={(e) => { e.stopPropagation(); closeFile(t.id) }}
              className="opacity-0 group-hover:opacity-100 hover:text-foreground"
            >
              <AppIcon name="close" width={12} />
            </button>
          </div>
        ))}
        <div className="ml-auto flex items-center gap-1 px-2 text-[10px] text-muted-foreground">
          {activeTab?.touched && (
            <Button size="sm" variant="ghost" className="h-6" onClick={() => activeTab.path && setDiffViewer(true, activeTab.path)}>
              View diff
            </Button>
          )}
          {settings.aiInlineEdit && (
            <Button size="sm" variant="ghost" className="h-6" onClick={openInlineEdit} title="AI inline edit (⌘I)">
              <AppIcon name="agent" width={11} /> AI Edit
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <Monaco
          height="100%"
          language={detectLanguage(activeTab?.name ?? "")}
          value={content}
          theme="astrolaunch-dark"
          onChange={onChange}
          onMount={handleMount}
          options={{
            fontSize: settings.fontSize,
            fontFamily: settings.monoFontFamily,
            minimap: { enabled: settings.showMinimap },
            wordWrap: settings.wordWrap ? "on" : "off",
            tabSize: settings.tabSize,
            "bracketPairColorization.enabled": settings.rainbowBrackets,
            guides: { bracketPairs: settings.rainbowBrackets, indentation: true },
            smoothScrolling: true,
            cursorSmoothCaretAnimation: "on",
            scrollBeyondLastLine: false,
            renderLineHighlight: "all",
            padding: { top: 12 },
          } as unknown as Record<string, unknown>}
        />
      </div>

      {/* AI inline edit overlay */}
      <AnimatePresence>
        {inline.visible && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="absolute left-1/2 -translate-x-1/2 bottom-6 w-[min(640px,90%)] bg-al-panel border border-al-accent/40 rounded-xl shadow-2xl p-3 space-y-2 z-30"
          >
            <div className="flex items-center gap-2 text-xs">
              <AppIcon name="agent" width={14} className="text-al-accent" />
              <span className="font-medium">AI inline edit</span>
              <span className="text-muted-foreground">{inline.selection.split("\n").length} lines selected</span>
              <Button size="icon-sm" variant="ghost" className="ml-auto" onClick={() => setInline({ visible: false, prompt: "", loading: false, selection: "" })}>
                <AppIcon name="close" width={12} />
              </Button>
            </div>
            <Textarea
              autoFocus
              value={inline.prompt}
              onChange={(e) => setInline((s) => ({ ...s, prompt: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitInlineEdit() }}
              placeholder="Describe the change… (⌘⏎ to apply)"
              rows={2}
              className="text-xs"
            />
            <div className="flex justify-end">
              <Button size="sm" onClick={submitInlineEdit} disabled={!inline.prompt.trim() || inline.loading}>
                {inline.loading ? "Applying…" : "Apply (⌘⏎)"}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
