'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { QrCode, Download, Calendar } from 'lucide-react'
import QRCode from 'qrcode'

interface EventItem {
  id: string
  title: string
  status: string
  event_type: string
  short_code?: string
  event_code?: string
  start_date?: string
  end_date?: string
  image_url?: string
}

function QrCanvas({ url, id }: { url: string; id: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, url, { width: 160, margin: 2 }, () => {})
    }
  }, [url])

  return <canvas ref={canvasRef} id={id} className="rounded-lg" />
}

export default function OrganizerQrCodesPage() {
  const router = useRouter()
  const [events, setEvents] = useState<EventItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchEvents()
  }, [])

  const fetchEvents = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/organizer/dashboard', { cache: 'no-store' })
      const payload = await response.json().catch(() => ({}))
      if (response.status === 401) {
        router.push('/auth/login')
        return
      }
      if (!response.ok) throw new Error(payload?.error || 'Failed to load events')
      setEvents(Array.isArray(payload?.events) ? payload.events : [])
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const getEventPublicUrl = useCallback((event: EventItem) => {
    const code = event.short_code || event.event_code || event.id
    const base = typeof window !== 'undefined' ? window.location.origin : ''
    return `${base}/events/${code}`
  }, [])

  const downloadQr = useCallback(async (event: EventItem, label: string) => {
    const url = getEventPublicUrl(event)
    try {
      const dataUrl = await QRCode.toDataURL(url, { width: 512, margin: 2 })
      const link = document.createElement('a')
      link.href = dataUrl
      link.download = `${event.title.replace(/\s+/g, '-').toLowerCase()}-${label}-qr.png`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (err) {
      console.error('QR download failed', err)
    }
  }, [getEventPublicUrl])

  if (loading) {
    return (
      <div className="p-10">
        <div className="h-40 rounded-3xl bg-surface animate-pulse" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex-1 space-y-6 bg-background p-3 sm:p-4 md:space-y-10 md:p-8 lg:p-10">
      <div className="flex flex-col items-start justify-between gap-4 border-b border-border/60 pb-6 md:flex-row md:items-center md:gap-8 md:pb-8">
        <div className="flex-1">
          <h1 className="mb-2 text-2xl font-bold leading-tight text-foreground sm:text-3xl md:text-4xl">
            QR Codes
          </h1>
          <p className="text-sm text-foreground/50 md:text-base">
            Download QR codes for your events. Scanning takes users straight to the public page.
          </p>
        </div>
      </div>

      {events.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-border bg-white/2 p-8 text-center sm:p-12 md:p-16">
          <h3 className="mb-3 text-xl font-bold text-foreground sm:text-2xl">No Events Yet</h3>
          <p className="text-foreground/60 mb-8 max-w-md mx-auto leading-relaxed">
            Create an event first to generate QR codes for voting or ticketing.
          </p>
          <button
            onClick={() => router.push('/organizer/create-event')}
            className="px-8 py-3 rounded-xl font-semibold bg-gradient-to-br from-gold to-gold-deep text-gold-foreground hover:brightness-110 active:scale-[0.97] transition-all duration-200 shadow-lg"
          >
            Create Event
          </button>
        </div>
      )}

      {events.length > 0 && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {events.map((event) => {
            const publicUrl = getEventPublicUrl(event)
            const label = event.event_type === 'ticketing' ? 'ticketing' : 'voting'
            const badgeLabel = event.event_type === 'ticketing' ? 'Ticketing QR' : 'Voting QR'

            return (
              <div
                key={event.id}
                className="rounded-2xl bg-surface-card border border-border/60 overflow-hidden"
              >
                {event.image_url && (
                  <div className="relative h-36 w-full overflow-hidden sm:h-40">
                    <img src={event.image_url} alt={event.title} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
                  </div>
                )}
                <div className="p-4 md:p-5 space-y-4">
                  <div>
                    <h3 className="text-lg font-bold text-foreground truncate">{event.title}</h3>
                    <p className="text-xs text-foreground/50 mt-1 capitalize">
                      {event.event_type} · {event.status}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 text-foreground/40 text-xs">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>
                      {event.start_date ? new Date(event.start_date).toLocaleDateString() : 'No date'}
                      {event.end_date ? ` - ${new Date(event.end_date).toLocaleDateString()}` : ''}
                    </span>
                  </div>

                  <div className="rounded-xl border border-border bg-white/5 p-3 flex flex-col items-center gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-foreground/60">{badgeLabel}</p>
                    <QrCanvas url={publicUrl} id={`qr-${event.id}-${label}`} />
                    <button
                      onClick={() => downloadQr(event, label)}
                      className="flex items-center gap-1.5 text-xs font-medium text-gold hover:underline"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download PNG
                    </button>
                  </div>

                  <p className="text-[10px] break-all text-foreground/30 text-center">{publicUrl}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
