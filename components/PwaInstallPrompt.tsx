'use client'

import { useEffect, useState } from 'react'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const DISMISS_KEY = 'blakvote-pwa-install-dismissed'

function isAndroid() {
  if (typeof navigator === 'undefined') {
    return false
  }

  return /Android/i.test(navigator.userAgent)
}

export default function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service-worker.js').catch((error) => {
        console.warn('Service worker registration failed', error)
      })
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      const dismissed = window.localStorage.getItem(DISMISS_KEY) === 'true'

      if (dismissed || !isAndroid()) {
        return
      }

      setDeferredPrompt(event as BeforeInstallPromptEvent)
      setVisible(true)
    }

    const handleInstalled = () => {
      setDeferredPrompt(null)
      setVisible(false)
      window.localStorage.setItem(DISMISS_KEY, 'true')
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  if (!visible || !deferredPrompt) {
    return null
  }

  const installApp = async () => {
    await deferredPrompt.prompt()
    const choice = await deferredPrompt.userChoice

    if (choice.outcome === 'accepted') {
      setVisible(false)
      setDeferredPrompt(null)
      return
    }

    setVisible(false)
  }

  const dismiss = () => {
    setVisible(false)
    window.localStorage.setItem(DISMISS_KEY, 'true')
  }

  return (
    <div className="fixed inset-x-3 bottom-3 z-[60] sm:inset-x-auto sm:right-4 sm:w-[360px]">
      <div className="rounded-2xl border border-[hsl(var(--gold))]/35 bg-[hsl(var(--legacy-bg-card))]/95 p-4 shadow-[0_18px_60px_hsl(var(--foreground)/0.28)] backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[hsl(var(--gold))]">Install BlakVote</p>
        <p className="mt-2 text-sm text-foreground/85">
          Add this app to your Android home screen for faster offline access.
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={dismiss}
            className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={installApp}
            className="flex-1 rounded-xl bg-[hsl(var(--gold))] px-3 py-2 text-sm font-semibold text-black"
          >
            Install
          </button>
        </div>
      </div>
    </div>
  )
}
