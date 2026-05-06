"use client"
import { useEffect, useState } from "react"
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels"
import { Topbar } from "@/components/topbar/Topbar"
import { LeftSidebar } from "@/components/layout/LeftSidebar"
import { CenterPanel } from "@/components/layout/CenterPanel"
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
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const settings = useSettings()
  const { showLeftSidebar } = useWorkspace()

  useEffect(() => { applySettingsToDOM(useSettings.getState()) }, [])
  useEffect(() => { applySettingsToDOM(settings) }, [settings])

  return (
    <TooltipProvider delayDuration={300}>
      <div className="h-screen w-screen flex flex-col overflow-hidden bg-background text-foreground">
        <Topbar
          onOpenSettings={() => setSettingsOpen(true)}
          onRunPreview={() => setRunning((r) => !r)}
          isRunning={running}
          onOpenCommandPalette={() => setPaletteOpen(true)}
        />
        <PanelGroup direction="horizontal" className="flex-1 min-h-0">
          {showLeftSidebar ? (
            <>
              <Panel defaultSize={20} minSize={14} maxSize={36} id="left">
                <LeftSidebar />
              </Panel>
              <PanelResizeHandle className="w-1 bg-border hover:bg-al-accent transition" />
            </>
          ) : (
            // When sidebar is hidden, still render the activity rail (12px wide)
            <div className="w-12 border-r border-border"><LeftSidebar /></div>
          )}
          <Panel defaultSize={80} minSize={40} id="center">
            <CenterPanel running={running} />
          </Panel>
        </PanelGroup>
        {settings.showStatusBar && <StatusBar />}
        <FloatingAgentChat />
        <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        <CommandPalette onOpenSettings={() => setSettingsOpen(true)} />
        <DiffViewer />
        <Toaster position="bottom-right" theme="dark" richColors closeButton />
      </div>
    </TooltipProvider>
  )
}
