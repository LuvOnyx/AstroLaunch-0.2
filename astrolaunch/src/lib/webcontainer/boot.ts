"use client"
/**
 * WebContainers boot + bridge.
 *
 * Exposes window.alWebContainer with:
 *   - run(command)            → quick one-shot command
 *   - writeFile(path, content)
 *   - readFile(path)
 *   - mountFiles(tree)
 *   - startDevServer(scriptName?)
 *   - spawnShell()             → returns { proc, write, onOutput, kill } for terminal
 *   - onServerReady(cb)
 */
import type { WebContainer, WebContainerProcess } from "@webcontainer/api"

let bootPromise: Promise<WebContainer> | null = null
let instance: WebContainer | null = null
let devProcess: WebContainerProcess | null = null
const serverReadyListeners = new Set<(url: string) => void>()

export interface ShellHandle {
  proc: WebContainerProcess
  write: (data: string) => void
  resize: (cols: number, rows: number) => void
  onOutput: (cb: (chunk: string) => void) => () => void
  kill: () => void
}

export async function bootWebContainer(): Promise<WebContainer> {
  if (instance) return instance
  if (bootPromise) return bootPromise
  const { WebContainer } = await import("@webcontainer/api")
  bootPromise = WebContainer.boot().then((wc) => {
    instance = wc
    bridgeToWindow(wc)
    wc.on("server-ready", (_port, url) => {
      serverReadyListeners.forEach((cb) => { try { cb(url) } catch {} })
    })
    return wc
  })
  return bootPromise
}

export function isBooted() { return !!instance }
export function getInstance(): WebContainer | null { return instance }

function bridgeToWindow(wc: WebContainer) {
  const outputBus = new Set<(chunk: string) => void>()
  ;(window as unknown as { alWebContainer: unknown }).alWebContainer = {
    instance: wc,
    async writeFile(path: string, content: string) {
      const dir = path.split("/").slice(0, -1).join("/")
      if (dir) await wc.fs.mkdir(dir, { recursive: true }).catch(() => {})
      await wc.fs.writeFile(path, content)
      return { ok: true }
    },
    async readFile(path: string) {
      const buf = await wc.fs.readFile(path, "utf-8")
      return { content: buf }
    },
    async run(command: string) {
      const [cmd, ...args] = command.split(/\s+/)
      const proc = await wc.spawn(cmd, args)
      let out = ""
      proc.output.pipeTo(new WritableStream({ write(chunk) {
        out += chunk
        outputBus.forEach((fn) => { try { fn(chunk) } catch {} })
      } }))
      const code = await proc.exit
      return { code, output: out.slice(0, 8000) }
    },
    async startDevServer(scriptName = "dev") {
      if (devProcess) try { devProcess.kill() } catch {}
      devProcess = await wc.spawn("npm", ["run", scriptName])
      return new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Dev server timeout")), 60_000)
        const off = onServerReady((url) => { clearTimeout(timeout); off(); resolve(url) })
        devProcess?.exit.then((c) => { if (c !== 0) reject(new Error(`Dev server exited ${c}`)) })
      })
    },
    onOutput(cb: (chunk: string) => void) {
      outputBus.add(cb)
      return () => outputBus.delete(cb)
    },
  }
}

export function onServerReady(cb: (url: string) => void) {
  serverReadyListeners.add(cb)
  return () => { serverReadyListeners.delete(cb) }
}

/** Spawn a JSH shell suitable for xterm.js. Returns a handle with bidirectional IO. */
export async function spawnShell(cwd?: string): Promise<ShellHandle> {
  const wc = await bootWebContainer()
  const args = ["jsh"]
  const proc = await wc.spawn("jsh", [], {
    terminal: { cols: 100, rows: 24 },
    env: cwd ? { PWD: cwd } : undefined,
  })
  // jsh args fallback (some versions accept positional only)
  void args

  const subscribers = new Set<(chunk: string) => void>()
  proc.output.pipeTo(new WritableStream({
    write(chunk) { subscribers.forEach((fn) => { try { fn(chunk) } catch {} }) },
  }))

  const inputWriter = proc.input.getWriter()
  return {
    proc,
    write: (data: string) => { void inputWriter.write(data) },
    resize: (cols, rows) => { try { proc.resize({ cols, rows }) } catch {} },
    onOutput: (cb) => { subscribers.add(cb); return () => subscribers.delete(cb) },
    kill: () => { try { proc.kill() } catch {} },
  }
}

/** Mount a virtual file tree into the container. */
export async function mountFiles(wc: WebContainer, files: Record<string, string>) {
  const tree: Record<string, unknown> = {}
  for (const [path, content] of Object.entries(files)) {
    const parts = path.replace(/^\//, "").split("/")
    let cur: Record<string, unknown> = tree
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i]
      if (!cur[seg]) cur[seg] = { directory: {} }
      cur = (cur[seg] as { directory: Record<string, unknown> }).directory
    }
    const fileName = parts[parts.length - 1]
    cur[fileName] = { file: { contents: content } }
  }
  await wc.mount(tree as Parameters<WebContainer["mount"]>[0])
}

/** Sync the workspace IndexedDB → WebContainer FS (used by terminal panel). */
export async function syncWorkspaceToContainer(files: { path: string; content?: string; type: string }[]) {
  const wc = await bootWebContainer()
  const tree: Record<string, string> = {}
  for (const f of files) {
    if (f.type !== "file") continue
    tree[f.path.replace(/^\//, "")] = f.content ?? ""
  }
  if (Object.keys(tree).length) await mountFiles(wc, tree)
}
