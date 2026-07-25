import { z } from 'zod'
import {
  RealContinueDecisionSchema,
  RealCoverageSchema,
  RealEditorialProfileSchema,
  RealFocusedQuerySchema,
  RealKnowledgeClaimSchema,
  RealKnowledgeGapSchema,
} from './real-pipeline-contracts'

const adventureRequirements = ['routes', 'specific_places', 'access', 'duration', 'costs', 'season', 'risks']
const studentRequirements = ['history', 'dates', 'population', 'monuments', 'culture', 'daily_life']

export const OpenAIProfileCoverageSchema = z.object({
  profile: RealEditorialProfileSchema,
  score: z.number().min(0).max(1),
  sufficient: z.boolean(),
  requirements: z.record(z.number().min(0).max(1)),
  warnings: z.array(z.string().trim().min(1).max(500)),
}).superRefine((value, context) => {
  const required = value.profile === 'adventure' ? adventureRequirements : studentRequirements
  for (const requirement of required) {
    if (value.requirements[requirement] === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['requirements', requirement],
        message: `Falta cobertura obligatoria: ${requirement}`,
      })
    }
  }
})

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
