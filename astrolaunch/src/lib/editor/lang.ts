export function detectLanguage(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? ""
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript",
    js: "javascript", jsx: "javascript",
    json: "json", md: "markdown",
    html: "html", css: "css", scss: "scss",
    py: "python", rs: "rust", go: "go",
    yml: "yaml", yaml: "yaml", sh: "shell",
    vue: "html", svelte: "html",
  }
  return map[ext] ?? "plaintext"
}
