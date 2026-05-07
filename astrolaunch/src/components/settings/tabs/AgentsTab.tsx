"use client"
import { useSettings } from "@/store/settings"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Section, Row } from "./_shared"
import { Badge } from "@/components/ui/badge"
import { AppIcon } from "@/lib/iconify"
import { DEFAULT_PERSONAS } from "@/lib/agents/personas"
import { Button } from "@/components/ui/button"
import { useEffect, useState } from "react"
import { db } from "@/lib/storage/db"
import { MODEL_OPTIONS } from "@/lib/agents/pricing"

const PROVIDERS: { id: "gemini" | "openai" | "anthropic" | "openrouter"; label: string; icon: string; placeholder: string; hint?: string }[] = [
  { id: "gemini",    label: "Google Gemini",  icon: "gemini",    placeholder: "AIza…",    hint: "Gemini 2.5 Pro/Flash + free image gen" },
  { id: "anthropic", label: "Anthropic",      icon: "anthropic", placeholder: "sk-ant-…", hint: "Claude Opus / Sonnet / Haiku" },
  { id: "openai",    label: "OpenAI",         icon: "openai",    placeholder: "sk-…" },
  { id: "openrouter",label: "OpenRouter",     icon: "openrouter",placeholder: "sk-or-…" },
]

const ALL_MODELS = [
  { group: "Google Gemini", items: MODEL_OPTIONS.gemini },
  { group: "Anthropic Claude", items: MODEL_OPTIONS.anthropic },
  { group: "Ollama (Local)", items: MODEL_OPTIONS.ollama },
]

