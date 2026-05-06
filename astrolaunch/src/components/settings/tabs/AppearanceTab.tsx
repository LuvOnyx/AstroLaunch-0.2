"use client"
import { useSettings, type ThemeColors } from "@/store/settings"
import { Slider } from "@/components/ui/slider"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Section, Row } from "./_shared"
import { Input } from "@/components/ui/input"

const FONTS = ["Inter", "SF Pro", "system-ui", "Roboto", "Manrope", "Geist"]
const MONO_FONTS = ["JetBrains Mono", "Fira Code", "IBM Plex Mono", "Geist Mono", "Cascadia Code"]

const PRESETS: { name: string; colors: ThemeColors }[] = [
  { name: "Astro Dark (default)", colors: { topbar: "240 6% 10%", sidebar: "240 6% 8%", panel: "240 6% 12%", canvas: "240 5% 15%", chat: "240 7% 11%", accent: "263 70% 60%" } },
  { name: "Cyberpunk",           colors: { topbar: "300 20% 8%", sidebar: "295 25% 6%", panel: "300 20% 10%", canvas: "290 25% 12%", chat: "300 25% 9%", accent: "320 90% 60%" } },
  { name: "Ocean",               colors: { topbar: "210 30% 10%", sidebar: "210 30% 8%", panel: "210 25% 12%", canvas: "210 20% 14%", chat: "210 30% 11%", accent: "190 80% 55%" } },
  { name: "Forest",              colors: { topbar: "150 15% 9%", sidebar: "150 15% 7%", panel: "150 15% 11%", canvas: "150 10% 13%", chat: "150 18% 10%", accent: "140 65% 50%" } },
  { name: "Solar",               colors: { topbar: "30 25% 10%", sidebar: "30 25% 8%", panel: "30 20% 12%", canvas: "30 15% 14%", chat: "30 25% 11%", accent: "35 95% 55%" } },
]

function HslPicker({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const [h, sat, lit] = value.split(" ")
  return (
    <div className="flex items-center gap-2">
      <div
        className="w-7 h-7 rounded border border-border"
        style={{ background: `hsl(${value})` }}
      />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={`${h} ${sat} ${lit}`} className="w-32 h-7 text-xs font-mono" />
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  )
}

export function AppearanceTab() {
  const s = useSettings()
  return (
    <div className="space-y-6 max-w-2xl">
      <Section title="Theme mode">
        <Row label="Mode">
          <Select value={s.themeMode} onValueChange={(v) => s.set("themeMode", v as "dark" | "light" | "system")}>
            <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="dark">Dark</SelectItem>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="system">System</SelectItem>
            </SelectContent>
          </Select>
        </Row>
      </Section>

      <Section title="Color presets">
        <div className="grid grid-cols-2 gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              onClick={() => Object.entries(p.colors).forEach(([k, v]) => s.setColor(k as keyof ThemeColors, v))}
              className="border border-border rounded-md p-2 text-left hover:border-al-accent transition"
            >
              <div className="flex gap-1 mb-1">
                {Object.values(p.colors).map((c, i) => (
                  <div key={i} className="w-5 h-5 rounded" style={{ background: `hsl(${c})` }} />
                ))}
              </div>
              <div className="text-xs">{p.name}</div>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Custom surfaces">
        <Row label="Topbar"><HslPicker value={s.colors.topbar} onChange={(v) => s.setColor("topbar", v)} label="HSL" /></Row>
        <Row label="Sidebar"><HslPicker value={s.colors.sidebar} onChange={(v) => s.setColor("sidebar", v)} label="HSL" /></Row>
        <Row label="Panels"><HslPicker value={s.colors.panel} onChange={(v) => s.setColor("panel", v)} label="HSL" /></Row>
        <Row label="Canvas"><HslPicker value={s.colors.canvas} onChange={(v) => s.setColor("canvas", v)} label="HSL" /></Row>
        <Row label="Chat window"><HslPicker value={s.colors.chat} onChange={(v) => s.setColor("chat", v)} label="HSL" /></Row>
        <Row label="Accent"><HslPicker value={s.colors.accent} onChange={(v) => s.setColor("accent", v)} label="HSL" /></Row>
      </Section>

      <Section title="Typography">
        <Row label="UI font">
          <Select value={s.fontFamily} onValueChange={(v) => s.set("fontFamily", v)}>
            <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{FONTS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
          </Select>
        </Row>
        <Row label="Editor mono font">
          <Select value={s.monoFontFamily} onValueChange={(v) => s.set("monoFontFamily", v)}>
            <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{MONO_FONTS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
          </Select>
        </Row>
        <Row label={`Font size (${s.fontSize}px)`}>
          <Slider value={[s.fontSize]} min={11} max={20} step={1} onValueChange={([v]) => s.set("fontSize", v)} className="w-48" />
        </Row>
        <Row label={`Border radius (${s.borderRadius}rem)`}>
          <Slider value={[s.borderRadius]} min={0} max={1.4} step={0.05} onValueChange={([v]) => s.set("borderRadius", v)} className="w-48" />
        </Row>
      </Section>
    </div>
  )
}
