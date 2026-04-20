'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import jsQR from 'jsqr'
import { ArrowLeft, Camera, CameraOff, KeyRound, Loader2 } from 'lucide-react'

type ScanStatus = 'idle' | 'scanning' | 'loading' | 'valid' | 'used' | 'invalid'

type ScanResult = {
  status: ScanStatus
  code?: string
  buyerName?: string | null
  buyerEmail?: string | null
  usedAt?: string | null
  message?: string
}

const STATUS_STYLES: Record<string, string> = {
  valid: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  used: 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  invalid: 'border-destructive/50 bg-destructive/10 text-destructive',
  loading: 'border-border bg-secondary/40 text-muted-foreground',
}

const STATUS_ICON: Record<string, string> = {
  valid: '✅',
  used: '⚠️',
  invalid: '❌',
}

const SCAN_COOLDOWN_MS = 2500

export default function TicketScanPage() {
  const params = useParams()
  const router = useRouter()
  const eventId = String(params?.eventId || '')

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number>(0)
  const lastScanRef = useRef<number>(0)
  const lastCodeRef = useRef<string>('')

  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [scanCount, setScanCount] = useState(0)

  // Manual code input fallback
  const [manualCode, setManualCode] = useState('')
  const [manualBusy, setManualBusy] = useState(false)

  // Extract ticket code from a QR payload.
  // Accepts: raw ticket code ("ABCDEF"), or a verify URL (?code=ABCDEF).
  function extractTicketCode(payload: string): string {
    const trimmed = payload.trim().toUpperCase()

    try {
      const url = new URL(payload)
      const code = url.searchParams.get('code')
      if (code) return code.trim().toUpperCase()
    } catch {
      // not a URL — treat raw value as code
    }

    // If it already looks like a code, use it directly.
    if (/^[A-Z0-9]{6,32}$/.test(trimmed)) {
      return trimmed
    }

    return ''
  }

  const verifyAndMark = useCallback(async (rawCode: string) => {
    const code = extractTicketCode(rawCode)
    if (!code) {
      setResult({ status: 'invalid', message: 'Unrecognised QR code.' })
      return
    }

    setResult({ status: 'loading', code })

    try {
      const res = await fetch('/api/tickets/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })

      const payload = await res.json()

      if (res.status === 409 && payload.error?.includes('already been used')) {
        // Fetch details for the used ticket
        const getRes = await fetch(`/api/tickets/verify?code=${encodeURIComponent(code)}`)
        const getPayload = await getRes.json()
        setResult({
          status: 'used',
          code,
          buyerName: getPayload.ticket?.buyer_name ?? null,
          buyerEmail: getPayload.ticket?.buyer_email ?? null,
          usedAt: getPayload.ticket?.used_at ?? null,
          message: 'Ticket already used.',
        })
        return
      }

      if (!res.ok) {
        setResult({
          status: res.status === 404 ? 'invalid' : 'invalid',
          code,
          message: payload.error || 'Ticket is invalid.',
        })
        return
      }

      setScanCount((n) => n + 1)
      setResult({
        status: 'valid',
        code,
        buyerName: payload.ticket?.buyer_name ?? null,
        buyerEmail: payload.ticket?.buyer_email ?? null,
        message: 'Ticket validated and marked as used.',
      })
    } catch {
      setResult({ status: 'invalid', code, message: 'Verification request failed.' })
    }
  }, [])

  // Camera scanning loop using jsQR
  const tick = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current

    if (!video || !canvas || video.readyState < video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(tick)
      return
    }

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) {
      rafRef.current = requestAnimationFrame(tick)
      return
    }

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const qr = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert',
    })

    if (qr?.data) {
      const now = Date.now()
      const isDuplicate = qr.data === lastCodeRef.current && now - lastScanRef.current < SCAN_COOLDOWN_MS

      if (!isDuplicate) {
        lastCodeRef.current = qr.data
        lastScanRef.current = now
        void verifyAndMark(qr.data)
      }
    }

    rafRef.current = requestAnimationFrame(tick)
  }, [verifyAndMark])

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setCameraActive(false)
  }, [])

  const startCamera = useCallback(async () => {
    setCameraError(null)
    setResult(null)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })

      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      setCameraActive(true)
      rafRef.current = requestAnimationFrame(tick)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Camera access denied'
      setCameraError(message.includes('Permission') || message.includes('denied')
        ? 'Camera permission denied. Please allow camera access and try again.'
        : message.includes('NotFound')
          ? 'No camera found on this device.'
          : 'Unable to access camera: ' + message)
    }
  }, [tick])

  // Clean up on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const submitManual = async () => {
    if (!manualCode.trim()) return
    setManualBusy(true)
    setResult(null)
    await verifyAndMark(manualCode.trim())
    setManualBusy(false)
    setManualCode('')
  }

  const currentStatusStyle = result
    ? (STATUS_STYLES[result.status] ?? STATUS_STYLES.invalid)
    : 'border-border bg-secondary/30 text-muted-foreground'

  return (
    <div className="min-h-screen p-4 md:p-8 text-foreground space-y-6">
      <button
        onClick={() => {
          stopCamera()
          router.back()
        }}
        className="inline-flex items-center gap-2 text-foreground/70 hover:text-foreground"
      >
        <ArrowLeft size={16} /> Back to Tickets
      </button>

      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Ticket Scanner</h1>
        <p className="text-muted-foreground">Point the camera at an attendee&apos;s QR code. Each scan validates and marks the ticket as used immediately.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr,1fr] max-w-4xl">
        {/* Camera panel */}
        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-2xl border border-border bg-black aspect-[4/3]">
            <video
              ref={videoRef}
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            {/* Hidden canvas for frame analysis */}
            <canvas ref={canvasRef} className="hidden" />

            {!cameraActive && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80">
                <CameraOff className="h-10 w-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Camera inactive</p>
              </div>
            )}

            {cameraActive && (
              /* Targeting reticle */
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-48 h-48 border-2 border-[hsl(var(--gold))] rounded-xl opacity-70" />
              </div>
            )}
          </div>

          <div className="flex gap-3">
            {!cameraActive ? (
              <button
                onClick={() => void startCamera()}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[hsl(var(--gold))] to-[hsl(var(--gold-deep))] px-4 py-3 font-semibold text-black hover:brightness-110 active:scale-[0.97] transition-all"
              >
                <Camera size={18} />
                Start Scanner
              </button>
            ) : (
              <button
                onClick={stopCamera}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 font-semibold text-foreground hover:bg-secondary/60 transition-colors"
              >
                <CameraOff size={18} />
                Stop Scanner
              </button>
            )}
          </div>

          {cameraError && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {cameraError}
            </div>
          )}

          {scanCount > 0 && (
            <p className="text-xs text-muted-foreground text-center">{scanCount} ticket{scanCount === 1 ? '' : 's'} validated this session</p>
          )}
        </div>

        {/* Result + Manual fallback */}
        <div className="space-y-4">
          {/* Scan result */}
          <div className={`min-h-[200px] rounded-2xl border p-5 transition-colors ${currentStatusStyle}`}>
            {!result && (
              <div className="h-full flex flex-col items-center justify-center gap-2 text-center">
                <Camera className="h-8 w-8 opacity-40" />
                <p className="text-sm">Awaiting scan…</p>
              </div>
            )}

            {result?.status === 'loading' && (
              <div className="flex flex-col items-center justify-center gap-3 text-center h-full py-4">
                <Loader2 className="h-8 w-8 animate-spin" />
                <p className="text-sm font-medium">Verifying {result.code}…</p>
              </div>
            )}

            {result && result.status !== 'loading' && result.status !== 'idle' && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{STATUS_ICON[result.status] ?? '❌'}</span>
                  <p className="text-base font-semibold">
                    {result.status === 'valid' ? 'Valid Ticket' : result.status === 'used' ? 'Already Used' : 'Invalid Ticket'}
                  </p>
                </div>

                {result.code && (
                  <p className="font-mono text-sm tracking-wider">{result.code}</p>
                )}

                {result.message && (
                  <p className="text-sm">{result.message}</p>
                )}

                {result.buyerName && (
                  <p className="text-sm">Buyer: <span className="font-medium">{result.buyerName}</span></p>
                )}

                {result.buyerEmail && (
                  <p className="text-sm">Email: <span className="font-medium">{result.buyerEmail}</span></p>
                )}

                {result.usedAt && (
                  <p className="text-xs">
                    Used: {new Date(result.usedAt).toLocaleString()}
                  </p>
                )}

                <button
                  onClick={() => setResult(null)}
                  className="mt-2 rounded-lg border border-current/20 px-3 py-1.5 text-xs font-medium hover:opacity-80 transition-opacity"
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          {/* Manual code input */}
          <div className="rounded-2xl border border-border p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <KeyRound size={15} />
              Manual Entry
            </div>
            <p className="text-xs text-muted-foreground">Type or paste a ticket code if the camera is unavailable.</p>
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-xl border border-border bg-secondary/30 px-3 py-2 text-sm font-mono uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold))] focus:ring-offset-2 focus:ring-offset-background"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => { if (e.key === 'Enter') void submitManual() }}
                placeholder="TICKET CODE"
                maxLength={32}
              />
              <button
                onClick={() => void submitManual()}
                disabled={manualBusy || !manualCode.trim()}
                className="rounded-xl bg-gradient-to-br from-[hsl(var(--gold))] to-[hsl(var(--gold-deep))] px-4 py-2 text-sm font-semibold text-black hover:brightness-110 active:scale-[0.97] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {manualBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verify'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