export function AgentsTab() {
  const s = useSettings()
  const [usageStats, setUsageStats] = useState<{ totalCost: number; totalTokens: number; runs: number }>({ totalCost: 0, totalTokens: 0, runs: 0 })

  useEffect(() => {
    (async () => {
      if (!db) return
      const rows = await db.usage.toArray()
      setUsageStats({
        totalCost: rows.reduce((acc, r) => acc + r.costUsd, 0),
        totalTokens: rows.reduce((acc, r) => acc + r.input + r.output, 0),
        runs: rows.length,
      })
    })()
  }, [])

  const clearUsage = async () => {
    if (!confirm("Clear all usage history?")) return
    await db.usage.clear()
    setUsageStats({ totalCost: 0, totalTokens: 0, runs: 0 })
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Section title="API keys (BYOK — stored locally, never sent to our servers)">
        {PROVIDERS.map((p) => (
          <Row key={p.id} label={p.label} hint={p.hint ?? ""}>
            <div className="flex items-center gap-2">
              <AppIcon name={p.icon} width={14} />
              <Input
                type="password"
                value={s.apiKeys[p.id] ?? ""}
                onChange={(e) => s.setApiKey(p.id, e.target.value)}
                placeholder={p.placeholder}
                className="w-64 h-8 text-xs font-mono"
              />
              {s.apiKeys[p.id] && <Badge variant="success">set</Badge>}
            </div>
          </Row>
        ))}

        {/* Ollama endpoint */}
        <Row label="Ollama endpoint" hint="Local Ollama server URL (no API key needed)">
          <Input
            value={s.ollamaEndpoint}
            onChange={(e) => s.set("ollamaEndpoint", e.target.value)}
            placeholder="http://localhost:11434"
            className="w-64 h-8 text-xs font-mono"
          />
        </Row>
      </Section>

      <Section title="Default model">
        <Row label="Model" hint="Used for all agent chats and planning runs">
          <Select value={s.defaultModel} onValueChange={(v) => s.set("defaultModel", v)}>
            <SelectTrigger className="w-56 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-72">
              {ALL_MODELS.map((group) => (
                <div key={group.group}>
                  <div className="px-2 py-1 text-[10px] uppercase text-muted-foreground font-medium">{group.group}</div>
                  {group.items.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </div>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row label="Show agent reasoning" hint="Display thinking/reasoning tokens in a collapsible block">
          <Switch checked={s.showThinking} onCheckedChange={(v) => s.set("showThinking", v)} />
        </Row>
      </Section>

      <Section title="Agent loop">
        <Row label="Enable planner" hint="Architect plans before Builder runs">
          <Switch checked={s.enablePlanner} onCheckedChange={(v) => s.set("enablePlanner", v)} />
        </Row>
        <Row label="Stream agent tokens" hint="Show assistant tokens as they arrive">
          <Switch checked={s.streamAgent} onCheckedChange={(v) => s.set("streamAgent", v)} />
        </Row>
        <Row label="Show inline tool diffs" hint="Render unified diffs inside the chat for write_file / delete_file">
          <Switch checked={s.showToolDiffs} onCheckedChange={(v) => s.set("showToolDiffs", v)} />
        </Row>
        <Row label={`Max iterations per task: ${s.maxIterations}`} hint="Prevents runaway loops; is_done flags also enforce this">
          <Slider value={[s.maxIterations]} min={3} max={30} step={1} onValueChange={([v]) => s.set("maxIterations", v)} className="w-48" />
        </Row>
        <Row label={`Inter-iteration delay: ${s.iterationDelayMs}ms`} hint="Pause between iterations — helps avoid rate limits">
          <Slider value={[s.iterationDelayMs]} min={0} max={5000} step={100} onValueChange={([v]) => s.set("iterationDelayMs", v)} className="w-48" />
        </Row>
        <Row label="System prompt" hint="Prepended to every agent run">
          <Textarea value={s.systemPrompt} onChange={(e) => s.set("systemPrompt", e.target.value)} rows={4} className="w-full text-xs" />
        </Row>
      </Section>

      <Section title="Retry policy">
        <Row label={`Max retries per tool call: ${s.retry.maxRetries}`} hint="On tool error or timeout">
          <Slider value={[s.retry.maxRetries]} min={0} max={5} step={1} onValueChange={([v]) => s.setRetry({ maxRetries: v })} className="w-48" />
        </Row>
        <Row label={`Backoff base: ${s.retry.backoffMs}ms`} hint="Exponential — base * 2^attempt">
          <Slider value={[s.retry.backoffMs]} min={100} max={4000} step={100} onValueChange={([v]) => s.setRetry({ backoffMs: v })} className="w-48" />
        </Row>
        <Row label={`Tool call timeout: ${(s.retry.timeoutMs / 1000).toFixed(0)}s`} hint="Hard cap per call">
          <Slider value={[s.retry.timeoutMs]} min={5000} max={180_000} step={5000} onValueChange={([v]) => s.setRetry({ timeoutMs: v })} className="w-48" />
        </Row>
      </Section>

      <Section title="Cost guardrails">
        <Row label={`Cost cap per run (USD): $${s.costCapUsd.toFixed(2)}`} hint="Pauses planning run when accumulated cost reaches this. 0 = no limit.">
          <Slider value={[s.costCapUsd]} min={0} max={10} step={0.25} onValueChange={([v]) => s.set("costCapUsd", v)} className="w-48" />
        </Row>
        <Row label="Lifetime usage" hint="Across all chats">
          <div className="text-xs flex items-center gap-3">
            <span>${usageStats.totalCost.toFixed(4)}</span>
            <span className="text-muted-foreground">{usageStats.totalTokens.toLocaleString()} tokens</span>
            <span className="text-muted-foreground">{usageStats.runs} calls</span>
            <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={clearUsage}>Clear</Button>
          </div>
        </Row>
      </Section>

      <Section title="Agent personas">
        <div className="grid grid-cols-2 gap-2">
          {DEFAULT_PERSONAS.map((p) => (
            <div key={p.id} className="rounded-md border border-border p-3" style={{ borderLeftColor: p.color, borderLeftWidth: 3 }}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-base">{p.emoji}</span>
                <span className="text-sm font-medium">{p.name}</span>
                <Badge variant="outline" className="ml-auto text-[9px]">{p.defaultModel}</Badge>
              </div>
              <div className="text-[11px] text-muted-foreground">{p.description}</div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}
