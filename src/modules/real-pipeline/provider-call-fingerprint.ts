import { createHash } from 'node:crypto'
import { z } from 'zod'

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const IdentifierSchema = z.string().trim().min(1).max(160)
const CurrencySchema = z.string().regex(/^[A-Z]{3}$/)
const MoneySchema = z.number().nonnegative().max(100_000)
const ToolSchema = z.string().trim().min(1).max(120).regex(/^[a-z0-9][a-z0-9._-]*$/)

export const ProviderCallPayloadFingerprintInputSchema = z.object({
  executionId: IdentifierSchema,
  requestId: IdentifierSchema,
  runId: IdentifierSchema,
  taskId: IdentifierSchema,
  batchId: IdentifierSchema,
  budgetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  stage: IdentifierSchema,
  operation: IdentifierSchema,
  providerId: IdentifierSchema,
  model: IdentifierSchema,
  attempt: z.number().int().min(1).max(10),
  retryOfCallId: IdentifierSchema.optional(),
  estimatedCost: MoneySchema,
  reservedCost: MoneySchema,
  currency: CurrencySchema,
  tariffId: IdentifierSchema,
  promptVersion: IdentifierSchema,
  schemaVersion: IdentifierSchema,
  payloadHash: Sha256Schema,
  maxInputTokens: z.number().int().nonnegative(),
  maxOutputTokens: z.number().int().nonnegative(),
  maxToolCalls: z.number().int().nonnegative(),
  maxCredits: z.number().nonnegative(),
  tools: z.array(ToolSchema).max(100),
}).strict()

export type ProviderCallPayloadFingerprintInput = z.infer<
  typeof ProviderCallPayloadFingerprintInputSchema
>

export function createProviderCallPayloadFingerprint(candidate: unknown): string {
  const input = ProviderCallPayloadFingerprintInputSchema.parse(candidate)
  const canonical = JSON.stringify({
    attempt: input.attempt,
    batchId: input.batchId,
    budgetDate: input.budgetDate,
    currency: input.currency,
    estimatedCost: input.estimatedCost,
    executionId: input.executionId,
    maxCredits: input.maxCredits,
    maxInputTokens: input.maxInputTokens,
    maxOutputTokens: input.maxOutputTokens,
    maxToolCalls: input.maxToolCalls,
    model: input.model,
    operation: input.operation,
    payloadHash: input.payloadHash,
    promptVersion: input.promptVersion,
    providerId: input.providerId,
    requestId: input.requestId,
    reservedCost: input.reservedCost,
    retryOfCallId: input.retryOfCallId ?? null,
    runId: input.runId,
    schemaVersion: input.schemaVersion,
    stage: input.stage,
    tariffId: input.tariffId,
    taskId: input.taskId,
    tools: [...new Set(input.tools)].sort(),
  })
  return createHash('sha256').update(canonical).digest('hex')
}
