"use client"
/**
 * MenuBar — macOS-style application menu bar.
 * All menu actions are dispatched as custom window events so components
 * can subscribe without prop-drilling.
 */
import { useState, useRef, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { useWorkspace } from "@/store/workspace"
import { useSettings } from "@/store/settings"
import { TEMPLATES } from "@/lib/templates"

// ─── Event bus ───────────────────────────────────────────────────────────────
export function dispatchMenuAction(action: string, payload?: unknown) {
  window.dispatchEvent(new CustomEvent("astrolaunch:menu", { detail: { action, payload } }))
}

export function useMenuAction(action: string, handler: (payload?: unknown) => void) {
  useEffect(() => {
    const h = (e: Event) => {
      const { action: a, payload } = (e as CustomEvent).detail
      if (a === action) handler(payload)
    }
    window.addEventListener("astrolaunch:menu", h)
    return () => window.removeEventListener("astrolaunch:menu", h)
  }, [action, handler])
}

// ─── Types ────────────────────────────────────────────────────────────────────
type MenuItemDef =
  | { type: "separator" }
  | { type: "item"; label: string; shortcut?: string; action: string; payload?: unknown; disabled?: boolean }
  | { type: "submenu"; label: string; items: MenuItemDef[] }

interface MenuDef {
  label: string
  items: MenuItemDef[]
}

// ─── Menu definitions ─────────────────────────────────────────────────────────
function buildMenus(): MenuDef[] {
  return [
    {
      label: "File",
      items: [
        { type: "item", label: "New File", shortcut: "⌘N", action: "file:new-file" },
        { type: "item", label: "New Folder", shortcut: "⌘⇧N", action: "file:new-folder" },
        { type: "separator" },
        { type: "item", label: "Open Project…", shortcut: "⌘O", action: "file:open-project" },
        {
          type: "submenu", label: "Templates",
          items: [
            ...TEMPLATES.map((t) => ({
              type: "item" as const,
              label: `${t.emoji} ${t.name}`,
              action: "templates:apply",
              payload: t.id,
            })),
          ],
        },
        { type: "separator" },
        { type: "item", label: "Save", shortcut: "⌘S", action: "file:save" },
        { type: "item", label: "Save All", shortcut: "⌘⇧S", action: "file:save-all" },
        { type: "separator" },
        { type: "item", label: "Close File", shortcut: "⌘W", action: "file:close" },
        { type: "separator" },
        { type: "item", label: "Settings…", shortcut: "⌘,", action: "app:settings" },
      ],
    },
    {
      label: "Edit",
      items: [
        { type: "item", label: "Undo", shortcut: "⌘Z", action: "edit:undo" },
        { type: "item", label: "Redo", shortcut: "⌘⇧Z", action: "edit:redo" },
        { type: "separator" },
        { type: "item", label: "Cut", shortcut: "⌘X", action: "edit:cut" },
        { type: "item", label: "Copy", shortcut: "⌘C", action: "edit:copy" },
        { type: "item", label: "Paste", shortcut: "⌘V", action: "edit:paste" },
        { type: "separator" },
        { type: "item", label: "Find", shortcut: "⌘F", action: "edit:find" },
        { type: "item", label: "Find & Replace", shortcut: "⌘H", action: "edit:replace" },
        { type: "item", label: "Find in Files", shortcut: "⌘⇧F", action: "edit:find-in-files" },
        { type: "separator" },
        { type: "item", label: "Format Document", shortcut: "⇧⌥F", action: "edit:format" },
        { type: "item", label: "Toggle Line Comment", shortcut: "⌘/", action: "edit:comment" },
      ],
    },
    {
      label: "View",
      items: [
        { type: "item", label: "Command Palette", shortcut: "⌘K", action: "view:command-palette" },
        { type: "separator" },
        { type: "item", label: "Toggle Explorer", shortcut: "⌘B", action: "view:toggle-explorer" },
        { type: "item", label: "Toggle Terminal", shortcut: "⌘`", action: "view:toggle-terminal" },
        { type: "item", label: "Toggle Agent Chat", shortcut: "⌘J", action: "view:toggle-chat" },
        { type: "separator" },
        { type: "item", label: "Preview Mode", shortcut: "⌘1", action: "view:preview" },
        { type: "item", label: "Canvas Mode", shortcut: "⌘2", action: "view:canvas" },
        { type: "item", label: "Split Mode", shortcut: "⌘3", action: "view:split" },
        { type: "separator" },
        { type: "item", label: "Zoom In", shortcut: "⌘+", action: "view:zoom-in" },
        { type: "item", label: "Zoom Out", shortcut: "⌘-", action: "view:zoom-out" },
        { type: "item", label: "Reset Zoom", shortcut: "⌘0", action: "view:zoom-reset" },
      ],
    },
    {
      label: "Run",
      items: [
        { type: "item", label: "Start Dev Server", shortcut: "⌘⇧D", action: "run:dev-server" },
        { type: "item", label: "Build Project", shortcut: "⌘⇧B", action: "run:build" },
        { type: "item", label: "Install Dependencies", action: "run:install" },
        { type: "item", label: "Run Tests", shortcut: "⌘⇧T", action: "run:test" },
        { type: "separator" },
        { type: "item", label: "Stop Server", action: "run:stop" },
        { type: "separator" },
        {
          type: "submenu", label: "Custom Script",
          items: [
            { type: "item", label: "npm run dev", action: "run:script", payload: "npm run dev" },
            { type: "item", label: "npm run build", action: "run:script", payload: "npm run build" },
            { type: "item", label: "npm run lint", action: "run:script", payload: "npm run lint" },
            { type: "item", label: "npm test", action: "run:script", payload: "npm test" },
          ],
        },
      ],
    },
    {
      label: "Terminal",
      items: [
        { type: "item", label: "New Terminal", shortcut: "⌘T", action: "terminal:new" },
        { type: "item", label: "Clear Terminal", action: "terminal:clear" },
        { type: "item", label: "Kill Active Terminal", action: "terminal:kill" },
        { type: "separator" },
        { type: "item", label: "Split Terminal", action: "terminal:split" },
      ],
    },
    {
      label: "Templates",
      items: TEMPLATES.map((t) => ({
        type: "item" as const,
        label: `${t.emoji}  ${t.name}`,
        action: "templates:apply",
        payload: t.id,
      })),
    },
    {
      label: "Help",
      items: [
        { type: "item", label: "About AstroLaunch", action: "help:about" },
        { type: "item", label: "Keyboard Shortcuts", shortcut: "⌘⇧K", action: "help:shortcuts" },
        { type: "item", label: "Welcome Screen", action: "help:welcome" },
        { type: "separator" },
        { type: "item", label: "Documentation", action: "help:docs" },
        { type: "item", label: "Report Issue", action: "help:report-issue" },
      ],
    },
  ]
}

// ─── MenuBar component ────────────────────────────────────────────────────────
export function MenuBar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const [openMenu, setOpenMenu] = useState<number | null>(null)
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const menus = buildMenus()

  const { setShowLeftSidebar, showLeftSidebar, setCenterMode, setShowRightChat, showRightChat } = useWorkspace()
  const { set } = useSettings()

  // Close on outside click
  useEffect(() => {
    if (openMenu === null) return
    const handler = (e: MouseEvent) => {
      if (!barRef.current?.contains(e.target as Node)) {
        setOpenMenu(null)
        setOpenSubmenu(null)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [openMenu])

  // Global keyboard shortcut: Escape closes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpenMenu(null); setOpenSubmenu(null) }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  const handleAction = useCallback((action: string, payload?: unknown) => {
    setOpenMenu(null)
    setOpenSubmenu(null)

    // Handle built-in actions directly for instant response
    switch (action) {
      case "app:settings":
        onOpenSettings()
        return
      case "view:toggle-explorer":
        setShowLeftSidebar(!showLeftSidebar)
        return
      case "view:toggle-chat":
        setShowRightChat(!showRightChat)
        return
      case "view:preview":
        setCenterMode("preview")
        return
      case "view:canvas":
        setCenterMode("canvas")
        return
      case "view:split":
        setCenterMode("split")
        return
      case "help:welcome":
        set("showWelcome", true)
        return
      default:
        break
    }

    // Dispatch custom event for other components to handle
    dispatchMenuAction(action, payload)
  }, [onOpenSettings, setShowLeftSidebar, showLeftSidebar, setShowRightChat, showRightChat, setCenterMode, set])

  return (
    <div
      ref={barRef}
      className="h-6 flex items-stretch bg-al-topbar border-b border-border/50 text-[11px] select-none flex-shrink-0"
    >
      {menus.map((menu, idx) => (
        <div key={menu.label} className="relative">
          <button
            onMouseDown={() => setOpenMenu(openMenu === idx ? null : idx)}
            onMouseEnter={() => { if (openMenu !== null && openMenu !== idx) { setOpenMenu(idx); setOpenSubmenu(null) } }}
            className={cn(
              "h-full px-3 flex items-center gap-0.5 transition-colors",
              openMenu === idx
                ? "bg-al-accent/20 text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
            )}
          >
            {menu.label}
          </button>

          <AnimatePresence>
            {openMenu === idx && (
              <motion.div
                initial={{ opacity: 0, y: -4, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.97 }}
                transition={{ duration: 0.1 }}
                className="absolute top-full left-0 z-50 min-w-[200px] bg-al-panel border border-border rounded-md shadow-2xl py-1 overflow-visible"
              >
                {menu.items.map((item, itemIdx) => (
                  <MenuItem
                    key={itemIdx}
                    item={item}
                    openSubmenu={openSubmenu}
                    setOpenSubmenu={setOpenSubmenu}
                    onAction={handleAction}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  )
}

// ─── MenuItem ─────────────────────────────────────────────────────────────────

function MenuItem({
  item,
  openSubmenu,
  setOpenSubmenu,
  onAction,
  depth = 0,
}: {
  item: MenuItemDef
  openSubmenu: string | null
  setOpenSubmenu: (k: string | null) => void
  onAction: (action: string, payload?: unknown) => void
  depth?: number
}) {
  if (item.type === "separator") {
    return <div className="my-1 h-px bg-border/60" />
  }

  if (item.type === "submenu") {
    const key = `${depth}-${item.label}`
    const isOpen = openSubmenu === key
    return (
      <div
        className="relative"
        onMouseEnter={() => setOpenSubmenu(key)}
        onMouseLeave={() => setOpenSubmenu(null)}
      >
        <div
          className={cn(
            "flex items-center justify-between px-3 py-1 cursor-pointer transition-colors",
            isOpen ? "bg-al-accent/20 text-foreground" : "text-foreground hover:bg-foreground/10"
          )}
        >
          <span>{item.label}</span>
          <span className="text-muted-foreground ml-8">▶</span>
        </div>
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -4 }}
              transition={{ duration: 0.1 }}
              className="absolute top-0 left-full z-50 min-w-[180px] bg-al-panel border border-border rounded-md shadow-2xl py-1"
            >
              {item.items.map((sub, i) => (
                <MenuItem
                  key={i}
                  item={sub}
                  openSubmenu={openSubmenu}
                  setOpenSubmenu={setOpenSubmenu}
                  onAction={onAction}
                  depth={depth + 1}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  return (
    <button
      onClick={() => !item.disabled && onAction(item.action, item.payload)}
      disabled={item.disabled}
      className={cn(
        "w-full flex items-center justify-between px-3 py-1 text-left transition-colors",
        item.disabled
          ? "text-muted-foreground/40 cursor-not-allowed"
          : "text-foreground hover:bg-foreground/10"
      )}
    >
      <span>{item.label}</span>
      {item.shortcut && (
        <span className="text-muted-foreground ml-8 text-[10px]">{item.shortcut}</span>
      )}
    </button>
  )
}
