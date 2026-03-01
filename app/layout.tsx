import type { Metadata } from "next"
import { Geist } from "next/font/google"
import { ToastProvider, ToastViewport } from "@/components/ui/toast"
import "./globals.css"

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
})

export const metadata: Metadata = {
  title: "BlakVote — Premium Digital Voting Platform",
  description:
    "Secure, elegant and enterprise-grade digital voting platform built for modern organizations.",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body
        className={`${geist.variable} font-sans antialiased bg-[#05060D] text-white`}
      >
        <ToastProvider>
          {/* Premium Background */}
          <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_20%_20%,rgba(245,192,68,0.05),transparent_35%),radial-gradient(circle_at_80%_80%,rgba(245,192,68,0.04),transparent_35%)]" />

          {/* App Content */}
          <div className="min-h-screen flex flex-col">
            {children}
          </div>

          <ToastViewport />
        </ToastProvider>
      </body>
    </html>
  )
}
