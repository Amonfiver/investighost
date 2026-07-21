import { createHash } from 'node:crypto'
import { z } from 'zod'
import {
  EditorialDraftBundleSchema,
  ProviderUsageSchema,
  QualityCheckSchema,
  QualityReviewSchema,
  ResearchActivitySchema,
  ResearchFactSchema,
  ResearchPlaceSchema,
  ResearchSourceSchema,
  type EditorialResearchRequest,
  type ResearchStage,
} from '@shared/editorial-contracts'
import type { EditorialResearchRepository, EditorialStageCheckpoint } from './repository'

export class ManualCheckpointError extends Error {
  readonly code = 'CHECKPOINT_INVALID'

  constructor(message: string, readonly cause?: unknown) {
    super(message)
    this.name = 'ManualCheckpointError'
  }
}

const CheckpointBaseSchema = z.object({
  configurationHash: z.string().regex(/^[a-f0-9]{64}$/),
  completedAt: z.date(),
})

export const ManualSourcesCheckpointSchema = CheckpointBaseSchema.extend({
  kind: z.literal('manual-sources-v1'),
  sources: z.array(ResearchSourceSchema).min(1),
  documents: z.array(z.object({
    source: ResearchSourceSchema,
    content: z.string().max(200_000).optional(),
    evaluation: z.object({
      accepted: z.boolean(),
      sourceType: z.enum(['official', 'tourism', 'heritage', 'news', 'academic', 'blog', 'reviews', 'other']),
      territorialScope: z.enum(['destination', 'local', 'regional', 'national', 'global']),
      freshness: z.enum(['current', 'dated', 'unknown']),
      reliability: z.number().min(0).max(1),
      reason: z.string().trim().min(1).max(1000),
    }).optional(),
  })).min(1),
  usage: z.array(ProviderUsageSchema),
  estimatedCost: z.number().nonnegative(),
  actualCost: z.number().nonnegative(),
  currency: z.string().length(3),
})

export const ManualFactsCheckpointSchema = CheckpointBaseSchema.extend({
  kind: z.literal('manual-facts-v1'),
  facts: z.array(ResearchFactSchema).min(1),
  places: z.array(ResearchPlaceSchema),
  activities: z.array(ResearchActivitySchema),
})

export const ManualDraftsCheckpointSchema = CheckpointBaseSchema.extend({
  kind: z.literal('manual-drafts-v1'),
  drafts: z.array(EditorialDraftBundleSchema).min(1),
  usage: z.array(ProviderUsageSchema),
  estimatedCost: z.number().nonnegative(),
  actualCost: z.number().nonnegative(),
  currency: z.string().length(3),
})

export const ManualQualityCheckpointSchema = CheckpointBaseSchema.extend({
  kind: z.literal('manual-quality-v1'),
  reviews: z.array(QualityReviewSchema).min(1),
  checks: z.array(QualityCheckSchema).min(1),
})

export type ManualSourcesCheckpoint = z.infer<typeof ManualSourcesCheckpointSchema>
export type ManualFactsCheckpoint = z.infer<typeof ManualFactsCheckpointSchema>
export type ManualDraftsCheckpoint = z.infer<typeof ManualDraftsCheckpointSchema>
export type ManualQualityCheckpoint = z.infer<typeof ManualQualityCheckpointSchema>

type ManualCheckpoint = ManualSourcesCheckpoint | ManualFactsCheckpoint | ManualDraftsCheckpoint | ManualQualityCheckpoint

export function manualConfigurationHash(request: EditorialResearchRequest): string {
  return sha256({
    destinationId: request.destinationId,
    query: request.destinationQuerySnapshot,
    profiles: request.profiles,
    language: request.language,
    depth: request.depth,
    notes: request.notes ?? null,
    options: request.options,
    configurationVersion: request.configurationVersion,
  })
}

export async function saveManualCheckpoint(
  repository: Pick<EditorialResearchRepository, 'saveCheckpoint'>,
  input: { requestId: string; runId: string; stage: ResearchStage; attempt: number; snapshot: ManualCheckpoint; createdAt: Date },
): Promise<void> {
  const snapshot = serialize(input.snapshot)
  await repository.saveCheckpoint({
    id: deterministicUuid(`${input.runId}:${input.stage}:${input.attempt}:manual-v1`),
    requestId: input.requestId,
    runId: input.runId,
    stage: input.stage,
    attempt: input.attempt,
    snapshot,
    snapshotHash: sha256(snapshot),
    createdAt: input.createdAt,
  })
}

export async function readManualCheckpoint<T extends ManualCheckpoint>(
  repository: Pick<EditorialResearchRepository, 'getStageCheckpoint'>,
  requestId: string,
  stage: ResearchStage,
  schema: z.ZodType<T>,
  configurationHash: string,
): Promise<{ checkpoint: EditorialStageCheckpoint; snapshot: T } | null> {
  const checkpoint = await repository.getStageCheckpoint(requestId, stage)
  if (!checkpoint) return null
  if (sha256(checkpoint.snapshot) !== checkpoint.snapshotHash) {
    throw new ManualCheckpointError(`El checkpoint ${stage} no supera la verificación de integridad`)
  }
  const parsed = schema.safeParse(reviveDates(checkpoint.snapshot))
  if (!parsed.success) throw new ManualCheckpointError(`El checkpoint ${stage} no cumple el contrato vigente`, parsed.error)
  if (parsed.data.configurationHash !== configurationHash) {
    throw new ManualCheckpointError(`El checkpoint ${stage} pertenece a otra configuración`)
  }
  return { checkpoint, snapshot: parsed.data }
}

function serialize(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>
}

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function deterministicUuid(value: string): string {
  const hex = createHash('sha256').update(value).digest('hex').slice(0, 32).split('')
  hex[12] = '4'
  hex[16] = ['8', '9', 'a', 'b'][Number.parseInt(hex[16], 16) % 4]
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20).join('')}`
}

function reviveDates(value: unknown, key = ''): unknown {
  if (Array.isArray(value)) return value.map(item => reviveDates(item))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .map(([childKey, child]) => [childKey, reviveDates(child, childKey)]))
  }
  if (typeof value === 'string' && /(?:At|From|Until)$/.test(key)) {
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) return date
  }
  return value
}
