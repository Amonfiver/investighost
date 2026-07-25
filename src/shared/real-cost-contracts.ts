import { z } from 'zod'

const IdentifierSchema = z.string().trim().min(1).max(160)
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const CurrencySchema = z.string().regex(/^[A-Z]{3}$/)
const MoneySchema = z.number().nonnegative().max(100_000)

export const ProviderCallStateSchema = z.enum([
  'reserved',
  'started',
  'succeeded',
  'failed',
  'cancelled',
  'unknown',
])

export const ProviderReservationStateSchema = z.enum([
  'reserved',
  'started',
  'reconciled',
  'failed',
  'cancelled',
  'unknown',
])

export const RealBudgetLimitsSchema = z.object({
  task: MoneySchema,
  batch: MoneySchema,
  daily: MoneySchema,
  currency: CurrencySchema,
}).superRefine((value, context) => {
  if (value.task > value.batch) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['task'], message: 'La tarea no puede superar el lote' })
  }
  if (value.batch > value.daily) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['batch'], message: 'El lote no puede superar el límite diario' })
  }
})

export const ProviderCallReservationInputSchema = z.object({
  idempotencyKey: IdentifierSchema,
  executionId: IdentifierSchema,
  requestId: IdentifierSchema,
  runId: IdentifierSchema,
  taskId: IdentifierSchema,
  batchId: IdentifierSchema,
  stage: IdentifierSchema,
  operation: IdentifierSchema,
  providerId: IdentifierSchema,
  model: IdentifierSchema,
  attempt: z.number().int().min(1).max(10),
  retryOfCallId: IdentifierSchema.optional(),
  estimatedCost: MoneySchema.positive(),
  currency: CurrencySchema,
  tariffId: IdentifierSchema,
  promptVersion: IdentifierSchema,
  schemaVersion: IdentifierSchema,
  inputHash: Sha256Schema,
})

export const ProviderCallUsageSchema = z.object({
  remoteId: IdentifierSchema.optional(),
  inputTokens: z.number().int().nonnegative().default(0),
  outputTokens: z.number().int().nonnegative().default(0),
  toolCalls: z.number().int().nonnegative().default(0),
  credits: z.number().nonnegative().default(0),
  outputHash: Sha256Schema.optional(),
})

export const ProviderCallSettlementSchema = z.object({
  reservationId: IdentifierSchema,
  outcome: z.enum(['succeeded', 'failed', 'cancelled', 'unknown']),
  calculatedCost: MoneySchema.optional(),
  usage: ProviderCallUsageSchema,
  sanitizedError: z.string().trim().min(1).max(500).refine(
    value => !/(?:sk-|tvly-|api[_ -]?key|authorization|bearer\s)/i.test(value),
    'El error debe estar sanitizado',
  ).optional(),
}).superRefine((value, context) => {
  if (value.outcome === 'succeeded' && value.calculatedCost === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['calculatedCost'], message: 'Una llamada conciliada requiere coste' })
  }
  if (value.outcome === 'unknown' && value.calculatedCost !== undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['calculatedCost'], message: 'Un resultado ambiguo no puede conciliar coste' })
  }
})

export interface ProviderCallReservation {
  id: string
  callId: string
  input: z.infer<typeof ProviderCallReservationInputSchema>
  state: z.infer<typeof ProviderReservationStateSchema>
  reservedCost: number
  calculatedCost?: number
  createdAt: string
  updatedAt: string
}

export interface ProviderCallLedgerEntry {
  sequence: number
  callId: string
  reservationId: string
  state: z.infer<typeof ProviderCallStateSchema>
  attempt: number
  retryOfCallId?: string
  estimatedCost: number
  reservedCost: number
  calculatedCost?: number
  currency: string
  remoteId?: string
  inputTokens: number
  outputTokens: number
  toolCalls: number
  credits: number
  sanitizedError?: string
  promptVersion: string
  schemaVersion: string
  inputHash: string
  outputHash?: string
  createdAt: string
}

export type RealBudgetLimits = z.infer<typeof RealBudgetLimitsSchema>
export type ProviderCallReservationInput = z.infer<typeof ProviderCallReservationInputSchema>
export type ProviderCallSettlement = z.infer<typeof ProviderCallSettlementSchema>
