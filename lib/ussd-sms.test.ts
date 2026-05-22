import { describe, expect, it } from 'vitest'

function isSmsResponseSuccessful(status: number, responseText: string) {
  if (!status || status < 200 || status >= 300) {
    return false
  }

  const normalized = String(responseText || '').trim().toLowerCase()
  if (!normalized) {
    return true
  }

  if (/(^|\b)(success|successful|sent|accepted|queued|ok)(\b|$)/.test(normalized)) {
    return true
  }

  return !/(error|failed|invalid|unauthorized|denied|rejected)/.test(normalized)
}

describe('Nalo SMS response parsing', () => {
  it('accepts empty 200 responses', () => {
    expect(isSmsResponseSuccessful(200, '')).toBe(true)
  })

  it('accepts explicit success bodies', () => {
    expect(isSmsResponseSuccessful(200, 'Message sent successfully')).toBe(true)
  })

  it('rejects error bodies even on 200', () => {
    expect(isSmsResponseSuccessful(200, 'Invalid key')).toBe(false)
  })
})
