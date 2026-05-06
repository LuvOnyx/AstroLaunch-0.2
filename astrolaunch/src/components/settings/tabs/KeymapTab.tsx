"use client"
import { Section } from "./_shared"

const KEYS: { combo: string; action: string }[] = [
  { combo: "⌘K", action: "Command palette" },
  { combo: "⌘P", action: "Quick file open" },
  { combo: "⌘B", action: "Toggle left sidebar" },
  { combo: "⌘J", action: "Toggle floating agent chat" },
  { combo: "⌘`", action: "Toggle integrated terminal" },
  { combo: "⌘I", action: "AI inline edit (in editor)" },
  { combo: "⌘,", action: "Open settings" },
  { combo: "⌘S", action: "Save current file" },
  { combo: "⌘⇧E", action: "Explorer panel" },
  { combo: "⌘⇧F", action: "Search panel" },
  { combo: "⌘⇧G", action: "Source control panel" },
  { combo: "⌘⇧A", action: "Agents panel" },
  { combo: "⌘⇧X", action: "Plugins panel" },
  { combo: "/build <goal>", action: "Spawn the multi-agent loop" },
]

export function KeymapTab() {
  return (
    <div className="space-y-6 max-w-2xl">
      <Section title="Default keybindings">
        <div className="rounded-md border border-border divide-y divide-border">
          {KEYS.map((k) => (
            <div key={k.combo} className="flex items-center justify-between px-3 py-2 text-sm">
              <span className="text-muted-foreground">{k.action}</span>
              <kbd className="bg-al-panel border border-border px-2 py-0.5 text-xs rounded font-mono">{k.combo}</kbd>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}
