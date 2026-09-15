import { z } from 'zod'
import {
  OpenAIContinueDecisionSchema,
  OpenAIFocusedQuerySchema,
  OpenAIKnowledgeGapSchema,
  OpenAIProfileCoverageSchema,
  OpenAIRoundAnalysisOutputSchema,
  type OpenAIRoundAnalysisOutput,
} from '@shared/openai-intelligence-contracts'
import {
  RealCoverageSchema,
  RealKnowledgeClaimSchema,
  RealMasterKnowledgeSchema,
  type RealResearchDossier,
  type RealResearchMission,
} from '@shared/real-pipeline-contracts'
import type { IntelligenceDraft, IntelligenceEngine, IntelligenceReview, IntelligenceRoundAnalysis, ProviderCallExecutionContext } from './ports'
import { OpenAIIntelligenceEngine } from './openai-intelligence-engine'

export const DEEPSEEK_ANALYSIS_STAGE_IDS = ['stage_a', 'stage_b', 'stage_c', 'stage_d'] as const
export type DeepSeekAnalysisStageId = typeof DEEPSEEK_ANALYSIS_STAGE_IDS[number]

export const DeepSeekStageASchema = z.object({ claims: z.array(RealKnowledgeClaimSchema) }).strict()
export const DeepSeekStageBSchema = z.object({
  contradictions: z.array(z.object({ text: z.string().trim().min(1).max(2_000), claimIds: z.array(z.string().trim().min(1)).min(1) }).strict()),
  gaps: z.array(OpenAIKnowledgeGapSchema),
}).strict()
export const DeepSeekStageCSchema = z.object({
  coverage: RealCoverageSchema,
  profileCoverage: z.array(OpenAIProfileCoverageSchema).min(1).max(2),
}).strict()
export const DeepSeekStageDSchema = z.object({
  proposedQueries: z.array(OpenAIFocusedQuerySchema),
  decision: OpenAIContinueDecisionSchema,
}).strict()

export type DeepSeekStageRemoteResult = { output: unknown; usage: IntelligenceRoundAnalysis['usage'] }
export type DeepSeekStageExecutor = (
  stage: DeepSeekAnalysisStageId,
  operation: (context?: ProviderCallExecutionContext) => Promise<DeepSeekStageRemoteResult>,
) => Promise<DeepSeekStageRemoteResult>

export const DEEPSEEK_MULTI_STAGE_BUDGETS: Record<DeepSeekAnalysisStageId, number> = {
  stage_a: 0.020,
  stage_b: 0.008,
  stage_c: 0.008,
  stage_d: 0.008,
}

export function deepSeekMultiStageTotalBudget(): number {
  return Number(Object.values(DEEPSEEK_MULTI_STAGE_BUDGETS).reduce((total, cost) => total + cost, 0).toFixed(9))
}

export class DeepSeekMultiStageAnalysisEngine implements IntelligenceEngine {
  readonly analysisStrategy = 'deepseek_multi_stage' as const
  readonly analysisStageIds = DEEPSEEK_ANALYSIS_STAGE_IDS
  readonly id: string
  readonly model: string
  readonly simulation: boolean

  constructor(private readonly delegate: OpenAIIntelligenceEngine) {
    this.id = delegate.id
    this.model = delegate.model
    this.simulation = delegate.simulation
  }

  validateAnalyze(mission: RealResearchMission, dossier: RealResearchDossier): void {
    this.stagePayloads(mission, dossier, undefined, undefined, undefined)
  }

  analysisStageBudget(stage: string): number {
    const budget = DEEPSEEK_MULTI_STAGE_BUDGETS[stage as DeepSeekAnalysisStageId]
    if (budget === undefined) throw new Error('MULTI_STAGE_UNKNOWN')
    return budget
  }

  async analyze(mission: RealResearchMission, dossier: RealResearchDossier, signal: AbortSignal): Promise<IntelligenceRoundAnalysis> {
    return this.analyzeMultiStage(mission, dossier, signal, async (_stage, operation) => operation())
  }

