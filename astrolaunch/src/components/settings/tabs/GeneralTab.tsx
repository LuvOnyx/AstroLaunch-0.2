"use client"
import { useSettings } from "@/store/settings"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Row, Section } from "./_shared"

export function GeneralTab() {
  const s = useSettings()
  return (
    <div className="space-y-6 max-w-2xl">
      <Section title="Workspace">
        <Row label="Show status bar" hint="Bottom statusbar with Git/agent info">
          <Switch checked={s.showStatusBar} onCheckedChange={(v) => s.set("showStatusBar", v)} />
        </Row>
        <Row label="Editor minimap" hint="Vertical code overview">
          <Switch checked={s.showMinimap} onCheckedChange={(v) => s.set("showMinimap", v)} />
        </Row>
        <Row label="UI density" hint="Affects component padding via the --al-density variable">
          <Select value={s.uiDensity} onValueChange={(v) => s.set("uiDensity", v as "compact" | "comfortable" | "spacious")}>
            <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="compact">Compact</SelectItem>
              <SelectItem value="comfortable">Comfortable</SelectItem>
              <SelectItem value="spacious">Spacious</SelectItem>
            </SelectContent>
          </Select>
        </Row>
      </Section>
      <Section title="Auto-save">
        <Row label="Auto-save changes" hint="Writes to virtual file system as you type">
          <Switch checked={s.autoSave} onCheckedChange={(v) => s.set("autoSave", v)} />
        </Row>
        <Row label={`Delay (${s.autoSaveDelay}ms)`} hint="Debounce time before persisting">
          <Slider value={[s.autoSaveDelay]} min={200} max={3000} step={100} onValueChange={([v]) => s.set("autoSaveDelay", v)} className="w-48" />
        </Row>
      </Section>
      <Section title="Plugins">
        <Row label="Enable plugin system" hint="Loads installed plugins into sandboxed iframes on demand">
          <Switch checked={s.pluginsEnabled} onCheckedChange={(v) => s.set("pluginsEnabled", v)} />
        </Row>
      </Section>
    </div>
  )
}
