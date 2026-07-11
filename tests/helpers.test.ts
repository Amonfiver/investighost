import { describe, expect, it } from 'vitest'
import { formatDate, generateId, isValidUrl, truncate } from '@utils/helpers'

describe('shared helpers', () => {
  it('generates non-empty, distinct identifiers', () => {
    const first = generateId()
    const second = generateId()

    expect(first).not.toBe('')
    expect(second).not.toBe(first)
  })

  it('truncates only text over the requested length', () => {
    expect(truncate('corto', 10)).toBe('corto')
    expect(truncate('texto demasiado largo', 8)).toBe('texto de...')
  })

  it('distinguishes valid absolute URLs', () => {
    expect(isValidUrl('https://example.com/path')).toBe(true)
    expect(isValidUrl('not a url')).toBe(false)
  })

  it('formats dates for the Spanish locale', () => {
    expect(formatDate(new Date(2026, 6, 11))).toContain('2026')
  })
})
