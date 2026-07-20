import { createHash } from 'node:crypto'
import { z } from 'zod'
import {
  ResearchActivitySchema,
  ResearchFactSchema,
  ResearchPlaceSchema,
  type ResearchActivity,
  type ResearchFact,
  type ResearchPlace,
} from '@shared/editorial-contracts'
import type { EditorialResearchRepository } from './repository'
import type { EvaluatedSourceDocument } from './source-providers'
import { normalizeGeographicText } from './geography'

const ProposedFactSchema = z.object({
  canonicalKey: z.string().trim().min(1).max(200),
  value: z.string().trim().min(1).max(1000),
  statement: z.string().trim().min(1).max(5000),
  category: z.enum(['geography', 'history', 'culture', 'nature', 'logistics', 'cost', 'safety', 'accessibility', 'service', 'other']),
  confidence: z.number().min(0).max(1),
  volatility: z.enum(['stable', 'seasonal', 'volatile']),
  validFrom: z.date().optional(),
  validUntil: z.date().optional(),
})

const ProposedPlaceSchema = z.object({
  canonicalKey: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(300),
  category: z.enum(['monument', 'museum', 'nature', 'experience', 'food', 'hidden_gem', 'neighborhood', 'service', 'other']),
  factKeys: z.array(z.string().trim().min(1).max(200)).min(1),
  profileRelevance: z.object({ adventure: z.number().min(0).max(1), student: z.number().min(0).max(1) }),
})

const ProposedActivitySchema = z.object({
  canonicalKey: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(300),
  audienceProfiles: z.array(z.enum(['adventure', 'student'])).min(1).max(2),
  durationMinutes: z.number().int().positive().optional(),
  costBand: z.enum(['free', 'budget', 'moderate', 'high', 'unknown']),
  season: z.string().trim().max(200).optional(),
  requirements: z.array(z.string().trim().min(1).max(300)),
  accessibility: z.array(z.string().trim().min(1).max(300)),
  riskNotes: z.array(z.string().trim().min(1).max(500)),
  factKeys: z.array(z.string().trim().min(1).max(200)).min(1),
})

export const FactualProposalSchema = z.object({
  facts: z.array(ProposedFactSchema).min(1).max(100),
  places: z.array(ProposedPlaceSchema).max(100),
  activities: z.array(ProposedActivitySchema).max(100),
})

export type FactualProposal = z.infer<typeof FactualProposalSchema>

export interface FactualStructuringProvider {
  readonly id: string
  readonly model: string
  readonly contractVersion: string
  readonly simulation: boolean
  structure(input: {
    document: EvaluatedSourceDocument
    destinationId: string
    language: string
    signal: AbortSignal
  }): Promise<FactualProposal>
}

export interface FactualStructuringInput {
  requestId: string
  runId: string
  destinationId: string
  language: string
  attempt: number
  documents: EvaluatedSourceDocument[]
  signal?: AbortSignal
}

export interface FactualStructureResult {
  facts: ResearchFact[]
  places: ResearchPlace[]
  activities: ResearchActivity[]
  processedSourceIds: string[]
  resumedFromCheckpoint: boolean
  checkpointsSaved: number
  providerId: string
  providerModel: string
  contractVersion: string
}

export type FactualStructuringErrorCode =
  | 'NO_ACCEPTED_SOURCES'
  | 'CANCELLED'
  | 'INVALID_PROPOSAL'
  | 'MISSING_FACT_REFERENCE'
  | 'CHECKPOINT_MISMATCH'

export class FactualStructuringError extends Error {
  constructor(readonly code: FactualStructuringErrorCode, message: string, readonly cause?: unknown) {
    super(message)
    this.name = 'FactualStructuringError'
  }
}

const CheckpointSnapshotSchema = z.preprocess(value => reviveCheckpointDates(value), z.object({
  kind: z.literal('factual-structure-v1'),
  contractVersion: z.string().min(1),
  sourceIds: z.array(z.string().uuid()),
  nextSourceIndex: z.number().int().nonnegative(),
  processedSourceIds: z.array(z.string().uuid()),
  facts: z.array(ResearchFactSchema),
  factIndex: z.array(z.object({
    factId: z.string().uuid(),
    canonicalKey: z.string().min(1),
    normalizedValue: z.string().min(1),
  })),
  places: z.array(ResearchPlaceSchema),
  activities: z.array(ResearchActivitySchema),
}))

