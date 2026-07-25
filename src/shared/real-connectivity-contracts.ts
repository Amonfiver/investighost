import { z } from 'zod'

export const REAL_CONNECTIVITY_CONFIRMATION =
  'AUTORIZO 1 TAVILY SEARCH BASIC Y 1 OPENAI GPT-5.6-LUNA, MÁXIMO 0,02 EUR, SIN MORELLA NI PUBLICACIÓN'

export const REAL_CONNECTIVITY_FX_POLICY = {
  version: 'connectivity-fx-2026-07-25.1',
  effectiveFrom: '2026-07-25T00:00:00.000+02:00',
  reviewedAt: '2026-07-25T00:00:00.000+02:00',
  sourceCurrency: 'USD',
  targetCurrency: 'EUR',
  purpose: 'Reserva conservadora y conciliación sencilla de la prueba mínima',
  source: 'Decisión humana conservadora de presupuesto; no es un tipo bancario',
  usdToEur: 1,
} as const

export const REAL_CONNECTIVITY_POLICY = {
  version: 'connectivity-check-2026-07-25.1',
  budgetEur: 0.02,
  currency: 'EUR',
  maxProviderCalls: 2,
  maxConcurrency: 1,
  maxRounds: 0,
  maxRegenerations: 0,
  maxRetries: 0,
  tavily: {
    providerId: 'tavily',
    model: 'search-and-extract',
    operation: 'search',
    query: 'official website Morella Spain',
    searchDepth: 'basic',
    maxResults: 1,
    reserveEur: 0.008,
    includeAnswer: false,
    includeRawContent: false,
    includeImages: false,
    autoParameters: false,
  },
  openai: {
    providerId: 'openai',
    model: 'gpt-5.6-luna',
    operation: 'responses',
    prompt: 'Responde únicamente con: CONEXION_OPENAI_OK',
    expectedOutput: 'CONEXION_OPENAI_OK',
    maxOutputTokens: 16,
    reserveEur: 0.012,
    store: false,
    tools: 0,
    reasoningEffort: 'none',
  },
} as const

export const RealConnectivityAuthorizationSchema = z.object({
  humanConfirmation: z.literal(REAL_CONNECTIVITY_CONFIRMATION),
  morellaExecutionRequested: z.literal(false),
  publicationRequested: z.literal(false),
  automaticRequested: z.literal(false),
  trawelRequested: z.literal(false),
})

const PublicIdentifierSchema = z.string().trim().min(1).max(160)
const HttpsUrlSchema = z.string().url().refine(value => new URL(value).protocol === 'https:')

export const RealConnectivityCallResultSchema = z.object({
  providerId: z.enum(['tavily', 'openai']),
  status: z.enum(['succeeded', 'failed', 'unknown']),
  remoteIdMask: z.string().trim().min(1).max(32).optional(),
  durationMs: z.number().int().nonnegative(),
  credits: z.number().nonnegative().default(0),
  inputTokens: z.number().int().nonnegative().default(0),
  cachedInputTokens: z.number().int().nonnegative().default(0),
  outputTokens: z.number().int().nonnegative().default(0),
  estimatedCostEur: z.number().positive(),
  costUsd: z.number().nonnegative().optional(),
  costEur: z.number().nonnegative().optional(),
  url: HttpsUrlSchema.optional(),
  domain: z.string().trim().min(1).max(253).optional(),
  expectedOutputMatched: z.boolean().optional(),
  errorCode: PublicIdentifierSchema.optional(),
  errorMessage: z.string().trim().min(1).max(500).optional(),
})

export const RealConnectivityAuditSchema = z.object({
  providerCalls: z.number().int().nonnegative(),
  reservations: z.number().int().nonnegative(),
  pendingReservations: z.number().int().nonnegative(),
  reservedEur: z.number().nonnegative(),
  spentEur: z.number().nonnegative(),
  remainingEur: z.number().nonnegative(),
  guardFree: z.boolean(),
})

export const RealConnectivityResultSchema = z.object({
  executionId: PublicIdentifierSchema,
  status: z.enum(['succeeded', 'failed', 'unknown', 'blocked']),
  startedAt: z.string().datetime({ offset: true }),
  completedAt: z.string().datetime({ offset: true }),
  policyVersion: z.literal(REAL_CONNECTIVITY_POLICY.version),
  conversionVersion: z.literal(REAL_CONNECTIVITY_FX_POLICY.version),
  conversionRate: z.literal(1),
  calls: z.array(RealConnectivityCallResultSchema).max(2),
  audit: RealConnectivityAuditSchema,
  errorCode: PublicIdentifierSchema.optional(),
  errorMessage: z.string().trim().min(1).max(500).optional(),
  researchExecuted: z.literal(false),
  publicationCount: z.literal(0),
  automaticEnabled: z.literal(false),
  trawelConnected: z.literal(false),
})

export type RealConnectivityAuthorization = z.infer<
  typeof RealConnectivityAuthorizationSchema
>
export type RealConnectivityCallResult = z.infer<
  typeof RealConnectivityCallResultSchema
>
export type RealConnectivityAudit = z.infer<typeof RealConnectivityAuditSchema>
export type RealConnectivityResult = z.infer<typeof RealConnectivityResultSchema>