  async analyzeMultiStage(
    mission: RealResearchMission,
    dossier: RealResearchDossier,
    signal: AbortSignal,
    executeStage: DeepSeekStageExecutor,
  ): Promise<IntelligenceRoundAnalysis> {
    const aResult = await executeStage('stage_a', () => this.generate(
      'analysis_stage_a', this.stageAPayload(mission, dossier), DeepSeekStageASchema, signal,
    ))
    const a = DeepSeekStageASchema.parse(aResult.output)
    const bResult = await executeStage('stage_b', () => this.generate(
      'analysis_stage_b', this.stageBPayload(mission, dossier, a), DeepSeekStageBSchema, signal,
    ))
    const b = DeepSeekStageBSchema.parse(bResult.output)
    const cResult = await executeStage('stage_c', () => this.generate(
      'analysis_stage_c', this.stageCPayload(mission, dossier, a, b), DeepSeekStageCSchema, signal,
    ))
    const c = DeepSeekStageCSchema.parse(cResult.output)
    const dResult = await executeStage('stage_d', () => this.generate(
      'analysis_stage_d', this.stageDPayload(mission, a, b, c), DeepSeekStageDSchema, signal,
    ))
    const d = DeepSeekStageDSchema.parse(dResult.output)
    const output = assembleDeepSeekMultiStageAnalysis(mission, dossier, a, b, c, d)
    return toRoundAnalysis(mission, output, [aResult.usage, bResult.usage, cResult.usage, dResult.usage])
  }

  validateDraft(...args: Parameters<NonNullable<IntelligenceEngine['validateDraft']>>): void { this.delegate.validateDraft?.(...args) }
  draft(...args: Parameters<IntelligenceEngine['draft']>): Promise<IntelligenceDraft[]> { return this.delegate.draft(...args) }
  validateReview(...args: Parameters<NonNullable<IntelligenceEngine['validateReview']>>): void { this.delegate.validateReview?.(...args) }
  review(...args: Parameters<IntelligenceEngine['review']>): Promise<IntelligenceReview> { return this.delegate.review(...args) }

  private async generate(operation: string, payload: Record<string, unknown>, schema: z.ZodTypeAny, signal: AbortSignal): Promise<DeepSeekStageRemoteResult> {
    return this.delegate.generateStructured(operation, payload, schema, signal)
  }

  private stagePayloads(mission: RealResearchMission, dossier: RealResearchDossier, a: unknown, b: unknown, c: unknown): void {
    this.stageAPayload(mission, dossier); this.stageBPayload(mission, dossier, a); this.stageCPayload(mission, dossier, a, b); this.stageDPayload(mission, a, b, c)
  }

  private stageAPayload(mission: RealResearchMission, dossier: RealResearchDossier): Record<string, unknown> {
    return { stage: 'A_claims_evidence', destination: mission.destination, objectives: mission.objectives, profiles: mission.profiles, dossier, instruction: 'Extrae solo claims sustentados. Cada evidenceId debe existir en evidence.' }
  }
  private stageBPayload(mission: RealResearchMission, dossier: RealResearchDossier, claims: unknown): Record<string, unknown> {
    return { stage: 'B_contradictions_gaps', destination: mission.destination, claims, evidence: dossier.evidence, instruction: 'Identifica contradicciones referidas a claimIds existentes y gaps sin inventar hechos.' }
  }
  private stageCPayload(mission: RealResearchMission, dossier: RealResearchDossier, claims: unknown, findings: unknown): Record<string, unknown> {
    return { stage: 'C_coverage', destination: mission.destination, profiles: mission.profiles, claims, findings, sourceMetadata: dossier.sources.map(source => ({ id: source.id, title: source.title, score: source.score })), evidence: dossier.evidence, instruction: 'Evalúa coverage y profileCoverage usando solamente los datos estructurados.' }
  }
  private stageDPayload(mission: RealResearchMission, claims: unknown, findings: unknown, coverage: unknown): Record<string, unknown> {
    return { stage: 'D_queries_decision', round: mission.round, claims, findings, coverage, instruction: 'Propón queries solo para gapId existentes y una decisión coherente; no añadas hechos.' }
  }
}

