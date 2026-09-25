import type {
  RealContinueDecision,
  RealCoverage,
  RealFocusedQuery,
  RealKnowledgeGap,
  RealMasterKnowledge,
  RealResearchDossier,
  RealResearchMission,
  RealResearchSource,
  RealRoundNumber,
  RealRoundResult,
} from '@shared/real-pipeline-contracts'
import type { RealEditorialCoverageConstraints } from '@shared/real-editorial-pilot-contracts'
import type { ZodTypeAny } from 'zod'

export type ProviderResultDiscardReason =
  | 'empty'
  | 'relative'
  | 'malformed'
  | 'http'
  | 'unsupported_scheme'
  | 'credentials'
  | 'duplicate'
  | 'limit'
  | 'unmatched'
  | 'empty_content'
  | 'extraction_failed'

export interface ProviderResultSanitization {
  totalReceived: number
  accepted: number
  discarded: number
  discardReasons: Partial<Record<ProviderResultDiscardReason, number>>
}

export interface ProviderFailureUsage {
  providerRequestIds: string[]
  credits: number
  calculatedCost: number
  toolCalls: number
  inputTokens?: number
  cachedInputTokens?: number
  reasoningTokens?: number
  outputTokens?: number
  outputHash?: string
}

export interface ProviderCallExecutionContext {
  operationId: string
  reservationId: string
  callId: string
  attempt: number
}

export interface ResearchToolResult {
  round: RealRoundNumber
  sources: RealResearchSource[]
  providerRequestIds: string[]
  billableProviderRequestIds?: string[]
  failures: Array<{ url: string; code: string; message: string }>
  usageUnits: number
  credits: number
  billableCredits?: number
  urlSanitization?: ProviderResultSanitization
}

export interface ResearchTool {
  readonly id: string
  readonly model: string
  readonly simulation: boolean
  research(
    mission: RealResearchMission,
    signal: AbortSignal,
    context?: ProviderCallExecutionContext,
  ): Promise<ResearchToolResult>
}

export interface IntelligenceRoundAnalysis {
  masterKnowledge: RealMasterKnowledge
  coverage: RealCoverage
  proposedQueries: RealFocusedQuery[]
  gaps: RealKnowledgeGap[]
  decision: RealContinueDecision
  usage: {
    providerId: string
    model: string
    inputTokens: number
    cachedInputTokens?: number
    reasoningTokens?: number
    outputTokens: number
    estimatedCost: number
    currency: 'EUR' | 'USD'
    providerRequestIds?: string[]
  }
}

export interface IntelligenceDraft {
  profile: 'adventure' | 'student'
  title: string
  content: string
  approximateWordCount: number
  promptVersion: string
  schemaVersion: string
  usage: {
    providerId: string
    model: string
    inputTokens: number
    cachedInputTokens?: number
    outputTokens: number
    estimatedCost: number
    currency: 'EUR' | 'USD'
    providerRequestIds?: string[]
  }
}

export interface IntelligenceReview {
  outcome: 'passed' | 'passed_with_warnings' | 'review_required'
  issues: string[]
  promptVersion: string
  schemaVersion: string
  usage: {
    providerId: string
    model: string
    inputTokens: number
    cachedInputTokens?: number
    outputTokens: number
    estimatedCost: number
    currency: 'EUR' | 'USD'
    providerRequestIds?: string[]
  }
}

export interface IntelligenceEngine {
  readonly id: string
  readonly model: string
  readonly simulation: boolean
  validateAnalyze?(
    mission: RealResearchMission,
    dossier: RealResearchDossier,
  ): void
  /** Capacidad opcional: analysis DeepSeek se divide en operaciones ledger independientes. */
  readonly analysisStrategy?: 'deepseek_multi_stage'
  readonly analysisStageIds?: readonly string[]
  analysisStageBudget?(stage: string): number
  analyzeMultiStage?(
    mission: RealResearchMission,
    dossier: RealResearchDossier,
    signal: AbortSignal,
    executeStage: (
      stage: string,
      operation: (context?: ProviderCallExecutionContext) => Promise<{ output: unknown; usage: IntelligenceRoundAnalysis['usage'] }>,
    ) => Promise<{ output: unknown; usage: IntelligenceRoundAnalysis['usage'] }>,
  ): Promise<IntelligenceRoundAnalysis>
  analyze(
    mission: RealResearchMission,
    dossier: RealResearchDossier,
    signal: AbortSignal,
    context?: ProviderCallExecutionContext,
  ): Promise<IntelligenceRoundAnalysis>
  validateDraft?(
    mission: RealResearchMission,
    knowledge: RealMasterKnowledge,
    constraints?: RealEditorialCoverageConstraints,
  ): void
  /** Optional provider-neutral JSON-schema transport used by native editorial
   * contracts. Legacy draft() remains available for historical records. */
  generateStructured?<T>(
    operation: string,
    payload: Record<string, unknown>,
    schema: ZodTypeAny,
    signal: AbortSignal,
  ): Promise<{ output: T; usage: IntelligenceRoundAnalysis['usage'] }>
  draft(
    mission: RealResearchMission,
    knowledge: RealMasterKnowledge,
    signal: AbortSignal,
    constraints?: RealEditorialCoverageConstraints,
  ): Promise<IntelligenceDraft[]>
  validateReview?(
    mission: RealResearchMission,
    knowledge: RealMasterKnowledge,
    drafts: IntelligenceDraft[],
    constraints?: RealEditorialCoverageConstraints,
  ): void
  review(
    mission: RealResearchMission,
    knowledge: RealMasterKnowledge,
    drafts: IntelligenceDraft[],
    signal: AbortSignal,
    constraints?: RealEditorialCoverageConstraints,
  ): Promise<IntelligenceReview>
}

export interface InvestighostRealWorkflow {
  executeRound(
    mission: RealResearchMission,
    accumulatedDossier: RealResearchDossier | undefined,
    signal: AbortSignal,
  ): Promise<RealRoundResult>
  decide(result: RealRoundResult): RealContinueDecision
}

export interface RealPipelineProviderSelection {
  researchTool: ResearchTool
  intelligenceEngine: IntelligenceEngine
}
