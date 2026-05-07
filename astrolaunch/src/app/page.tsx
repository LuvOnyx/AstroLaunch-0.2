"use client"
import { useCallback, useEffect, useState } from "react"
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels"
import { Topbar } from "@/components/topbar/Topbar"
import { LeftSidebar } from "@/components/layout/LeftSidebar"
import { CenterPanel } from "@/components/layout/CenterPanel"
import { CodeEditor } from "@/components/editor/CodeEditor"
import { TerminalPanel } from "@/components/terminal/TerminalPanel"
import { FloatingAgentChat } from "@/components/agent-chat/FloatingAgentChat"
import { StatusBar } from "@/components/statusbar/StatusBar"
import { SettingsModal } from "@/components/settings/SettingsModal"
import { CommandPalette } from "@/components/layout/CommandPalette"
import { DiffViewer } from "@/components/diff/DiffViewer"
import { WelcomeModal } from "@/components/welcome/WelcomeModal"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "sonner"
import { useSettings, applySettingsToDOM } from "@/store/settings"
import { useWorkspace } from "@/store/workspace"
import { useMenuAction } from "@/components/topbar/MenuBar"
import { TEMPLATES, applyTemplate } from "@/lib/templates"
import { toast } from "sonner"

export default function Page() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [welcomeOpen, setWelcomeOpen] = useState(false)
  const settings = useSettings()
  const { showLeftSidebar, setShowLeftSidebar, setShowRightChat, showRightChat, setCenterMode, setLeftTab } = useWorkspace()

  useEffect(() => { applySettingsToDOM(useSettings.getState()) }, [])
  useEffect(() => { applySettingsToDOM(settings) }, [settings])

  // Show welcome modal on first load if enabled
  useEffect(() => {
    if (settings.showWelcome) {
      const timer = setTimeout(() => setWelcomeOpen(true), 800)
      return () => clearTimeout(timer)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Menu action handlers ──────────────────────────────────────────────────

  useMenuAction("file:new-file", useCallback(() => {
    setLeftTab("files")
    setShowLeftSidebar(true)
    window.dispatchEvent(new CustomEvent("astrolaunch:create-file"))
  }, [setLeftTab, setShowLeftSidebar]))

  useMenuAction("file:new-folder", useCallback(() => {
    setLeftTab("files")
    setShowLeftSidebar(true)
    window.dispatchEvent(new CustomEvent("astrolaunch:create-folder"))
  }, [setLeftTab, setShowLeftSidebar]))

  useMenuAction("file:open-project", useCallback(() => {
    setWelcomeOpen(true)
  }, []))

  useMenuAction("file:save", useCallback(() => {
    window.dispatchEvent(new CustomEvent("astrolaunch:editor-save"))
  }, []))

  useMenuAction("file:save-all", useCallback(() => {
    window.dispatchEvent(new CustomEvent("astrolaunch:editor-save-all"))
  }, []))

  useMenuAction("edit:find-in-files", useCallback(() => {
    setLeftTab("search")
    setShowLeftSidebar(true)
  }, [setLeftTab, setShowLeftSidebar]))

  useMenuAction("edit:format", useCallback(() => {
    window.dispatchEvent(new CustomEvent("astrolaunch:editor-format"))
  }, []))

  useMenuAction("edit:find", useCallback(() => {
    window.dispatchEvent(new CustomEvent("astrolaunch:editor-find"))
  }, []))

  useMenuAction("view:command-palette", useCallback(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }))
  }, []))

  useMenuAction("view:toggle-explorer", useCallback(() => {
    setShowLeftSidebar(!showLeftSidebar)
  }, [setShowLeftSidebar, showLeftSidebar]))

  useMenuAction("view:toggle-chat", useCallback(() => {
    setShowRightChat(!showRightChat)
  }, [setShowRightChat, showRightChat]))

  useMenuAction("view:toggle-terminal", useCallback(() => {
    window.dispatchEvent(new CustomEvent("astrolaunch:toggle-terminal"))
  }, []))

  useMenuAction("run:dev-server", useCallback(() => {
    window.dispatchEvent(new CustomEvent("astrolaunch:terminal-run", { detail: { cmd: "npm run dev" } }))
  }, []))

  useMenuAction("run:build", useCallback(() => {
    window.dispatchEvent(new CustomEvent("astrolaunch:terminal-run", { detail: { cmd: "npm run build" } }))
  }, []))

  useMenuAction("run:install", useCallback(() => {
    window.dispatchEvent(new CustomEvent("astrolaunch:terminal-run", { detail: { cmd: "npm install" } }))
  }, []))

  useMenuAction("run:script", useCallback((payload) => {
    window.dispatchEvent(new CustomEvent("astrolaunch:terminal-run", { detail: { cmd: payload as string } }))
  }, []))

  useMenuAction("terminal:new", useCallback(() => {
    window.dispatchEvent(new CustomEvent("astrolaunch:terminal-new"))
  }, []))

  useMenuAction("terminal:clear", useCallback(() => {
    window.dispatchEvent(new CustomEvent("astrolaunch:terminal-clear"))
  }, []))

  useMenuAction("templates:apply", useCallback(async (payload) => {
    const t = TEMPLATES.find((t) => t.id === payload)
    if (!t) return
    if (!confirm(`Apply template "${t.name}"? This will replace all workspace files.`)) return
    try {
      await applyTemplate(t)
      setLeftTab("files")
      toast.success(`${t.emoji} ${t.name} template applied!`)
    } catch (e) {
      toast.error(`Template error: ${String(e)}`)
    }
  }, [setLeftTab]))

  useMenuAction("help:welcome", useCallback(() => {
    setWelcomeOpen(true)
  }, []))

  useMenuAction("help:about", useCallback(() => {
    toast.info("AstroLaunch v0.2 — Next-gen AI IDE. Built with Next.js 15 + Electron 33.")
  }, []))

  useMenuAction("help:shortcuts", useCallback(() => {
    toast.info("⌘K command palette · ⌘B explorer · ⌘J chat · ⌘, settings · ⌘T terminal")
  }, []))

  useMenuAction("help:docs", useCallback(() => {
    window.open("https://webcontainers.io/", "_blank")
  }, []))

  useMenuAction("view:zoom-in", useCallback(() => {
    settings.set("fontSize", Math.min(settings.fontSize + 1, 24))
  }, [settings]))

  useMenuAction("view:zoom-out", useCallback(() => {
    settings.set("fontSize", Math.max(settings.fontSize - 1, 10))
  }, [settings]))

  useMenuAction("view:zoom-reset", useCallback(() => {
    settings.set("fontSize", 14)
  }, [settings]))

  return (
    <TooltipProvider delayDuration={300}>
      <div className="h-screen w-screen flex flex-col overflow-hidden bg-background text-foreground">
        <Topbar
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenWelcome={() => setWelcomeOpen(true)}
        />

        <PanelGroup direction="horizontal" className="flex-1 min-h-0">
          {/* Left: Explorer / Git / Plugins */}
          {showLeftSidebar ? (
            <>
              <Panel defaultSize={16} minSize={12} maxSize={28} id="left">
                <LeftSidebar />
              </Panel>
              <PanelResizeHandle className="w-1 bg-border hover:bg-al-accent transition" />
            </>
          ) : (
            <div className="w-12 border-r border-border flex-shrink-0">
              <LeftSidebar />
            </div>
          )}

          {/* Center: Live Preview / Canvas / Split */}
          <Panel defaultSize={46} minSize={22} id="center">
            <CenterPanel />
          </Panel>
          <PanelResizeHandle className="w-1 bg-border hover:bg-al-accent transition" />

          {/* Right column: Code Editor (top) + Terminal (bottom) */}
          <Panel defaultSize={38} minSize={18} id="editor-col">
            <PanelGroup direction="vertical">
              <Panel defaultSize={58} minSize={25} id="editor">
                <CodeEditor />
              </Panel>
              <PanelResizeHandle className="h-1 bg-border hover:bg-al-accent transition" />
              <Panel defaultSize={42} minSize={18} id="terminal">
                <TerminalPanel />
              </Panel>
            </PanelGroup>
          </Panel>
        </PanelGroup>

        {settings.showStatusBar && <StatusBar />}

        {/* Floating agent chat */}
        <FloatingAgentChat />

        <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        <CommandPalette onOpenSettings={() => setSettingsOpen(true)} />
        <DiffViewer />
        <WelcomeModal open={welcomeOpen} onClose={() => setWelcomeOpen(false)} />
        <Toaster position="bottom-right" theme="dark" richColors closeButton />
      </div>
    </TooltipProvider>
  )
}
