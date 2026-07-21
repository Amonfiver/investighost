import { z } from 'zod'
import {
  EditorialDraftStateSchema,
  EditorialProfileSchema,
  ResearchDepthSchema,
  type GeographicEntity,
} from './editorial-contracts'

const UuidSchema = z.string().uuid()

export const ManualSimulationScenarioSchema = z.enum([
  'happy_path',
  'insufficient_sources',
  'broken_source',
  'provider_unavailable',
  'slow_interruptible',
])

export const ManualDestinationQuerySchema = z.object({
  query: z.string().trim().min(1).max(300),
  countryCode: z.string().length(2).transform(value => value.toUpperCase()).optional(),
  regionCode: z.string().trim().min(1).max(20).optional(),
  type: z.enum(['country', 'region', 'locality', 'zone']).optional(),
})

export const ManualResearchStartSchema = z.object({
  destinationQuery: z.string().trim().min(1).max(300),
  countryCode: z.string().length(2).transform(value => value.toUpperCase()).optional(),
  regionCode: z.string().trim().min(1).max(20).optional(),
  destinationType: z.enum(['country', 'region', 'locality', 'zone']).optional(),
  profiles: z.array(EditorialProfileSchema).min(1).max(2),
  language: z.string().length(2).default('es'),
  depth: ResearchDepthSchema.default('standard'),
  notes: z.string().trim().max(2000).optional(),
  budgetLimit: z.number().min(0.1).max(50).default(2),
  maxAttempts: z.number().int().min(1).max(5).default(3),
  simulationScenario: ManualSimulationScenarioSchema.optional(),
  idempotencyKey: z.string().trim().min(1).max(200),
  actorId: UuidSchema,
}).superRefine((value, context) => {
  if (new Set(value.profiles).size !== value.profiles.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['profiles'], message: 'Los perfiles no pueden repetirse' })
  }
})

export const ManualDestinationCorrectionSchema = z.object({
  query: ManualDestinationQuerySchema,
  candidateId: UuidSchema,
  actorId: UuidSchema,
  reason: z.string().trim().min(1).max(1000),
})

export const ManualSectionEditSchema = z.object({
  requestId: UuidSchema,
  draftId: UuidSchema,
  sectionId: UuidSchema,
  heading: z.string().trim().min(1).max(300),
  content: z.string().trim().min(60).max(20_000),
  reason: z.string().trim().min(1).max(1000),
  actorId: UuidSchema,
})

export const ManualSectionRegenerationSchema = z.object({
  requestId: UuidSchema,
  draftId: UuidSchema,
  sectionId: UuidSchema,
  reason: z.string().trim().min(1).max(1000),
  actorId: UuidSchema,
})

export const ManualDraftReviewSchema = z.object({
  requestId: UuidSchema,
  draftId: UuidSchema,
  actorId: UuidSchema,
})

export const ManualDraftDecisionSchema = z.object({
  requestId: UuidSchema,
  draftId: UuidSchema,
  actorId: UuidSchema,
  decision: z.enum(['approved', 'changes_requested', 'rejected']),
  comment: z.string().trim().min(1).max(2000),
})

export const ManualExecutionActionSchema = z.object({
  requestId: UuidSchema,
  actorId: UuidSchema,
})

export interface ManualResolutionCandidate {
  entity: GeographicEntity
  hierarchy: Array<Pick<GeographicEntity, 'id' | 'type' | 'name' | 'normalizedName' | 'countryCode' | 'regionCode'>>
  score: number
  method: 'exact' | 'alias' | 'tolerant'
}

export type ManualDestinationResolution =
  | {
    status: 'resolved'
    query: string
    normalizedQuery: string
    catalogVersion: string
    method: 'exact' | 'alias' | 'tolerant' | 'human'
    entity: GeographicEntity
    hierarchy: ManualResolutionCandidate['hierarchy']
    score: number
  }
  | {
    status: 'ambiguous'
    query: string
    normalizedQuery: string
    catalogVersion: string
    candidates: ManualResolutionCandidate[]
  }
  | {
    status: 'not_found'
    query: string
    normalizedQuery: string
    catalogVersion: string
    reason: string
  }

export interface ManualDraftVersionSummary {
  id: string
  requestId: string
  profile: z.infer<typeof EditorialProfileSchema>
  title: string
  contentVersion: number
  state: z.infer<typeof EditorialDraftStateSchema>
  previousDraftId?: string
  reason?: string
  humanEdited: boolean
  createdAt: Date
  updatedAt: Date
}

export interface ManualPersistenceStatus {
  connected: boolean
  target: 'Supabase local'
  simulation: true
  catalogVersion: string
  url?: string
  error?: string
}

export type ManualDestinationQuery = z.infer<typeof ManualDestinationQuerySchema>
export type ManualResearchStart = z.infer<typeof ManualResearchStartSchema>
export type ManualDestinationCorrection = z.infer<typeof ManualDestinationCorrectionSchema>
export type ManualSectionEdit = z.infer<typeof ManualSectionEditSchema>
export type ManualSectionRegeneration = z.infer<typeof ManualSectionRegenerationSchema>
export type ManualDraftReview = z.infer<typeof ManualDraftReviewSchema>
export type ManualDraftDecision = z.infer<typeof ManualDraftDecisionSchema>
export type ManualExecutionAction = z.infer<typeof ManualExecutionActionSchema>
export type ManualSimulationScenario = z.infer<typeof ManualSimulationScenarioSchema>
