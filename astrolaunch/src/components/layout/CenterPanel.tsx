"use client"
import { useWorkspace } from "@/store/workspace"
import { CodeEditor } from "@/components/editor/CodeEditor"
import { PreviewPanel } from "@/components/preview/PreviewPanel"
import { PenpotCanvas } from "@/components/canvas/PenpotCanvas"
import { PluginRunner } from "@/components/plugins/PluginRunner"
import { BottomPanel } from "@/components/layout/BottomPanel"
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels"

interface Props { running: boolean }

export function CenterPanel({ running }: Props) {
  const { centerMode, activePluginId } = useWorkspace()

  return (
    <div className="h-full flex flex-col">
      <PanelGroup direction="vertical" className="flex-1 min-h-0">
        {/* Top half: editor */}
        <Panel defaultSize={45} minSize={20}>
          <CodeEditor />
        </Panel>
        <PanelResizeHandle className="h-1 bg-border hover:bg-al-accent transition" />
        {/* Bottom half: preview / canvas / split / plugin */}
        <Panel defaultSize={55} minSize={25}>
          {activePluginId ? (
            <PluginRunner />
          ) : (
            <>
              {centerMode === "preview" && <PreviewPanel running={running} />}
              {centerMode === "canvas" && <PenpotCanvas />}
              {centerMode === "split" && (
                <PanelGroup direction="horizontal">
                  <Panel defaultSize={50}><PenpotCanvas /></Panel>
                  <PanelResizeHandle className="w-1 bg-border hover:bg-al-accent transition" />
                  <Panel defaultSize={50}><PreviewPanel running={running} /></Panel>
                </PanelGroup>
              )}
            </>
          )}
        </Panel>
      </PanelGroup>
      <BottomPanel />
    </div>
  )
}
