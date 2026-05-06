/**
 * Tiny diff implementation — produces unified-diff style output for tool diffs
 * shown inline in chat messages. Avoids pulling in a full diff library.
 *
 * Algorithm: classic LCS table → emit equal/added/removed line ops.
 */

export interface DiffLine {
  type: "equal" | "add" | "remove"
  content: string
  /** 1-based line numbers in the before / after files. */
  before?: number
  after?: number
}

export interface DiffResult {
  lines: DiffLine[]
  added: number
  removed: number
  unified: string
}

export function diffLines(before: string, after: string): DiffResult {
  const a = before.split("\n")
  const b = after.split("\n")
  const n = a.length
  const m = b.length

  // LCS table — capped to keep things sane on huge files
  const cap = 4000
  if (n > cap || m > cap) {
    // Fall back to a coarse "before/after" diff for huge files
    return {
      lines: [
        ...a.map((l, i) => ({ type: "remove" as const, content: l, before: i + 1 })),
        ...b.map((l, i) => ({ type: "add" as const, content: l, after: i + 1 })),
      ],
      added: m,
      removed: n,
      unified: "@@ large file diff truncated @@",
    }
  }

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const lines: DiffLine[] = []
  let i = 0, j = 0, ai = 1, bi = 1
  let added = 0, removed = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      lines.push({ type: "equal", content: a[i], before: ai, after: bi })
      i++; j++; ai++; bi++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      lines.push({ type: "remove", content: a[i], before: ai })
      removed++; i++; ai++
    } else {
      lines.push({ type: "add", content: b[j], after: bi })
      added++; j++; bi++
    }
  }
  while (i < n) { lines.push({ type: "remove", content: a[i++], before: ai++ }); removed++ }
  while (j < m) { lines.push({ type: "add", content: b[j++], after: bi++ }); added++ }

  // Compose unified diff with hunks
  const unified = unifiedFromLines(lines)
  return { lines, added, removed, unified }
}

function unifiedFromLines(lines: DiffLine[], context = 3): string {
  if (!lines.some((l) => l.type !== "equal")) return ""
  const out: string[] = []
  let i = 0
  while (i < lines.length) {
    // Skip equal blocks of size > context*2
    const startEqual = i
    while (i < lines.length && lines[i].type === "equal") i++
    if (i === lines.length) break
    const hunkStart = Math.max(startEqual, i - context)
    let hunkEnd = i
    while (hunkEnd < lines.length) {
      if (lines[hunkEnd].type !== "equal") { hunkEnd++; continue }
      // Look ahead — if equal run < 2*context, include it
      let runEnd = hunkEnd
      while (runEnd < lines.length && lines[runEnd].type === "equal") runEnd++
      if (runEnd - hunkEnd >= 2 * context || runEnd === lines.length) {
        hunkEnd = Math.min(runEnd, hunkEnd + context)
        break
      }
      hunkEnd = runEnd
    }
    const hunk = lines.slice(hunkStart, hunkEnd)
    const beforeStart = hunk.find((l) => l.before)?.before ?? 1
    const afterStart = hunk.find((l) => l.after)?.after ?? 1
    const beforeLen = hunk.filter((l) => l.type !== "add").length
    const afterLen = hunk.filter((l) => l.type !== "remove").length
    out.push(`@@ -${beforeStart},${beforeLen} +${afterStart},${afterLen} @@`)
    for (const l of hunk) {
      out.push(`${l.type === "add" ? "+" : l.type === "remove" ? "-" : " "}${l.content}`)
    }
    i = hunkEnd
  }
  return out.join("\n")
}
