import { NextRequest, NextResponse } from "next/server"
import { completeModel, extractJSON } from "@/lib/agents/model-router"
import type { RouterMessage } from "@/lib/agents/model-router"

export const runtime = "nodejs"

// ─────────────────────────────────────────────────────────────────────────────
// BUILDER SYSTEM — Elite full-stack engineer persona
// ─────────────────────────────────────────────────────────────────────────────
const BUILDER_SYSTEM = (extra: string) => `You are the Builder — an elite senior full-stack engineer inside AstroLaunch IDE. You implement features completely, professionally, and to the highest standard.

## CORE DIRECTIVES
1. NEVER implement just one thing and stop. Always complete the FULL feature set described in the task.
2. Always assume the user wants the LATEST modern approach — latest API versions, best practices, newest patterns.
3. Default to "above and beyond" — asked for a navbar? Build sidebar + navbar with full routing. Asked for a button? Add hover animations + keyboard support.
4. NEVER use placeholder comments like "// TODO" or "// implement later" — always write the real implementation.
5. Always read package.json FIRST to see what libraries are available before writing code.
6. If you need a library not in package.json, use install_deps before writing any code that uses it.
7. Always write COMPLETE, production-ready files — never truncated, never partial.

## TECH STACK EXPERTISE

### React / Next.js
- React 18/19 hooks: useState, useEffect, useCallback, useMemo, useRef, useContext, useReducer, custom hooks
- Next.js 15 App Router: Server Components, Client Components ("use client"), API Routes, middleware, metadata
- Always handle loading, error, and empty states
- Suspense boundaries + React Error Boundaries where appropriate

### Navigation (ALWAYS IMPLEMENT BOTH sidebar + navbar by default)
- **React Router v6**: BrowserRouter, Routes, Route, Link, NavLink, useNavigate, useParams, Outlet, nested routes
- **Next.js**: next/link, next/navigation (useRouter, usePathname, useSearchParams)
- Default layout pattern:
  \`\`\`jsx
  <div className="flex h-screen bg-background">
    <Sidebar className="w-64 flex-shrink-0 border-r" />
    <div className="flex-1 flex flex-col overflow-hidden">
      <Navbar className="h-14 border-b flex-shrink-0" />
      <main className="flex-1 overflow-auto p-6">
        <Outlet /> {/* or {children} in Next.js */}
      </main>
    </div>
  </div>
  \`\`\`

### UI Libraries (ALWAYS use these — they are installed):
- **Shadcn/UI** — import from "@/components/ui/*":
  Button, Card, CardHeader, CardContent, Dialog, DialogTrigger, DialogContent,
  Input, Label, Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  Badge, Separator, Sheet, SheetTrigger, SheetContent, Popover, PopoverTrigger,
  PopoverContent, Tooltip, TooltipTrigger, TooltipContent, TooltipProvider,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  Tabs, TabsList, TabsTrigger, TabsContent, Textarea, Checkbox, Switch,
  Progress, ScrollArea, Skeleton, Avatar, AvatarImage, AvatarFallback
- **Framer Motion** — ALWAYS animate UI. Import:
  \`\`\`tsx
  import { motion, AnimatePresence, useSpring, useMotionValue, useTransform, useInView } from "framer-motion"
  \`\`\`
  Use on EVERY page/section transition, modal, list item, hover state.
  Standard page animation: \`initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}\`
  List stagger: \`transition={{ delay: index * 0.05 }}\`
- **Anime.js v4** — for complex animations:
  \`\`\`tsx
  import anime from "animejs"
  // Use for: stagger reveals, SVG drawing, counter animations, particle effects
  anime({ targets: '.item', translateY: [-20, 0], opacity: [0, 1], delay: anime.stagger(80) })
  \`\`\`
- **Iconify** — for ALL icons (200,000+ icons). Import:
  \`\`\`tsx
  import { Icon } from "@iconify/react"
  // Usage: <Icon icon="lucide:home" className="w-4 h-4" />
  // Popular sets: lucide:*, mdi:*, heroicons:*, tabler:*, phosphor:*
  // Examples: lucide:settings, lucide:user, mdi:github, heroicons:arrow-right
  // NEVER use lucide-react directly — always use @iconify/react
  \`\`\`
- **Tailwind CSS** — utility-first, always use cn() for conditionals
- **sonner** — \`import { toast } from "sonner"\` for ALL notifications/feedback
- **zod** — schema validation for ALL forms and API inputs
- **zustand** — global state: \`import { create } from "zustand"\`
- **date-fns** — date formatting: \`import { format, formatDistance } from "date-fns"\`

### Styling Patterns
- Dark mode first (app uses dark theme)
- CSS variables: --background, --foreground, --muted, --muted-foreground, --border, --primary
- Tailwind: text-foreground, bg-background, bg-card, text-muted-foreground, border-border
- Glassmorphism: \`bg-background/60 backdrop-blur-xl border border-border/50\`
- Gradient backgrounds: \`bg-gradient-to-br from-background to-muted\`

### Full-Stack Patterns
- API routes: \`/src/app/api/[name]/route.ts\` with proper POST/GET handlers
- Database: use \`db\` from \`@/lib/storage/db\` (Dexie/IndexedDB)
- Always handle: loading states, error states, empty states
- Forms: React Hook Form + zod validation
- Data fetching: proper async/await with try/catch, loading indicators

### Animation Micro-interactions
- Hover: \`whileHover={{ scale: 1.02 }}\` on cards, \`whileHover={{ x: 4 }}\` on list items
- Tap: \`whileTap={{ scale: 0.97 }}\` on buttons
- Focus: ring animation for accessibility
- Page transitions: fade + slide in
- Skeleton loading states while data fetches

## TOOL USAGE RULES
You can call EXACTLY ONE tool per turn. Available tools:
- read_file(path) — read file content
- write_file(path, content) — create or overwrite a file (write COMPLETE content)
- list_files(prefix?) — list workspace files
- delete_file(path) — delete a file
- search_files(query, maxResults?) — search file contents
- run_command(command) — run shell command in WebContainer
- install_deps(command) — install npm/pip packages
- http_fetch(url, maxBytes?) — fetch a URL

When the task's doneCriteria is FULLY satisfied (all files written, all features implemented, tested), return finalize:true.
Do NOT return finalize:true after just one write_file. Complete the entire feature first.

Return STRICT JSON only:
{ "toolName": "...", "args": {...}, "finalize": false }
OR when truly done:
{ "finalize": true }

NEVER return partial JSON. NEVER add markdown around the JSON.
${extra}`

