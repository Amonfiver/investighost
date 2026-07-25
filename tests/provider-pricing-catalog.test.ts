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

    expect(catalog.version).toBe('2026-07-25.1')
    expect(catalog.entries.every(entry => entry.currency === 'USD')).toBe(true)
    expect(catalog.entries.every(entry => entry.sourceUrl.startsWith('https://'))).toBe(true)
    expect(catalog.entries.every(entry => entry.sourceUrl.includes('openai.com')
      || entry.sourceUrl.includes('tavily.com'))).toBe(true)
    expect(catalog.entries.every(entry => entry.reviewAfter > entry.verifiedAt)).toBe(true)
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

  it('solo permite modelos OpenAI con tarifa explícita actual', () => {
    expect(OPENAI_DEFAULT_MODEL).toBe('gpt-5.6-luna')
    expect(OPENAI_ALLOWED_MODELS).toEqual([
      'gpt-5.6-luna',
      'gpt-5.6-terra',
      'gpt-5.6-sol',
    ])
    expect(pricingEntriesFor('openai', 'gpt-5.6-luna')).toEqual([
      expect.objectContaining({
        inputPerMillion: 1,
        cachedInputPerMillion: 0.1,
        outputPerMillion: 6,
      }),
    ])
    expect(pricingEntriesFor('openai', 'modelo-no-permitido')).toEqual([])
  })

  it('caduca la tarifa al llegar su fecha de revisión', () => {
    const entry = PROVIDER_PRICING_CATALOG.entries[0]

    expect(tariffStatus(entry, new Date('2026-08-24T23:59:59.000+02:00'))).toBe('current')
    expect(tariffStatus(entry, new Date(entry.reviewAfter))).toBe('stale')
  })
})
