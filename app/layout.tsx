import type { Viewport } from "next"
import { headers } from "next/headers"
import { ToastProvider, ToastViewport } from "@/components/ui/toast"
import { ThemeProvider } from "@/components/theme-provider"
import { ThemeToggle } from "@/components/theme-toggle"
import PwaInstallPrompt from "@/components/PwaInstallPrompt"
import { buildMetadata, buildStructuredData, normalizeHost } from "@/lib/site-metadata"
import "./globals.css"

export async function generateMetadata() {
  const requestHeaders = await headers()
  const hostname = normalizeHost(
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host")
  )

  return buildMetadata(hostname)
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const requestHeaders = await headers()
  const hostname = normalizeHost(
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host")
  )
  const structuredData = buildStructuredData(hostname)

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className="font-sans antialiased bg-background text-foreground"
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
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

            <PwaInstallPrompt />
            <ThemeToggle className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-50 inline-flex px-2.5 py-2 text-xs sm:px-3 sm:py-2 sm:text-sm" />
            <ToastViewport />
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
