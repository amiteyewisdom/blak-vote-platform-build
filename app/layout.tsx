import type { Metadata, Viewport } from "next"
import { ToastProvider, ToastViewport } from "@/components/ui/toast"
import { ThemeProvider } from "@/components/theme-provider"
import { ThemeToggle } from "@/components/theme-toggle"
import "./globals.css"

export const metadata: Metadata = {
  title: "BlakVote — Premium Digital Voting Platform",
  description:
    "Secure, elegant and enterprise-grade digital voting platform built for modern organizations.",
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className="font-sans antialiased bg-background text-foreground"
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          storageKey="blakvote-theme"
        >
          <ToastProvider>
            {/* Premium Background */}
            <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_20%_20%,hsl(var(--gold)/0.16),transparent_35%),radial-gradient(circle_at_80%_80%,hsl(var(--gold)/0.12),transparent_35%)]" />

            {/* App Content */}
            <div className="min-h-screen flex flex-col overflow-x-hidden">
              {children}
            </div>

            <ThemeToggle className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-50 inline-flex px-2.5 py-2 text-xs sm:px-3 sm:py-2 sm:text-sm" />
            <ToastViewport />
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
