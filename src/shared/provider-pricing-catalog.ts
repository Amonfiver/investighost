import { z } from 'zod'

const TimestampSchema = z.string().datetime({ offset: true })
const HttpsUrlSchema = z.string().url().refine(value => new URL(value).protocol === 'https:')

export const ProviderTariffStatusSchema = z.enum(['current', 'stale', 'unverified'])

export const ProviderPricingEntrySchema = z.object({
  id: z.string().trim().min(1).max(160),
  providerId: z.enum(['tavily', 'openai', 'deepseek']),
  product: z.string().trim().min(1).max(160),
  model: z.string().trim().min(1).max(160),
  snapshot: z.string().trim().min(1).max(160).optional(),
  operation: z.enum(['search', 'extract', 'responses']),
  currency: z.literal('USD'),
  inputPerMillion: z.number().nonnegative().optional(),
  cachedInputPerMillion: z.number().nonnegative().optional(),
  outputPerMillion: z.number().nonnegative().optional(),
  usdPerCredit: z.number().nonnegative().optional(),
  creditsPerRequest: z.number().nonnegative().optional(),
  creditsPerFiveSuccessfulUrls: z.number().nonnegative().optional(),
  effectiveFrom: TimestampSchema,
  verifiedAt: TimestampSchema,
  reviewAfter: TimestampSchema,
  sourceUrl: HttpsUrlSchema,
  verified: z.boolean(),
  timeBand: z.enum(['peak', 'off_peak']).optional(),
}).superRefine((entry, context) => {
  if (entry.operation === 'responses') {
    for (const field of ['inputPerMillion', 'cachedInputPerMillion', 'outputPerMillion'] as const) {
      if (entry[field] === undefined) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: 'Precio token requerido' })
      }
    }
  } else if (entry.usdPerCredit === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['usdPerCredit'], message: 'Precio por crédito requerido' })
  }
})

export const ProviderPricingCatalogSchema = z.object({
  version: z.string().regex(/^\d{4}-\d{2}-\d{2}\.\d+$/),
  publishedAt: TimestampSchema,
  entries: z.array(ProviderPricingEntrySchema).min(1),
})

export type ProviderPricingEntry = z.infer<typeof ProviderPricingEntrySchema>
export type ProviderPricingCatalog = z.infer<typeof ProviderPricingCatalogSchema>
export type ProviderTariffStatus = z.infer<typeof ProviderTariffStatusSchema>

