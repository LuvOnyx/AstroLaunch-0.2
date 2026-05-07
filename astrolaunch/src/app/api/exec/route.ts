/**
 * /api/exec — server-side command execution for agent tools.
 *
 * Agent tools (run_command, install_deps, run_playwright) POST here.
 * Runs in the actual Replit shell — no WebContainer needed.
 *
 * Body: { command: string, cwd?: string, timeout?: number }
 * Response: { code: number, output: string, error?: string }
 */
import { NextRequest, NextResponse } from "next/server"
import { exec } from "child_process"
import { promisify } from "util"

export const runtime = "nodejs"

const execAsync = promisify(exec)

// Block obviously destructive commands
const BLOCKED = /rm\s+-rf\s+\/[^/]|mkfs|dd\s+if=\/dev\/(zero|random|urandom)\s+of=\/dev|:\(\)\{.*\}/

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const command: string  = String(body.command  || "").trim()
    const cwd:    string   = String(body.cwd      || process.cwd())
    const timeout: number  = Math.min(Number(body.timeout ?? 60_000), 300_000)

    if (!command) {
      return NextResponse.json({ code: 1, output: "", error: "command is required" }, { status: 400 })
    }

    if (BLOCKED.test(command)) {
      return NextResponse.json({ code: 1, output: "", error: "Command blocked for safety." })
    }

    const { stdout, stderr } = await execAsync(command, {
      cwd,
      timeout,
      maxBuffer: 1024 * 1024 * 5,   // 5 MB
      env: { ...process.env, TERM: "xterm-256color", FORCE_COLOR: "1" },
      shell: "/bin/bash",
    })

    return NextResponse.json({
      code:   0,
      output: (stdout + stderr).slice(0, 50_000),
    })
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string; message?: string; killed?: boolean }
    return NextResponse.json({
      code:   e.code ?? 1,
      output: ((e.stdout ?? "") + (e.stderr ?? "")).slice(0, 50_000),
      error:  e.killed ? "Command timed out" : e.message,
    })
  }
}
