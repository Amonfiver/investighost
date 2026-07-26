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
}

export interface ResearchToolResult {
  round: RealRoundNumber
  sources: RealResearchSource[]
  providerRequestIds: string[]
  failures: Array<{ url: string; code: string; message: string }>
  usageUnits: number
  credits: number
  urlSanitization?: ProviderResultSanitization
}

export interface ResearchTool {
  readonly id: string
  readonly model: string
  readonly simulation: boolean
  research(mission: RealResearchMission, signal: AbortSignal): Promise<ResearchToolResult>
}

export interface IntelligenceRoundAnalysis {
  masterKnowledge: RealMasterKnowledge
  coverage: RealCoverage
  proposedQueries: RealFocusedQuery[]
  gaps: RealKnowledgeGap[]
  decision: RealContinueDecision
  usage: {
    inputTokens: number
    outputTokens: number
    estimatedCost: number
    currency: 'EUR' | 'USD'
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
    inputTokens: number
    outputTokens: number
    estimatedCost: number
    currency: 'EUR' | 'USD'
  }
}

export interface IntelligenceReview {
  outcome: 'passed' | 'passed_with_warnings' | 'review_required'
  issues: string[]
  promptVersion: string
  schemaVersion: string
  usage: {
    inputTokens: number
    outputTokens: number
    estimatedCost: number
    currency: 'EUR' | 'USD'
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
  analyze(
    mission: RealResearchMission,
    dossier: RealResearchDossier,
    signal: AbortSignal,
  ): Promise<IntelligenceRoundAnalysis>
  validateDraft?(
    mission: RealResearchMission,
    knowledge: RealMasterKnowledge,
  ): void
  draft(
    mission: RealResearchMission,
    knowledge: RealMasterKnowledge,
    signal: AbortSignal,
  ): Promise<IntelligenceDraft[]>
  validateReview?(
    mission: RealResearchMission,
    knowledge: RealMasterKnowledge,
    drafts: IntelligenceDraft[],
  ): void
  review(
    mission: RealResearchMission,
    knowledge: RealMasterKnowledge,
    drafts: IntelligenceDraft[],
    signal: AbortSignal,
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