export const PROVIDER_PRICING_CATALOG = ProviderPricingCatalogSchema.parse({
  version: '2026-09-14.1',
  publishedAt: '2026-09-14T00:00:00.000Z',
  entries: [
    {
      id: 'tavily-search-basic-2026-07-25',
      providerId: 'tavily',
      product: 'Tavily Search basic',
      model: 'search-and-extract',
      operation: 'search',
      currency: 'USD',
      usdPerCredit: 0.008,
      creditsPerRequest: 1,
      effectiveFrom: '2026-07-25T00:00:00.000+02:00',
      verifiedAt: '2026-07-25T00:00:00.000+02:00',
      reviewAfter: '2026-08-25T00:00:00.000+02:00',
      sourceUrl: 'https://docs.tavily.com/documentation/api-credits',
      verified: true,
    },
    {
      id: 'deepseek-deepseek-flash-off-peak-2026-08-16',
      providerId: 'deepseek',
      product: 'DeepSeek Responses API V4.1 Flash',
      model: 'deepseek-flash',
      operation: 'responses',
      currency: 'USD',
      inputPerMillion: 0.22,
      cachedInputPerMillion: 0.007,
      outputPerMillion: 0.66,
      timeBand: 'off_peak',
      effectiveFrom: '2026-08-16T16:00:00.000Z',
      verifiedAt: '2026-09-14T00:00:00.000Z',
      reviewAfter: '2026-10-14T00:00:00.000Z',
      sourceUrl: 'https://api-docs.deepseek.com/quick_start/pricing/',
      verified: true,
    },
    {
      id: 'deepseek-deepseek-flash-peak-2026-08-16',
      providerId: 'deepseek',
      product: 'DeepSeek Responses API V4.1 Flash',
      model: 'deepseek-flash',
      operation: 'responses',
      currency: 'USD',
      inputPerMillion: 0.44,
      cachedInputPerMillion: 0.014,
      outputPerMillion: 1.32,
      timeBand: 'peak',
      effectiveFrom: '2026-08-16T16:00:00.000Z',
      verifiedAt: '2026-09-14T00:00:00.000Z',
      reviewAfter: '2026-10-14T00:00:00.000Z',
      sourceUrl: 'https://api-docs.deepseek.com/quick_start/pricing/',
      verified: true,
    },
    {
      id: 'tavily-search-advanced-2026-07-25',
      providerId: 'tavily',
      product: 'Tavily Search advanced',
      model: 'search-and-extract',
      operation: 'search',
      currency: 'USD',
      usdPerCredit: 0.008,
      creditsPerRequest: 2,
      effectiveFrom: '2026-07-25T00:00:00.000+02:00',
      verifiedAt: '2026-07-25T00:00:00.000+02:00',
      reviewAfter: '2026-08-25T00:00:00.000+02:00',
      sourceUrl: 'https://docs.tavily.com/documentation/api-credits',
      verified: true,
    },
    {
      id: 'tavily-extract-basic-2026-07-25',
      providerId: 'tavily',
      product: 'Tavily Extract basic',
      model: 'search-and-extract',
      operation: 'extract',
      currency: 'USD',
      usdPerCredit: 0.008,
      creditsPerFiveSuccessfulUrls: 1,
      effectiveFrom: '2026-07-25T00:00:00.000+02:00',
      verifiedAt: '2026-07-25T00:00:00.000+02:00',
      reviewAfter: '2026-08-25T00:00:00.000+02:00',
      sourceUrl: 'https://docs.tavily.com/documentation/api-credits',
      verified: true,
    },
    {
      id: 'tavily-extract-advanced-2026-07-25',
      providerId: 'tavily',
      product: 'Tavily Extract advanced',
      model: 'search-and-extract',
      operation: 'extract',
      currency: 'USD',
      usdPerCredit: 0.008,
      creditsPerFiveSuccessfulUrls: 2,
      effectiveFrom: '2026-07-25T00:00:00.000+02:00',
      verifiedAt: '2026-07-25T00:00:00.000+02:00',
      reviewAfter: '2026-08-25T00:00:00.000+02:00',
      sourceUrl: 'https://docs.tavily.com/documentation/api-credits',
      verified: true,
    },
    {
      id: 'openai-gpt-5.6-luna-2026-07-25',
      providerId: 'openai',
      product: 'OpenAI Responses API',
      model: 'gpt-5.6-luna',
      operation: 'responses',
      currency: 'USD',
      inputPerMillion: 1,
      cachedInputPerMillion: 0.1,
      outputPerMillion: 6,
      effectiveFrom: '2026-07-25T00:00:00.000+02:00',
      verifiedAt: '2026-07-25T00:00:00.000+02:00',
      reviewAfter: '2026-08-25T00:00:00.000+02:00',
      sourceUrl: 'https://developers.openai.com/api/docs/models/gpt-5.6-luna',
      verified: true,
    },
    {
      id: 'openai-gpt-5.6-terra-2026-07-25',
      providerId: 'openai',
      product: 'OpenAI Responses API',
      model: 'gpt-5.6-terra',
      operation: 'responses',
      currency: 'USD',
      inputPerMillion: 2.5,
      cachedInputPerMillion: 0.25,
      outputPerMillion: 15,
      effectiveFrom: '2026-07-25T00:00:00.000+02:00',
      verifiedAt: '2026-07-25T00:00:00.000+02:00',
      reviewAfter: '2026-08-25T00:00:00.000+02:00',
      sourceUrl: 'https://developers.openai.com/api/docs/models/compare',
      verified: true,
    },
    {
      id: 'openai-gpt-5.6-sol-2026-07-25',
      providerId: 'openai',
      product: 'OpenAI Responses API',
      model: 'gpt-5.6-sol',
      operation: 'responses',
      currency: 'USD',
      inputPerMillion: 5,
      cachedInputPerMillion: 0.5,
      outputPerMillion: 30,
      effectiveFrom: '2026-07-25T00:00:00.000+02:00',
      verifiedAt: '2026-07-25T00:00:00.000+02:00',
      reviewAfter: '2026-08-25T00:00:00.000+02:00',
      sourceUrl: 'https://developers.openai.com/api/docs/models/compare',
      verified: true,
    },
  ],
})

