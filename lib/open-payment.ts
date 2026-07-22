'use client'

function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false
  // Require both a coarse pointer and no hover capability. This avoids treating
  // touchscreen laptops that also have a mouse/trackpad as mobile.
  return (
    window.matchMedia('(pointer: coarse)').matches &&
    window.matchMedia('(hover: none)').matches
  )
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
 * redirect.
 */
export function goToPaymentCheckout(
  url: string,
  paymentTab: Window | null
): void {
  if (paymentTab && !paymentTab.closed) {
    paymentTab.location.href = url
    return
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
