"use client"
import { useEffect, useState } from "react"
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
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "sonner"
import { useSettings, applySettingsToDOM } from "@/store/settings"
import { useWorkspace } from "@/store/workspace"

export default function Page() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settings = useSettings()
  const { showLeftSidebar } = useWorkspace()

  useEffect(() => { applySettingsToDOM(useSettings.getState()) }, [])
  useEffect(() => { applySettingsToDOM(settings) }, [settings])

  return (
    <TooltipProvider delayDuration={300}>
      <div className="h-screen w-screen flex flex-col overflow-hidden bg-background text-foreground">
        <Topbar onOpenSettings={() => setSettingsOpen(true)} />

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

        {/* Floating agent chat — stays floating, draggable, resizable */}
        <FloatingAgentChat />

        <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        <CommandPalette onOpenSettings={() => setSettingsOpen(true)} />
        <DiffViewer />
        <Toaster position="bottom-right" theme="dark" richColors closeButton />
      </div>
    </TooltipProvider>
  )
}
