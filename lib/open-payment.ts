'use client'

function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(pointer: coarse)').matches
}

/**
 * Synchronously open a blank payment tab/window for touch/mobile devices so the
 * Paystack checkout URL can be loaded after an async fetch without losing the
 * user-gesture token. On desktop (fine-pointer) it returns null so callers can
 * keep the existing same-tab `window.location.href` behavior.
 */
export function openPaymentTab(): Window | null {
  if (typeof window === 'undefined') return null
  if (!isTouchDevice()) return null
  return window.open('about:blank', '_blank')
}

/**
 * Navigate to the Paystack checkout URL. On touch devices it loads the URL into
 * the tab opened by `openPaymentTab()`. On desktop it falls back to a same-tab
 * redirect. If the passed tab is null or popup blocked, it always falls back to
 * `window.location.href`.
 */
export function goToPaymentCheckout(
  url: string,
  paymentTab: Window | null
): void {
  if (paymentTab && !paymentTab.closed) {
    paymentTab.location.href = url
  } else {
    window.location.href = url
  }
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
