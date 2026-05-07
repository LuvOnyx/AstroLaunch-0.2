/**
 * AstroLaunch built-in project templates.
 * Each template defines a set of files to scaffold.
 */
import { db } from "@/lib/storage/db"
import { nanoid } from "nanoid"

export interface TemplateFile {
  path: string // e.g. "/src/App.tsx"
  content: string
  type: "file" | "folder"
}

export interface Template {
  id: string
  name: string
  description: string
  emoji: string
  category: "frontend" | "fullstack" | "gamedev" | "backend"
  files: TemplateFile[]
}

// ─── React + Vite ────────────────────────────────────────────────────────────

const REACT_VITE: Template = {
  id: "react-vite",
  name: "React + Vite",
  description: "React 18 + TypeScript + Vite + Tailwind CSS starter",
  emoji: "⚛️",
  category: "frontend",
  files: [
    { path: "/package.json", type: "file", content: JSON.stringify({
      name: "my-app",
      version: "0.0.1",
      private: true,
      type: "module",
      scripts: { dev: "vite", build: "tsc && vite build", preview: "vite preview", lint: "eslint ." },
      dependencies: {
        react: "^18.3.1",
        "react-dom": "^18.3.1",
        "react-router-dom": "^6.22.3",
        "class-variance-authority": "^0.7.0",
        clsx: "^2.1.0",
        "lucide-react": "^0.344.0",
      },
      devDependencies: {
        "@types/react": "^18.3.1",
        "@types/react-dom": "^18.3.1",
        "@vitejs/plugin-react": "^4.2.1",
        autoprefixer: "^10.4.17",
        postcss: "^8.4.35",
        tailwindcss: "^3.4.1",
        typescript: "^5.3.3",
        vite: "^5.1.4",
      },
    }, null, 2) },
    { path: "/vite.config.ts", type: "file", content: `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 3000, host: true },
})
` },
    { path: "/tsconfig.json", type: "file", content: JSON.stringify({
      compilerOptions: {
        target: "ES2020", useDefineForClassFields: true,
        lib: ["ES2020", "DOM", "DOM.Iterable"],
        module: "ESNext", skipLibCheck: true,
        moduleResolution: "bundler", allowImportingTsExtensions: true,
        resolveJsonModule: true, isolatedModules: true, noEmit: true, jsx: "react-jsx",
        strict: true, noUnusedLocals: true, noUnusedParameters: true, noFallthroughCasesInSwitch: true,
      }, include: ["src"],
    }, null, 2) },
    { path: "/tailwind.config.js", type: "file", content: `/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
}
` },
    { path: "/index.html", type: "file", content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>My App</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
` },
    { path: "/src", type: "folder", content: "" },
    { path: "/src/main.tsx", type: "file", content: `import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
` },
    { path: "/src/App.tsx", type: "file", content: `import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
    </Routes>
  )
}
` },
    { path: "/src/pages", type: "folder", content: "" },
    { path: "/src/pages/Home.tsx", type: "file", content: `export default function Home() {
  return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-bold text-purple-400">Hello, AstroLaunch ⌁</h1>
      <p className="text-gray-400">React + Vite + Tailwind CSS starter template</p>
    </main>
  )
}
` },
    { path: "/src/index.css", type: "file", content: `@tailwind base;
@tailwind components;
@tailwind utilities;

body { margin: 0; font-family: system-ui, sans-serif; }
` },
  ],
}

// ─── Next.js 15 ──────────────────────────────────────────────────────────────

const NEXTJS: Template = {
  id: "nextjs",
  name: "Next.js 15",
  description: "Next.js 15 App Router + TypeScript + Tailwind CSS",
  emoji: "▲",
  category: "fullstack",
  files: [
    { path: "/package.json", type: "file", content: JSON.stringify({
      name: "my-next-app",
      version: "0.1.0",
      private: true,
      scripts: { dev: "next dev", build: "next build", start: "next start", lint: "next lint" },
      dependencies: {
        next: "15.0.0",
        react: "^18.3.1",
        "react-dom": "^18.3.1",
        "react-router-dom": "^6.22.3",
        "class-variance-authority": "^0.7.0",
        clsx: "^2.1.0",
        "lucide-react": "^0.344.0",
        "tailwind-merge": "^2.2.1",
      },
      devDependencies: {
        "@types/node": "^20",
        "@types/react": "^18",
        "@types/react-dom": "^18",
        autoprefixer: "^10.0.1",
        postcss: "^8",
        tailwindcss: "^3.3.0",
        typescript: "^5",
      },
    }, null, 2) },
    { path: "/next.config.mjs", type: "file", content: `/** @type {import('next').NextConfig} */
