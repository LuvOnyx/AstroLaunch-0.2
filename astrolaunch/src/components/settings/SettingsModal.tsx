"use client"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { useSettings, applySettingsToDOM } from "@/store/settings"
import { useEffect, useState } from "react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { GeneralTab } from "./tabs/GeneralTab"
import { AppearanceTab } from "./tabs/AppearanceTab"
import { AgentsTab } from "./tabs/AgentsTab"
import { EditorTab } from "./tabs/EditorTab"
import { KeymapTab } from "./tabs/KeymapTab"
import { AboutTab } from "./tabs/AboutTab"
import { motion } from "framer-motion"
import { AppIcon } from "@/lib/iconify"

interface Props { open: boolean; onClose: () => void }

const TABS = [
  { id: "general", label: "General", icon: "settings" },
  { id: "appearance", label: "Appearance", icon: "canvas" },
  { id: "agents", label: "Agents", icon: "agent" },
  { id: "editor", label: "Editor", icon: "file" },
  { id: "keymap", label: "Keymap", icon: "drag" },
  { id: "about", label: "About", icon: "info" },
] as const

export function SettingsModal({ open, onClose }: Props) {
  const settings = useSettings()
  const [tab, setTab] = useState<typeof TABS[number]["id"]>("general")

  useEffect(() => { if (typeof window !== "undefined") applySettingsToDOM(settings) }, [settings])

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl p-0 max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AppIcon name="settings" width={18} className="text-al-accent" />
            AstroLaunch Settings
          </DialogTitle>
          <DialogDescription>Tune every surface — themes, agents, editor, plugins — to your taste.</DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="flex flex-1 min-h-0">
          <div className="w-48 border-r border-border bg-al-panel/40 p-2">
            <TabsList className="flex-col h-auto bg-transparent p-0 gap-1 w-full">
              {TABS.map((t) => (
                <TabsTrigger
                  key={t.id}
                  value={t.id}
                  className="w-full justify-start gap-2 data-[state=active]:bg-al-accent/20 data-[state=active]:text-foreground"
                >
                  <AppIcon name={t.icon} width={14} />
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <div className="flex-1 overflow-auto">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15 }}
              className="p-6"
            >
              <TabsContent value="general" forceMount={tab === "general" ? true : undefined} hidden={tab !== "general"}><GeneralTab /></TabsContent>
              <TabsContent value="appearance" forceMount={tab === "appearance" ? true : undefined} hidden={tab !== "appearance"}><AppearanceTab /></TabsContent>
              <TabsContent value="agents" forceMount={tab === "agents" ? true : undefined} hidden={tab !== "agents"}><AgentsTab /></TabsContent>
              <TabsContent value="editor" forceMount={tab === "editor" ? true : undefined} hidden={tab !== "editor"}><EditorTab /></TabsContent>
              <TabsContent value="keymap" forceMount={tab === "keymap" ? true : undefined} hidden={tab !== "keymap"}><KeymapTab /></TabsContent>
              <TabsContent value="about" forceMount={tab === "about" ? true : undefined} hidden={tab !== "about"}><AboutTab /></TabsContent>
            </motion.div>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
