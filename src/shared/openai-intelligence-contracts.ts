import { z } from 'zod'
import {
  RealContinueDecisionSchema,
  RealCoverageSchema,
  RealEditorialProfileSchema,
  RealFocusedQuerySchema,
  RealKnowledgeClaimSchema,
  RealKnowledgeGapSchema,
} from './real-pipeline-contracts'

const CoverageScoreSchema = z.number().min(0).max(1)
const CoverageWarningsSchema = z.array(z.string().trim().min(1).max(500))

const AdventureRequirementsSchema = z.object({
  routes: CoverageScoreSchema,
  specific_places: CoverageScoreSchema,
  access: CoverageScoreSchema,
  duration: CoverageScoreSchema,
  costs: CoverageScoreSchema,
  season: CoverageScoreSchema,
  risks: CoverageScoreSchema,
})

const StudentRequirementsSchema = z.object({
  history: CoverageScoreSchema,
  dates: CoverageScoreSchema,
  population: CoverageScoreSchema,
  monuments: CoverageScoreSchema,
  culture: CoverageScoreSchema,
  daily_life: CoverageScoreSchema,
})

export const OpenAIProfileCoverageSchema = z.discriminatedUnion('profile', [
  z.object({
    profile: z.literal('adventure'),
    score: CoverageScoreSchema,
    sufficient: z.boolean(),
    requirements: AdventureRequirementsSchema,
    warnings: CoverageWarningsSchema,
  }),
  z.object({
    profile: z.literal('student'),
    score: CoverageScoreSchema,
    sufficient: z.boolean(),
    requirements: StudentRequirementsSchema,
    warnings: CoverageWarningsSchema,
  }),
])

export const OpenAIRoundAnalysisOutputSchema = z.object({
  claims: z.array(RealKnowledgeClaimSchema),
  contradictions: z.array(z.string().trim().min(1).max(2_000)),
  coverage: RealCoverageSchema,
  profileCoverage: z.array(OpenAIProfileCoverageSchema).min(1).max(2),
  gaps: z.array(RealKnowledgeGapSchema),
  proposedQueries: z.array(RealFocusedQuerySchema),
  decision: RealContinueDecisionSchema,
})

export const OpenAIDraftOutputSchema = z.object({
  profile: RealEditorialProfileSchema,
  title: z.string().trim().min(1).max(300),
  content: z.string().trim().min(1).max(100_000),
  approximateWordCount: z.number().int().positive(),
  coverage: OpenAIProfileCoverageSchema,
})

export const OpenAIReviewOutputSchema = z.object({
  outcome: z.enum(['passed', 'passed_with_warnings', 'review_required']),
  issues: z.array(z.string().trim().min(1).max(1_000)),
  profileCoverage: z.array(OpenAIProfileCoverageSchema).min(1).max(2),
})

export type OpenAIProfileCoverage = z.infer<typeof OpenAIProfileCoverageSchema>
export type OpenAIRoundAnalysisOutput = z.infer<typeof OpenAIRoundAnalysisOutputSchema>
export type OpenAIDraftOutput = z.infer<typeof OpenAIDraftOutputSchema>
export type OpenAIReviewOutput = z.infer<typeof OpenAIReviewOutputSchema>
