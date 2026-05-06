"use client"
import { useWorkspace } from "@/store/workspace"
import { PreviewPanel } from "@/components/preview/PreviewPanel"
import { PenpotCanvas } from "@/components/canvas/PenpotCanvas"
import { PluginRunner } from "@/components/plugins/PluginRunner"
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels"

export function CenterPanel() {
  const { centerMode, activePluginId } = useWorkspace()

  return (
    <div className="h-full flex flex-col">
      {activePluginId ? (
        <PluginRunner />
      ) : (
        <>
          {centerMode === "preview" && <PreviewPanel />}
          {centerMode === "canvas" && <PenpotCanvas />}
          {centerMode === "split" && (
            <PanelGroup direction="horizontal">
              <Panel defaultSize={50}><PenpotCanvas /></Panel>
              <PanelResizeHandle className="w-1 bg-border hover:bg-al-accent transition" />
              <Panel defaultSize={50}><PreviewPanel /></Panel>
            </PanelGroup>
          )}
        </>
      )}
    </div>
  )
}