export const OPENAI_ALLOWED_MODELS = ['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol'] as const
export const OPENAI_DEFAULT_MODEL = OPENAI_ALLOWED_MODELS[0]
export const DEEPSEEK_ALLOWED_MODELS = ['deepseek-flash'] as const
export const DEEPSEEK_DEFAULT_MODEL = DEEPSEEK_ALLOWED_MODELS[0]

export function pricingEntriesFor(
  providerId: string,
  model: string,
  catalog: ProviderPricingCatalog = PROVIDER_PRICING_CATALOG,
): ProviderPricingEntry[] {
  return catalog.entries.filter(entry => entry.providerId === providerId && entry.model === model)
}

export function tariffStatus(
  entry: ProviderPricingEntry,
  now: Date,
): ProviderTariffStatus {
  if (!entry.verified) return 'unverified'
  return now.getTime() < new Date(entry.reviewAfter).getTime() ? 'current' : 'stale'
}

export function deepSeekPricingBand(now: Date): 'peak' | 'off_peak' {
  const weekday = now.getUTCDay()
  if (weekday === 0 || weekday === 6) return 'off_peak'
  const hour = now.getUTCHours()
  return (hour >= 1 && hour < 4) || (hour >= 6 && hour < 10) ? 'peak' : 'off_peak'
}

export function pricingEntryAt(
  providerId: string,
  model: string,
  now: Date,
  catalog: ProviderPricingCatalog = PROVIDER_PRICING_CATALOG,
): ProviderPricingEntry | undefined {
  const entries = pricingEntriesFor(providerId, model, catalog)
  if (providerId === 'deepseek') {
    return entries.find(entry => entry.timeBand === deepSeekPricingBand(now))
  }
  return entries.find(entry => entry.operation === 'responses') ?? entries[0]
}

export function pricingSummary(entries: ProviderPricingEntry[]): string {
  const deepSeekPeak = entries.find(entry => entry.timeBand === 'peak')
  const deepSeekOffPeak = entries.find(entry => entry.timeBand === 'off_peak')
  if (deepSeekPeak && deepSeekOffPeak) {
    return `DeepSeek peak/off-peak: $${deepSeekPeak.inputPerMillion}/$${deepSeekPeak.cachedInputPerMillion}/$${deepSeekPeak.outputPerMillion}; $${deepSeekOffPeak.inputPerMillion}/$${deepSeekOffPeak.cachedInputPerMillion}/$${deepSeekOffPeak.outputPerMillion} por 1M entrada/cache/salida`
  }
  const responses = entries.find(entry => entry.operation === 'responses')
  if (responses) {
    return `$${responses.inputPerMillion}/$${responses.cachedInputPerMillion}/$${responses.outputPerMillion} por 1M tokens entrada/cache/salida`
  }
  const searchBasic = entries.find(entry => entry.id.includes('search-basic'))
  const searchAdvanced = entries.find(entry => entry.id.includes('search-advanced'))
  const extractBasic = entries.find(entry => entry.id.includes('extract-basic'))
  const extractAdvanced = entries.find(entry => entry.id.includes('extract-advanced'))
  if (searchBasic && searchAdvanced && extractBasic && extractAdvanced) {
    return `${searchBasic.creditsPerRequest}/${searchAdvanced.creditsPerRequest} créditos Search basic/advanced; ${extractBasic.creditsPerFiveSuccessfulUrls}/${extractAdvanced.creditsPerFiveSuccessfulUrls} por 5 Extract`
  }
  return 'Tarifa no verificada'
}