const nextConfig = {}
export default nextConfig
` },
    { path: "/tsconfig.json", type: "file", content: JSON.stringify({
      compilerOptions: {
        lib: ["dom", "dom.iterable", "esnext"], allowJs: true, skipLibCheck: true,
        strict: true, noEmit: true, esModuleInterop: true, module: "esnext",
        moduleResolution: "bundler", resolveJsonModule: true, isolatedModules: true,
        jsx: "preserve", incremental: true, plugins: [{ name: "next" }],
        paths: { "@/*": ["./src/*"] },
      }, include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
      exclude: ["node_modules"],
    }, null, 2) },
    { path: "/tailwind.config.ts", type: "file", content: `import type { Config } from 'tailwindcss'
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
}
export default config
` },
    { path: "/src", type: "folder", content: "" },
    { path: "/src/app", type: "folder", content: "" },
    { path: "/src/app/layout.tsx", type: "file", content: `import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'My Next App',
  description: 'Built with AstroLaunch',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
` },
    { path: "/src/app/globals.css", type: "file", content: `@tailwind base;
@tailwind components;
@tailwind utilities;
` },
    { path: "/src/app/page.tsx", type: "file", content: `export default function Home() {
  return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-bold text-purple-400">Hello, AstroLaunch ⌁</h1>
      <p className="text-gray-400">Next.js 15 App Router starter template</p>
    </main>
  )
}
` },
    { path: "/src/lib", type: "folder", content: "" },
    { path: "/src/lib/utils.ts", type: "file", content: `import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
` },
  ],
}

// ─── FiveM Script with UI ────────────────────────────────────────────────────

const FIVEM: Template = {
  id: "fivem",
  name: "FiveM Script + UI",
  description: "FiveM resource with React NUI interface and Lua server/client scripts",
  emoji: "🎮",
  category: "gamedev",
  files: [
    { path: "/fxmanifest.lua", type: "file", content: `fx_version 'cerulean'
game 'gta5'

name 'my_resource'
description 'A FiveM resource built with AstroLaunch'
version '1.0.0'
author 'Your Name'

lua54 'yes'

shared_scripts { 'shared/config.lua' }
client_scripts { 'client/*.lua' }
server_scripts { 'server/*.lua' }

ui_page 'ui/dist/index.html'

files { 'ui/dist/**' }
` },
    { path: "/shared", type: "folder", content: "" },
    { path: "/shared/config.lua", type: "file", content: `Config = {}

Config.Command = 'myresource'
Config.KeyBind = 'F5'
Config.Locale = 'en'
` },
    { path: "/client", type: "folder", content: "" },
    { path: "/client/main.lua", type: "file", content: `local isOpen = false

-- Toggle NUI
local function toggleUI()
  isOpen = not isOpen
  SetNuiFocus(isOpen, isOpen)
  SendNUIMessage({ action = 'setVisible', visible = isOpen })
end

RegisterCommand(Config.Command, toggleUI, false)
RegisterKeyMapping(Config.Command, 'Toggle ' .. Config.Command, 'keyboard', Config.KeyBind)

-- NUI callbacks
RegisterNUICallback('close', function(_, cb)
  isOpen = false
  SetNuiFocus(false, false)
  cb({})
end)

RegisterNUICallback('sendData', function(data, cb)
  -- Handle data from UI
  print('[Client] Received from UI:', json.encode(data))
  TriggerServerEvent('my_resource:serverEvent', data)
  cb({ ok = true })
end)

-- Server events
RegisterNetEvent('my_resource:clientEvent', function(data)
  print('[Client] Server event received:', json.encode(data))
  SendNUIMessage({ action = 'updateData', data = data })
end)
` },
    { path: "/server", type: "folder", content: "" },
    { path: "/server/main.lua", type: "file", content: `-- Server-side logic
RegisterNetEvent('my_resource:serverEvent', function(data)
  local src = source
  print('[Server] Event from player ' .. src .. ':', json.encode(data))
  -- Example: trigger client event back
  TriggerClientEvent('my_resource:clientEvent', src, { message = 'Hello from server!' })
end)

