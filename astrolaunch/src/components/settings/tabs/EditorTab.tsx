"use client"
import { useSettings } from "@/store/settings"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import { Section, Row } from "./_shared"

export function EditorTab() {
  const s = useSettings()
  return (
    <div className="space-y-6 max-w-2xl">
      <Section title="Code editing">
        <Row label="Rainbow brackets" hint="Color-pair matching brackets across nesting levels">
          <Switch checked={s.rainbowBrackets} onCheckedChange={(v) => s.set("rainbowBrackets", v)} />
        </Row>
        <Row label="Word wrap"><Switch checked={s.wordWrap} onCheckedChange={(v) => s.set("wordWrap", v)} /></Row>
        <Row label={`Tab size (${s.tabSize})`}>
          <Slider value={[s.tabSize]} min={2} max={8} step={1} onValueChange={([v]) => s.set("tabSize", v)} className="w-48" />
        </Row>
      </Section>
      <Section title="AI assistance">
        <Row label="Inline AI edit (⌘I)" hint="Select code, press ⌘I, describe a change. AstroLaunch rewrites the selection.">
          <Switch checked={s.aiInlineEdit} onCheckedChange={(v) => s.set("aiInlineEdit", v)} />
        </Row>
      </Section>
    </div>
  )
}
