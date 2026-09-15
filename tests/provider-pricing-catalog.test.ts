import { describe, expect, it } from 'vitest'
import {
  OPENAI_ALLOWED_MODELS,
  OPENAI_DEFAULT_MODEL,
  PROVIDER_PRICING_CATALOG,
  ProviderPricingCatalogSchema,
  pricingEntriesFor,
  tariffStatus,
} from '@shared/provider-pricing-catalog'

describe('catálogo versionado de modelos y tarifas oficiales', () => {
  it('valida la versión, moneda, fuentes y fecha de revisión', () => {
    const catalog = ProviderPricingCatalogSchema.parse(PROVIDER_PRICING_CATALOG)

    expect(catalog.version).toBe('2026-09-16.2')
    expect(catalog.entries.every(entry => entry.currency === 'USD')).toBe(true)
    expect(catalog.entries.every(entry => entry.sourceUrl.startsWith('https://'))).toBe(true)
    expect(catalog.entries.every(entry => entry.sourceUrl.includes('openai.com')
      || entry.sourceUrl.includes('tavily.com')
      || entry.sourceUrl.includes('deepseek.com'))).toBe(true)
    expect(catalog.entries.every(entry => entry.reviewAfter > entry.verifiedAt)).toBe(true)
  })

  it('versiona la tarifa vigente de DeepSeek V4.1 Flash sin reescribir receipts históricos', () => {
    expect(pricingEntriesFor('deepseek', 'deepseek-flash')).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'deepseek-deepseek-flash-off-peak-2026-09-16',
        inputPerMillion: 0.15, cachedInputPerMillion: 0.003, outputPerMillion: 0.60,
        verifiedAt: '2026-09-16T00:00:00.000Z', reviewAfter: '2026-10-16T00:00:00.000Z',
      }),
      expect.objectContaining({
        id: 'deepseek-deepseek-flash-peak-2026-09-16',
        inputPerMillion: 0.30, cachedInputPerMillion: 0.006, outputPerMillion: 1.20,
      }),
    ]))
  })

  it('conserva Search, Extract basic/advanced y su coste por crédito', () => {
    const entries = pricingEntriesFor('tavily', 'search-and-extract')

    expect(entries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: expect.stringContaining('search-basic'),
        creditsPerRequest: 1,
        usdPerCredit: 0.008,
      }),
      expect.objectContaining({
        id: expect.stringContaining('search-advanced'),
        creditsPerRequest: 2,
        usdPerCredit: 0.008,
      }),
      expect.objectContaining({
        id: expect.stringContaining('extract-basic'),
        creditsPerFiveSuccessfulUrls: 1,
        usdPerCredit: 0.008,
      }),
      expect.objectContaining({
        id: expect.stringContaining('extract-advanced'),
        creditsPerFiveSuccessfulUrls: 2,
        usdPerCredit: 0.008,
      }),
    ]))
  })

  it('registra la revisión humana Tavily de 2026-09-14 durante 30 días', () => {
    const entries = pricingEntriesFor('tavily', 'search-and-extract')
    expect(entries).toHaveLength(4)
    expect(entries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        verifiedAt: '2026-09-14T00:00:00.000Z',
        reviewAfter: '2026-10-14T00:00:00.000Z',
        sourceUrl: 'https://www.tavily.com/pricing',
      }),
    ]))
    expect(entries.every(entry => tariffStatus(entry, new Date('2026-09-14T12:00:00.000Z')) === 'current')).toBe(true)
  })

  it('solo permite modelos OpenAI con tarifa explícita actual', () => {
    expect(OPENAI_DEFAULT_MODEL).toBe('gpt-5.6-luna')
    expect(OPENAI_ALLOWED_MODELS).toEqual([
      'gpt-5.6-luna',
      'gpt-5.6-terra',
      'gpt-5.6-sol',
    ])
    expect(pricingEntriesFor('openai', 'gpt-5.6-luna')).toEqual([
      expect.objectContaining({
        id: 'openai-gpt-5.6-luna-2026-09-16',
        inputPerMillion: 0.2,
        cachedInputPerMillion: 0.02,
        outputPerMillion: 1.2,
      }),
    ])
    expect(pricingEntriesFor('openai', 'modelo-no-permitido')).toEqual([])
  })

  it('caduca la tarifa al llegar su fecha de revisión', () => {
    const entry = PROVIDER_PRICING_CATALOG.entries[0]

    expect(tariffStatus(entry, new Date('2026-10-13T23:59:59.000Z'))).toBe('current')
    expect(tariffStatus(entry, new Date(entry.reviewAfter))).toBe('stale')
  })
})