-- Player connecting
AddEventHandler('playerConnecting', function(name, setKickReason, deferrals)
  print('[Server] Player connecting: ' .. name)
end)
` },
    { path: "/ui", type: "folder", content: "" },
    { path: "/ui/package.json", type: "file", content: JSON.stringify({
      name: "fivem-ui",
      version: "1.0.0",
      private: true,
      scripts: { dev: "vite", build: "vite build", preview: "vite preview" },
      dependencies: { react: "^18.3.1", "react-dom": "^18.3.1" },
      devDependencies: {
        "@types/react": "^18.3.1", "@types/react-dom": "^18.3.1",
        "@vitejs/plugin-react": "^4.2.1", vite: "^5.1.4",
        typescript: "^5.3.3", tailwindcss: "^3.4.1", autoprefixer: "^10.4.17", postcss: "^8.4.35",
      },
    }, null, 2) },
    { path: "/ui/vite.config.ts", type: "file", content: `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'dist', emptyOutDir: true },
})
` },
    { path: "/ui/index.html", type: "file", content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>FiveM UI</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
` },
    { path: "/ui/src", type: "folder", content: "" },
    { path: "/ui/src/main.tsx", type: "file", content: `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>
)
` },
    { path: "/ui/src/index.css", type: "file", content: `@tailwind base;
@tailwind components;
@tailwind utilities;

* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: transparent; font-family: system-ui, sans-serif; }
` },
    { path: "/ui/src/App.tsx", type: "file", content: `import { useState, useEffect } from 'react'

export default function App() {
  const [visible, setVisible] = useState(false)
  const [data, setData] = useState<Record<string, unknown>>({})

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const { action, ...rest } = event.data
      if (action === 'setVisible') setVisible(rest.visible)
      if (action === 'updateData') setData(rest.data)
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  const sendToClient = (payload: unknown) => {
    fetch(\`https://\${GetParentResourceName()}/sendData\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  }

  const close = () => {
    fetch(\`https://\${GetParentResourceName()}/close\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
  }

  if (!visible) return null

  return (
    <div className="fixed inset-0 flex items-center justify-center">
      <div className="bg-gray-900/95 border border-gray-700 rounded-xl p-6 w-96 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-white font-bold text-lg">My Resource</h1>
          <button
            onClick={close}
            className="text-gray-400 hover:text-white transition"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3">
          <p className="text-gray-300 text-sm">FiveM NUI Interface</p>
          {Object.keys(data).length > 0 && (
            <pre className="bg-gray-800 rounded p-2 text-xs text-green-400">
              {JSON.stringify(data, null, 2)}
            </pre>
          )}
          <button
            onClick={() => sendToClient({ action: 'test', timestamp: Date.now() })}
            className="w-full bg-purple-600 hover:bg-purple-500 text-white rounded-lg py-2 text-sm font-medium transition"
          >
            Send Test Event
          </button>
        </div>
      </div>
    </div>
  )
}

declare function GetParentResourceName(): string
` },
  ],
}

// ─── Express API ─────────────────────────────────────────────────────────────

const EXPRESS_API: Template = {
  id: "express-api",
  name: "Express API",
  description: "Node.js + Express + TypeScript REST API starter with middleware",
  emoji: "🚂",
  category: "backend",
  files: [
    { path: "/package.json", type: "file", content: JSON.stringify({
      name: "my-api",
      version: "1.0.0",
      private: true,
      scripts: { dev: "ts-node-dev --respawn src/index.ts", build: "tsc", start: "node dist/index.js" },
      dependencies: { express: "^4.18.2", cors: "^2.8.5", dotenv: "^16.0.3", zod: "^3.22.4" },
      devDependencies: {
        "@types/express": "^4.17.21", "@types/cors": "^2.8.17", "@types/node": "^20",
        typescript: "^5.3.3", "ts-node-dev": "^2.0.0",
      },
    }, null, 2) },
    { path: "/tsconfig.json", type: "file", content: JSON.stringify({
      compilerOptions: {
        target: "ES2020", module: "commonjs", lib: ["ES2020"], outDir: "./dist",
        rootDir: "./src", strict: true, esModuleInterop: true, skipLibCheck: true,
        forceConsistentCasingInFileNames: true, resolveJsonModule: true,
      }, include: ["src"], exclude: ["node_modules", "dist"],
    }, null, 2) },
    { path: "/.env.example", type: "file", content: `PORT=3000
NODE_ENV=development
` },
    { path: "/src", type: "folder", content: "" },
    { path: "/src/index.ts", type: "file", content: `import dotenv from 'dotenv'
dotenv.config()

import app from './app'

const PORT = process.env.PORT ?? 3000

app.listen(PORT, () => {
  console.log(\`🚀 Server running on http://localhost:\${PORT}\`)
})
` },
    { path: "/src/app.ts", type: "file", content: `import express from 'express'
import cors from 'cors'
import { router as apiRouter } from './routes/api'

const app = express()

app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Routes
app.use('/api', apiRouter)

// Health check
app.get('/health', (_, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// 404 handler
app.use((_, res) => {
  res.status(404).json({ error: 'Not Found' })
})

export default app
` },
    { path: "/src/routes", type: "folder", content: "" },
    { path: "/src/routes/api.ts", type: "file", content: `import { Router } from 'express'
import { z } from 'zod'

export const router = Router()

const ItemSchema = z.object({
  name: z.string().min(1),
  value: z.unknown().optional(),
})

const items: { id: string; name: string; value: unknown; createdAt: string }[] = []

router.get('/items', (_, res) => {
  res.json({ items, total: items.length })
})

router.post('/items', (req, res) => {
  const result = ItemSchema.safeParse(req.body)
  if (!result.success) return res.status(400).json({ error: result.error.flatten() })

  const item = { id: crypto.randomUUID(), ...result.data, createdAt: new Date().toISOString() }
  items.push(item)
  res.status(201).json(item)
})

router.get('/items/:id', (req, res) => {
  const item = items.find((i) => i.id === req.params.id)
  if (!item) return res.status(404).json({ error: 'Item not found' })
  res.json(item)
})

router.delete('/items/:id', (req, res) => {
  const idx = items.findIndex((i) => i.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'Item not found' })
  items.splice(idx, 1)
  res.status(204).end()
})
` },
  ],
}

