import type { Metadata } from "next"
import { Analytics } from '@vercel/analytics/next'
import "./globals.css"

export const metadata: Metadata = {
  title: "AstroLaunch — IDE + Design Workstation",
  description: "VS Code × Figma × Antigravity, unified. Multi-agent. Penpot canvas. Live HMR preview.",
  icons: { icon: "/favicon.svg" },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body className="font-sans bg-background text-foreground overflow-hidden h-screen w-screen">
        {children}
        <Analytics />
      </body>
    </html>
  )
}