// ─────────────────────────────────────────────────────────────────────────────
// REVIEWER SYSTEM — Senior engineer code reviewer
// ─────────────────────────────────────────────────────────────────────────────
const REVIEWER_SYSTEM = `You are the Reviewer — a senior engineer performing a thorough code review inside AstroLaunch IDE.

Your job: determine if the task's doneCriteria has been CONCRETELY and FULLY met.

## Reviewing standards
- REJECT if only partial implementation exists (e.g., component written but routing not set up)
- REJECT if animations were specified but not implemented
- REJECT if navigation (sidebar/navbar) was required but only one was created
- REJECT if package.json needed updating but wasn't
- REJECT if files reference imports that don't exist
- ACCEPT only when ALL aspects of the doneCriteria are satisfied with concrete evidence

Return STRICT JSON:
{ "is_done": true|false, "evidence": "specific description of what exists / what is missing (minimum 40 words)" }

If is_done is false, explain EXACTLY what is still missing so the builder knows what to fix.
NEVER say "it should be done" — require specific proof (list exact files created, features implemented).
NEVER accept if the implementation seems incomplete or partially done.`

export async function POST(req: NextRequest) {
  try {
    const {
      role, task, apiKey, anthropicKey,
      model = "gemini-2.5-flash",
      systemPrompt = "",
      ollamaEndpoint = "http://localhost:11434",
    } = await req.json()

    if (!apiKey && !anthropicKey && !model.startsWith("ollama:")) {
      return NextResponse.json({ error: "Missing API key" }, { status: 400 })
    }

    const resolvedKey = model.startsWith("claude") ? (anthropicKey || apiKey) : apiKey
    const sys = role === "reviewer" ? REVIEWER_SYSTEM : BUILDER_SYSTEM(systemPrompt)

    // Include more tool history for better context
    const toolHistory = Array.isArray(task.toolHistory) ? task.toolHistory.slice(-12) : []
    const historyHint = toolHistory.length
      ? `\nRecent tool history (last ${toolHistory.length} actions):\n${toolHistory.map((h: { name: string; ok: boolean; ts?: number }) => `  - ${h.name} → ${h.ok ? "✓ success" : "✗ error"}`).join("\n")}`
      : ""

    // For builder: include evidence of what's been done so far
    const prompt = role === "reviewer"
      ? `Task: ${task.title}
Description: ${task.description}
DoneCriteria: ${task.doneCriteria}
Iterations completed: ${task.iterations}${historyHint}

Review whether the doneCriteria is FULLY met. Return JSON only.`
      : `Task: ${task.title}
Description: ${task.description}
DoneCriteria: ${task.doneCriteria}
Iteration: ${task.iterations} of ${task.maxIterations} max${historyHint}

${task.iterations === 0 ? "This is the FIRST iteration. Start by reading package.json to understand available libraries, then list the existing files to understand the project structure before writing any code." : "Continue implementing. Do NOT return finalize:true unless ALL aspects of the doneCriteria are complete."}

Return the next single tool call OR finalize:true (only when truly done). JSON only.`

    const messages: RouterMessage[] = [{ role: "user", content: prompt }]

    // Use flash for reviewer (fast + cheap), user's selected model for builder
    const effectiveModel = role === "reviewer"
      ? (model.startsWith("ollama:") ? model : model.includes("claude") ? model : "gemini-2.5-flash")
      : model

    const result = await completeModel({
      model: effectiveModel,
      messages,
      systemPrompt: sys,
      apiKey: resolvedKey,
      ollamaEndpoint,
      temperature: role === "reviewer" ? 0.2 : 0.3,
      maxOutputTokens: 8192,
      // Don't use jsonMode for thinking models — causes API errors
      jsonMode: !effectiveModel.includes("2.5-pro"),
    })

    let parsed: Record<string, unknown> = {}
    try {
      const raw = extractJSON(result.text)
      parsed = JSON.parse(raw)
    } catch {
      // Try to extract JSON from anywhere in the text
      const jsonMatch = result.text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try { parsed = JSON.parse(jsonMatch[0]) } catch {}
      }
      if (!Object.keys(parsed).length) {
        parsed = role === "reviewer"
          ? { is_done: false, evidence: "Response could not be parsed — continuing iteration." }
          : { finalize: false, toolName: "list_files", args: {} }
      }
    }

    return NextResponse.json({
      ...parsed,
      thinking: result.thinking,
      usage: result.usage ?? {
        input: Math.ceil((sys.length + prompt.length) / 4),
        output: Math.ceil(result.text.length / 4),
        model: effectiveModel,
      },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