// ─── T3 Stack ─────────────────────────────────────────────────────────────────

const T3_STACK: Template = {
  id: "t3-stack",
  name: "T3 Stack",
  description: "Next.js + tRPC + Prisma + Tailwind CSS full-stack type-safe app",
  emoji: "🔺",
  category: "fullstack",
  files: [
    { path: "/package.json", type: "file", content: JSON.stringify({
      name: "my-t3-app",
      version: "0.1.0",
      private: true,
      scripts: { dev: "next dev", build: "next build", start: "next start" },
      dependencies: {
        next: "15.0.0",
        react: "^18.3.1",
        "react-dom": "^18.3.1",
        "@trpc/client": "^11.0.0",
        "@trpc/react-query": "^11.0.0",
        "@trpc/server": "^11.0.0",
        "@tanstack/react-query": "^5.0.0",
        zod: "^3.22.4",
        "@prisma/client": "^5.9.1",
      },
      devDependencies: {
        "@types/node": "^20",
        "@types/react": "^18",
        "@types/react-dom": "^18",
        tailwindcss: "^3.4.1",
        typescript: "^5",
        prisma: "^5.9.1",
      },
    }, null, 2) },
    { path: "/README.md", type: "file", content: `# T3 Stack App

Built with AstroLaunch ⌁

## Stack
- **Next.js 15** — App Router
- **tRPC** — Type-safe API
- **Prisma** — Database ORM
- **Tailwind CSS** — Styling
- **Zod** — Schema validation

## Getting Started

\`\`\`bash
npm install
npx prisma generate
npm run dev
\`\`\`
` },
    { path: "/prisma", type: "folder", content: "" },
    { path: "/prisma/schema.prisma", type: "file", content: `generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = "file:./dev.db"
}

model Post {
  id        String   @id @default(cuid())
  title     String
  content   String?
  published Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
` },
    { path: "/src", type: "folder", content: "" },
    { path: "/src/app", type: "folder", content: "" },
    { path: "/src/app/layout.tsx", type: "file", content: `import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = { title: 'T3 App' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>
}
` },
    { path: "/src/app/globals.css", type: "file", content: "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n" },
    { path: "/src/app/page.tsx", type: "file", content: `export default function Home() {
  return (
    <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
      <h1 className="text-4xl font-bold text-purple-400">T3 Stack ⌁</h1>
    </main>
  )
}
` },
  ],
}

export const TEMPLATES: Template[] = [REACT_VITE, NEXTJS, FIVEM, EXPRESS_API, T3_STACK]

// ─── Apply template to workspace ─────────────────────────────────────────────

export async function applyTemplate(template: Template): Promise<void> {
  if (!db) throw new Error("Database not initialized")

  // Clear existing files
  await db.files.clear()

  // Build a map of path → DB id for folder parents
  const pathToId = new Map<string, string>()

  // Sort so folders come first (depth-first insertion)
  const sorted = [...template.files].sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1
    return a.path.length - b.path.length
  })

  for (const f of sorted) {
    const id = nanoid()
    const segments = f.path.replace(/^\//, "").split("/")
    const name = segments[segments.length - 1]
    const parentPath = segments.length > 1 ? "/" + segments.slice(0, -1).join("/") : null
    const parentId = parentPath ? (pathToId.get(parentPath) ?? null) : null

    await db.files.add({
      id,
      name,
      path: f.path,
      type: f.type,
      parentId,
      content: f.type === "file" ? f.content : undefined,
      baseline: f.type === "file" ? f.content : undefined,
      language: detectLanguage(name),
      modified: Date.now(),
      size: f.content.length,
    })

    if (f.type === "folder") {
      pathToId.set(f.path, id)
    }
  }
}

function detectLanguage(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? ""
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescriptreact", js: "javascript", jsx: "javascriptreact",
    json: "json", css: "css", html: "html", md: "markdown", lua: "lua",
    py: "python", rs: "rust", go: "go", sh: "shell", env: "plaintext",
    prisma: "prisma", yaml: "yaml", yml: "yaml", toml: "toml",
  }
  return map[ext] ?? "plaintext"
}