interface FactAccumulator {
  fact: ResearchFact
  canonicalKey: string
  normalizedValue: string
}

export class FactualStructuringService {
  constructor(
    private readonly provider: FactualStructuringProvider,
    private readonly repository: Pick<EditorialResearchRepository, 'saveCheckpoint' | 'getLatestCheckpoint'>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async structure(input: FactualStructuringInput): Promise<FactualStructureResult> {
    const documents = input.documents.filter(document => document.source.status === 'accepted' && Boolean(document.content))
    if (documents.length === 0) {
      throw new FactualStructuringError('NO_ACCEPTED_SOURCES', 'No hay fuentes aceptadas y leídas para estructurar')
    }
    const signal = input.signal ?? new AbortController().signal
    const sourceIds = documents.map(document => document.source.id)
    const resumed = await this.restoreCheckpoint(input, sourceIds)
    const restoredIndex = new Map(resumed?.factIndex.map(item => [item.factId, item]) ?? [])
    const accumulators: FactAccumulator[] = resumed?.facts.map(fact => {
      const index = restoredIndex.get(fact.id)
      if (!index) throw new FactualStructuringError('CHECKPOINT_MISMATCH', 'El índice factual del checkpoint está incompleto')
      return { fact, canonicalKey: index.canonicalKey, normalizedValue: index.normalizedValue }
    }) ?? []
    const places = resumed?.places ?? []
    const activities = resumed?.activities ?? []
    const processedSourceIds = resumed?.processedSourceIds ?? []
    let checkpointsSaved = 0
    const startIndex = resumed?.nextSourceIndex ?? 0

    for (let index = startIndex; index < documents.length; index += 1) {
      if (signal.aborted) throw new FactualStructuringError('CANCELLED', 'La estructuración factual fue cancelada')
      const document = documents[index]
      let proposal: FactualProposal
      try {
        proposal = FactualProposalSchema.parse(await this.provider.structure({
          document,
          destinationId: input.destinationId,
          language: input.language,
          signal,
        }))
      } catch (error) {
        if (signal.aborted) throw new FactualStructuringError('CANCELLED', 'La estructuración factual fue cancelada', error)
        if (error instanceof FactualStructuringError) throw error
        throw new FactualStructuringError('INVALID_PROPOSAL', 'El proveedor factual devolvió una propuesta inválida', error)
      }

      this.mergeFacts(accumulators, proposal.facts, document, input)
      this.markContradictions(accumulators)
      this.mergePlaces(places, proposal.places, accumulators, document, input)
      this.mergeActivities(activities, proposal.activities, accumulators, document, input)
      processedSourceIds.push(document.source.id)
      await this.saveCheckpoint(input, sourceIds, index + 1, processedSourceIds, accumulators, places, activities)
      checkpointsSaved += 1
    }

    return {
      facts: accumulators.map(item => ResearchFactSchema.parse(item.fact)),
      places: places.map(item => ResearchPlaceSchema.parse(item)),
      activities: activities.map(item => ResearchActivitySchema.parse(item)),
      processedSourceIds,
      resumedFromCheckpoint: Boolean(resumed),
      checkpointsSaved,
      providerId: this.provider.id,
      providerModel: this.provider.model,
      contractVersion: this.provider.contractVersion,
    }
  }

  private mergeFacts(
    accumulators: FactAccumulator[],
    proposals: FactualProposal['facts'],
    document: EvaluatedSourceDocument,
    input: FactualStructuringInput,
  ): void {
    for (const proposal of proposals) {
      const canonicalKey = normalizeKey(proposal.canonicalKey)
      const normalizedValue = normalizeKey(proposal.value)
      const existing = accumulators.find(item => item.canonicalKey === canonicalKey && item.normalizedValue === normalizedValue)
      if (existing) {
        existing.fact.sourceIds = uniqueSorted([...existing.fact.sourceIds, document.source.id])
        existing.fact.confidence = Math.max(existing.fact.confidence, adjustedConfidence(proposal.confidence, document.source.reliability))
        existing.fact.updatedAt = this.now()
        existing.fact.version += 1
        continue
      }
      const createdAt = this.now()
      accumulators.push({
        canonicalKey,
        normalizedValue,
        fact: ResearchFactSchema.parse({
          id: deterministicUuid(`${input.requestId}:fact:${canonicalKey}:${normalizedValue}`),
          requestId: input.requestId,
          destinationId: input.destinationId,
          statement: normalizeStatement(proposal.statement),
          category: proposal.category,
          sourceIds: [document.source.id],
          confidence: adjustedConfidence(proposal.confidence, document.source.reliability),
          contradiction: 'none',
          volatility: proposal.volatility,
          reviewStatus: 'verified',
          validFrom: proposal.validFrom,
          validUntil: proposal.validUntil,
          version: 1,
          createdAt,
          updatedAt: createdAt,
        }),
      })
    }
  }

  private markContradictions(accumulators: FactAccumulator[]): void {
    const byKey = new Map<string, FactAccumulator[]>()
    for (const accumulator of accumulators) {
      const group = byKey.get(accumulator.canonicalKey) ?? []
      group.push(accumulator)
      byKey.set(accumulator.canonicalKey, group)
    }
    for (const group of byKey.values()) {
      if (new Set(group.map(item => item.normalizedValue)).size <= 1) continue
      for (const item of group) {
        item.fact.contradiction = 'confirmed'
        item.fact.reviewStatus = 'disputed'
      }
    }
  }

  private mergePlaces(
    places: ResearchPlace[],
    proposals: FactualProposal['places'],
    facts: FactAccumulator[],
    document: EvaluatedSourceDocument,
    input: FactualStructuringInput,
  ): void {
    for (const proposal of proposals) {
      const key = normalizeKey(proposal.canonicalKey)
      const relatedFacts = this.resolveFactIds(proposal.factKeys, facts)
      const sourceIds = uniqueSorted([
        document.source.id,
        ...facts.filter(item => relatedFacts.includes(item.fact.id)).flatMap(item => item.fact.sourceIds),
      ])
      const existing = places.find(place => normalizeKey(`${place.category}:${place.name}`) === normalizeKey(`${proposal.category}:${proposal.name}`))
      if (existing) {
        existing.factIds = uniqueSorted([...existing.factIds, ...relatedFacts])
        existing.sourceIds = uniqueSorted([...existing.sourceIds, ...sourceIds])
        existing.profileRelevance = {
          adventure: Math.max(existing.profileRelevance.adventure, proposal.profileRelevance.adventure),
          student: Math.max(existing.profileRelevance.student, proposal.profileRelevance.student),
        }
        existing.updatedAt = this.now()
        existing.version += 1
        continue
      }
      const createdAt = this.now()
      places.push(ResearchPlaceSchema.parse({
        id: deterministicUuid(`${input.requestId}:place:${key}`),
        requestId: input.requestId,
        destinationId: input.destinationId,
        name: proposal.name.trim(),
        category: proposal.category,
        position: places.length,
        factIds: relatedFacts,
        sourceIds,
        profileRelevance: proposal.profileRelevance,
        status: 'accepted',
        version: 1,
        createdAt,
        updatedAt: createdAt,
      }))
    }
  }

  private mergeActivities(
    activities: ResearchActivity[],
    proposals: FactualProposal['activities'],
    facts: FactAccumulator[],
    document: EvaluatedSourceDocument,
    input: FactualStructuringInput,
  ): void {
    for (const proposal of proposals) {
      const key = normalizeKey(proposal.canonicalKey)
      const relatedFacts = this.resolveFactIds(proposal.factKeys, facts)
      const sourceIds = uniqueSorted([
        document.source.id,
        ...facts.filter(item => relatedFacts.includes(item.fact.id)).flatMap(item => item.fact.sourceIds),
      ])
      const existing = activities.find(activity => normalizeKey(activity.name) === normalizeKey(proposal.name))
      if (existing) {
        existing.factIds = uniqueSorted([...existing.factIds, ...relatedFacts])
        existing.sourceIds = uniqueSorted([...existing.sourceIds, ...sourceIds])
        existing.audienceProfiles = uniqueSorted([...existing.audienceProfiles, ...proposal.audienceProfiles]) as ResearchActivity['audienceProfiles']
        existing.requirements = uniqueSorted([...existing.requirements, ...proposal.requirements])
        existing.accessibility = uniqueSorted([...existing.accessibility, ...proposal.accessibility])
        existing.riskNotes = uniqueSorted([...existing.riskNotes, ...proposal.riskNotes])
        existing.updatedAt = this.now()
        existing.version += 1
        continue
      }
      const createdAt = this.now()
      activities.push(ResearchActivitySchema.parse({
        id: deterministicUuid(`${input.requestId}:activity:${key}`),
        requestId: input.requestId,
        destinationId: input.destinationId,
        name: proposal.name.trim(),
        audienceProfiles: [...new Set(proposal.audienceProfiles)],
        durationMinutes: proposal.durationMinutes,
        costBand: proposal.costBand,
        season: proposal.season,
        requirements: proposal.requirements,
        accessibility: proposal.accessibility,
        riskNotes: proposal.riskNotes,
        factIds: relatedFacts,
        sourceIds,
        version: 1,
        createdAt,
        updatedAt: createdAt,
      }))
    }
  }

  private resolveFactIds(keys: string[], facts: FactAccumulator[]): string[] {
    const normalizedKeys = new Set(keys.map(normalizeKey))
    const related = facts.filter(item => normalizedKeys.has(item.canonicalKey)).map(item => item.fact.id)
    if (related.length === 0 || [...normalizedKeys].some(key => !facts.some(item => item.canonicalKey === key))) {
      throw new FactualStructuringError('MISSING_FACT_REFERENCE', 'Un lugar o actividad referencia un hecho no estructurado')
    }
    return uniqueSorted(related)
  }

  private async restoreCheckpoint(input: FactualStructuringInput, sourceIds: string[]) {
    const checkpoint = await this.repository.getLatestCheckpoint(input.requestId)
    if (!checkpoint || checkpoint.runId !== input.runId || checkpoint.stage !== 'fact_structuring' || checkpoint.attempt !== input.attempt) return null
    if (sha256(checkpoint.snapshot) !== checkpoint.snapshotHash) {
      throw new FactualStructuringError('CHECKPOINT_MISMATCH', 'La huella del checkpoint factual no coincide')
    }
    const parsed = CheckpointSnapshotSchema.safeParse(checkpoint.snapshot)
    if (!parsed.success || parsed.data.contractVersion !== this.provider.contractVersion || !sameArray(parsed.data.sourceIds, sourceIds)) {
      throw new FactualStructuringError('CHECKPOINT_MISMATCH', 'El checkpoint factual no corresponde a fuentes o contrato vigentes', parsed.success ? undefined : parsed.error)
    }
    return parsed.data
  }

  private async saveCheckpoint(
    input: FactualStructuringInput,
    sourceIds: string[],
    nextSourceIndex: number,
    processedSourceIds: string[],
    facts: FactAccumulator[],
    places: ResearchPlace[],
    activities: ResearchActivity[],
  ): Promise<void> {
    const snapshot = serializeSnapshot({
      kind: 'factual-structure-v1',
      contractVersion: this.provider.contractVersion,
      sourceIds,
      nextSourceIndex,
      processedSourceIds,
      facts: facts.map(item => item.fact),
      factIndex: facts.map(item => ({
        factId: item.fact.id,
        canonicalKey: item.canonicalKey,
        normalizedValue: item.normalizedValue,
      })),
      places,
      activities,
    })
    await this.repository.saveCheckpoint({
      id: deterministicUuid(`${input.runId}:fact_structuring:${input.attempt}`),
      requestId: input.requestId,
      runId: input.runId,
      stage: 'fact_structuring',
      attempt: input.attempt,
      snapshot,
      snapshotHash: sha256(snapshot),
      createdAt: this.now(),
    })
  }
}

function normalizeKey(value: string): string {
  return normalizeGeographicText(value)
}

function normalizeStatement(value: string): string {
  const normalized = value.trim().replace(/\s+/g, ' ')
  return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`
}

function adjustedConfidence(proposal: number, sourceReliability: number): number {
  return Number((proposal * (0.5 + sourceReliability / 2)).toFixed(3))
}

function uniqueSorted<T extends string>(values: T[]): T[] {
  return [...new Set(values)].sort() as T[]
}

function deterministicUuid(value: string): string {
  const hex = createHash('sha256').update(value).digest('hex').slice(0, 32).split('')
  hex[12] = '4'
  hex[16] = ['8', '9', 'a', 'b'][Number.parseInt(hex[16], 16) % 4]
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20).join('')}`
}

function serializeSnapshot(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>
}

function sha256(value: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function sameArray(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function reviveCheckpointDates(value: unknown, key = ''): unknown {
  if (Array.isArray(value)) return value.map(item => reviveCheckpointDates(item))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, reviveCheckpointDates(childValue, childKey)]))
  }
  if (typeof value === 'string' && /(?:At|From|Until)$/.test(key)) {
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) return date
  }
  return value
}