export function assembleDeepSeekMultiStageAnalysis(
  mission: RealResearchMission,
  dossier: RealResearchDossier,
  stageA: z.infer<typeof DeepSeekStageASchema>,
  stageB: z.infer<typeof DeepSeekStageBSchema>,
  stageC: z.infer<typeof DeepSeekStageCSchema>,
  stageD: z.infer<typeof DeepSeekStageDSchema>,
): OpenAIRoundAnalysisOutput {
  void mission
  const evidenceIds = new Set(dossier.evidence.map(item => item.id))
  const claimIds = new Set(stageA.claims.map(item => item.id))
  const gapIds = new Set(stageB.gaps.map(item => item.id))
  if (claimIds.size !== stageA.claims.length || gapIds.size !== stageB.gaps.length) throw new Error('MULTI_STAGE_REFERENCE_INVALID')
  if (stageA.claims.some(claim => claim.evidenceIds.some(id => !evidenceIds.has(id)))) throw new Error('MULTI_STAGE_REFERENCE_INVALID')
  if (stageB.contradictions.some(item => item.claimIds.some(id => !claimIds.has(id)))) throw new Error('MULTI_STAGE_REFERENCE_INVALID')
  if (stageC.coverage.topics.some(topic => topic.evidenceIds.some(id => !evidenceIds.has(id)))) throw new Error('MULTI_STAGE_REFERENCE_INVALID')
  if (stageD.proposedQueries.some(query => !gapIds.has(query.gapId))) throw new Error('MULTI_STAGE_REFERENCE_INVALID')
  if (stageD.decision.queries.some(query => !gapIds.has(query.gapId))) throw new Error('MULTI_STAGE_REFERENCE_INVALID')
  const output = OpenAIRoundAnalysisOutputSchema.parse({
    claims: stageA.claims,
    contradictions: stageB.contradictions.map(item => item.text),
    coverage: stageC.coverage,
    profileCoverage: stageC.profileCoverage,
    gaps: stageB.gaps,
    proposedQueries: stageD.proposedQueries,
    decision: stageD.decision,
  })
  return output
}

function toRoundAnalysis(mission: RealResearchMission, output: OpenAIRoundAnalysisOutput, usages: IntelligenceRoundAnalysis['usage'][]): IntelligenceRoundAnalysis {
  const usage = usages.reduce<IntelligenceRoundAnalysis['usage']>((total, current) => ({
    providerId: current.providerId, model: current.model,
    inputTokens: total.inputTokens + current.inputTokens,
    cachedInputTokens: (total.cachedInputTokens ?? 0) + (current.cachedInputTokens ?? 0),
    reasoningTokens: (total.reasoningTokens ?? 0) + (current.reasoningTokens ?? 0),
    outputTokens: total.outputTokens + current.outputTokens,
    estimatedCost: total.estimatedCost + current.estimatedCost, currency: current.currency,
    providerRequestIds: [...(total.providerRequestIds ?? []), ...(current.providerRequestIds ?? [])],
  }), { providerId: 'deepseek', model: 'deepseek-flash', inputTokens: 0, outputTokens: 0, estimatedCost: 0, currency: 'EUR', providerRequestIds: [] })
  return {
    masterKnowledge: RealMasterKnowledgeSchema.parse({ requestId: mission.requestId, destinationId: mission.destination.canonicalId, revision: mission.round, claims: output.claims, contradictions: output.contradictions, generatedAt: mission.createdAt }),
    coverage: output.coverage, proposedQueries: output.proposedQueries, gaps: output.gaps, decision: output.decision, usage,
  }
}
