"use client"
import { create } from "zustand"
import { persist } from "zustand/middleware"

export type LeftPanelTab = "files" | "git" | "search" | "agents" | "plugins"
export type CenterMode = "preview" | "canvas" | "split"
export type BottomPanelTab = "terminal" | "problems" | "output" | "agent-log"

interface WorkspaceState {
  activeFileId: string | null
  openFileIds: string[]
  leftTab: LeftPanelTab
  centerMode: CenterMode
  showLeftSidebar: boolean
  showRightChat: boolean
  showBottomPanel: boolean
  bottomTab: BottomPanelTab
  bottomHeight: number
  agentChatPosition: { x: number; y: number }
  agentChatSize: { w: number; h: number }
  agentChatMinimized: boolean
  activeChatId: string | null
  draggedFileId: string | null
  dropTargetId: string | null
  dropPosition: "before" | "inside" | "after" | null
  // Diff viewer
  diffViewerOpen: boolean
  diffViewerPath: string | null
  // Plugin runtime
  activePluginId: string | null

  setActiveFile: (id: string | null) => void
  openFile: (id: string) => void
  closeFile: (id: string) => void
  setLeftTab: (t: LeftPanelTab) => void
  setCenterMode: (m: CenterMode) => void
  setShowLeftSidebar: (b: boolean) => void
  setShowRightChat: (b: boolean) => void
  setShowBottomPanel: (b: boolean) => void
  setBottomTab: (t: BottomPanelTab) => void
  setBottomHeight: (h: number) => void
  setAgentChatPosition: (p: { x: number; y: number }) => void
  setAgentChatSize: (s: { w: number; h: number }) => void
  setAgentChatMinimized: (b: boolean) => void
  setActiveChatId: (id: string | null) => void
  setDragged: (id: string | null) => void
  setDropTarget: (id: string | null, position?: "before" | "inside" | "after" | null) => void
  setDiffViewer: (open: boolean, path?: string | null) => void
  setActivePluginId: (id: string | null) => void
}

export const useWorkspace = create<WorkspaceState>()(
  persist(
    (set) => ({
      activeFileId: null,
      openFileIds: [],
      leftTab: "files",
      centerMode: "preview",
      showLeftSidebar: true,
      showRightChat: true,
      showBottomPanel: false,
      bottomTab: "terminal",
      bottomHeight: 240,
      agentChatPosition: { x: 24, y: 80 },
      agentChatSize: { w: 420, h: 600 },
      agentChatMinimized: false,
      activeChatId: null,
      draggedFileId: null,
      dropTargetId: null,
      dropPosition: null,
      diffViewerOpen: false,
      diffViewerPath: null,
      activePluginId: null,

      setActiveFile: (id) => set({ activeFileId: id }),
      openFile: (id) => set((s) => ({
        activeFileId: id,
        openFileIds: s.openFileIds.includes(id) ? s.openFileIds : [...s.openFileIds, id],
      })),
      closeFile: (id) => set((s) => {
        const remaining = s.openFileIds.filter((x) => x !== id)
        return {
          openFileIds: remaining,
          activeFileId: s.activeFileId === id ? remaining[remaining.length - 1] ?? null : s.activeFileId,
        }
      }),
      setLeftTab: (leftTab) => set({ leftTab }),
      setCenterMode: (centerMode) => set({ centerMode }),
      setShowLeftSidebar: (showLeftSidebar) => set({ showLeftSidebar }),
      setShowRightChat: (showRightChat) => set({ showRightChat }),
      setShowBottomPanel: (showBottomPanel) => set({ showBottomPanel }),
      setBottomTab: (bottomTab) => set({ bottomTab, showBottomPanel: true }),
      setBottomHeight: (bottomHeight) => set({ bottomHeight }),
      setAgentChatPosition: (agentChatPosition) => set({ agentChatPosition }),
      setAgentChatSize: (agentChatSize) => set({ agentChatSize }),
      setAgentChatMinimized: (agentChatMinimized) => set({ agentChatMinimized }),
      setActiveChatId: (activeChatId) => set({ activeChatId }),
      setDragged: (draggedFileId) => set({ draggedFileId }),
      setDropTarget: (dropTargetId, dropPosition = null) => set({ dropTargetId, dropPosition }),
      setDiffViewer: (diffViewerOpen, diffViewerPath = null) => set({ diffViewerOpen, diffViewerPath }),
      setActivePluginId: (activePluginId) => set({ activePluginId }),
    }),
    {
      name: "astrolaunch.workspace.v2",
      partialize: (s) => ({
        leftTab: s.leftTab,
        centerMode: s.centerMode,
        showLeftSidebar: s.showLeftSidebar,
        showRightChat: s.showRightChat,
        showBottomPanel: s.showBottomPanel,
        bottomTab: s.bottomTab,
        bottomHeight: s.bottomHeight,
        agentChatPosition: s.agentChatPosition,
        agentChatSize: s.agentChatSize,
        agentChatMinimized: s.agentChatMinimized,
      }),
    }
  )
)
