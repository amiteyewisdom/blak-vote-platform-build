'use client'

function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(pointer: coarse)').matches
}

/**
 * Synchronously open a payment tab/window for touch/mobile devices so the
 * Paystack checkout URL can be loaded after an async fetch without losing the
 * user-gesture token. On desktop (fine-pointer) it returns null so callers can
 * keep the existing same-tab `window.location.href` behavior.
 */
export function openPaymentTab(): Window | null {
  if (typeof window === 'undefined') return null
  if (!isTouchDevice()) return null

  // Omitting 'about:blank' and using an empty URL is more reliable on iOS Safari.
  return window.open('', '_blank')
}

/**
 * Navigate to the Paystack checkout URL. On touch devices it loads the URL into
 * the tab opened by `openPaymentTab()`. On desktop it falls back to a same-tab
 * redirect. If the opened tab cannot be navigated (e.g. in-app browser blocks
 * it), we fall back to an anchor click, and finally a same-tab redirect.
 */
export function goToPaymentCheckout(
  url: string,
  paymentTab: Window | null
): void {
  // Try to navigate the tab that was opened synchronously in the click handler.
  if (paymentTab && !paymentTab.closed) {
    try {
      const before = paymentTab.location.href
      paymentTab.location.href = url
      if (paymentTab.location.href !== before) {
        return
      }
    } catch {
      // Ignore cross-origin read/write errors.
    }
    // The tab did not accept navigation; close it before falling back.
    closePaymentTab(paymentTab)
  }

  // For touch/mobile, a real anchor click has better success escaping in-app
  // browsers and Safari popup blockers than window.location.href.
  if (isTouchDevice()) {
    try {
      const a = document.createElement('a')
      a.href = url
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      a.style.position = 'fixed'
      a.style.top = '0'
      a.style.left = '0'
      a.style.opacity = '0'
      a.style.pointerEvents = 'none'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      return
    } catch {
      // Ignore and fall through to the final same-tab redirect.
    }
  }

  window.location.href = url
}

/**
 * Close a payment tab that was opened but no longer needed (e.g. validation or
 * API failed). Safe to call with null or an already-closed window.
 */
export function closePaymentTab(paymentTab: Window | null): void {
  if (paymentTab && !paymentTab.closed) {
    try {
      paymentTab.close()
    } catch {
      // Ignore cross-origin or already-closed errors.
    }
  }
}
