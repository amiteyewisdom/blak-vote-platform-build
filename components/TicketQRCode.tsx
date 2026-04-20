'use client'

import { useEffect, useRef, useState } from 'react'
import { Download, Loader2 } from 'lucide-react'

interface TicketQRCodeProps {
  code: string
  label?: string
  size?: number
}

export function TicketQRCode({ code, label, size = 200 }: TicketQRCodeProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!code) return

    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)

      try {
        const res = await fetch(`/api/tickets/qr?code=${encodeURIComponent(code)}`)
        const payload = await res.json()

        if (!cancelled) {
          if (!res.ok) {
            setError(payload.error || 'QR generation failed')
          } else {
            setDataUrl(payload.dataUrl)
          }
          setLoading(false)
        }
      } catch {
        if (!cancelled) {
          setError('QR generation failed')
          setLoading(false)
        }
      }
    }

    void load()
    return () => { cancelled = true }
  }, [code])

  const download = () => {
    if (!dataUrl) return
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `ticket-${code}.png`
    a.click()
  }

  if (loading) {
    return (
      <div
        style={{ width: size, height: size }}
        className="flex items-center justify-center rounded-xl border border-border bg-secondary/40"
      >
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !dataUrl) {
    return (
      <div
        style={{ width: size, height: size }}
        className="flex items-center justify-center rounded-xl border border-destructive/30 bg-destructive/5 text-xs text-destructive text-center p-4"
      >
        QR unavailable
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-2">
      {/* White background ensures QR is scannable regardless of page theme */}
      <div className="rounded-xl border border-border bg-white p-2">
        <img
          src={dataUrl}
          alt={`QR code for ticket ${code}`}
          width={size}
          height={size}
          style={{ display: 'block' }}
        />
      </div>

      {label && (
        <p className="text-sm font-medium text-foreground">{label}</p>
      )}

      <p className="font-mono text-xs tracking-widest text-muted-foreground select-all">
        {code}
      </p>

      <button
        onClick={download}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary/60 transition-colors"
      >
        <Download className="h-3.5 w-3.5" />
        Download QR
      </button>
    </div>
  )
}
