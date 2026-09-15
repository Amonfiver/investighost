import type {
  RealMasterKnowledge,
  RealResearchDossier,
  RealResearchMission,
} from '@shared/real-pipeline-contracts'
import type { RealEditorialCoverageConstraints } from '@shared/real-editorial-pilot-contracts'
import type {
  IntelligenceDraft,
  IntelligenceEngine,
  IntelligenceReview,
  IntelligenceRoundAnalysis,
} from './ports'
import type { IntelligenceRoutingStage, ResolvedIntelligenceRoute } from './llm-routing'

export interface RoutedIntelligenceStage {
  route: ResolvedIntelligenceRoute
  engine: IntelligenceEngine
}

/**
 * El workflow conserva un único IntelligenceEngine; este router decide el
 * adapter justo antes de cada operación y no filtra detalles de proveedor al
 * contrato editorial.
 */
export class RoutedIntelligenceEngine implements IntelligenceEngine {
  readonly id = 'configured-llm-routing'
  readonly model: string
  readonly simulation: boolean
  readonly analysisStrategy?: 'deepseek_multi_stage'

  constructor(private readonly stages: Record<IntelligenceRoutingStage, RoutedIntelligenceStage>) {
    this.model = stages.analysis.route.model
    this.simulation = Object.values(stages).every(stage => stage.engine.simulation)
    this.analysisStrategy = stages.analysis.engine.analysisStrategy
  }

  routeFor(stage: IntelligenceRoutingStage): ResolvedIntelligenceRoute {
    return this.stages[stage].route
  }

  validateAnalyze(mission: RealResearchMission, dossier: RealResearchDossier): void {
    this.stages.analysis.engine.validateAnalyze?.(mission, dossier)
  }

  analyze(
    mission: RealResearchMission,
    dossier: RealResearchDossier,
    signal: AbortSignal,
  ): Promise<IntelligenceRoundAnalysis> {
    return this.stages.analysis.engine.analyze(mission, dossier, signal)
  }

  get analysisStageIds(): readonly string[] | undefined {
    return this.stages.analysis.engine.analysisStageIds
  }

  analysisStageBudget(stage: string): number {
    const budget = this.stages.analysis.engine.analysisStageBudget
    if (!budget) throw new Error('La ruta analysis no admite etapas')
    return budget.call(this.stages.analysis.engine, stage)
  }

  analyzeMultiStage(...args: Parameters<NonNullable<IntelligenceEngine['analyzeMultiStage']>>) {
    const run = this.stages.analysis.engine.analyzeMultiStage
    if (!run) throw new Error('La ruta analysis no admite etapas')
    return run.apply(this.stages.analysis.engine, args)
  }

  validateDraft(
    mission: RealResearchMission,
    knowledge: RealMasterKnowledge,
    constraints?: RealEditorialCoverageConstraints,
  ): void {
    for (const profile of mission.profiles.filter(item => item.enabled)) {
      this.stageForProfile(profile.profile).engine.validateDraft?.(
        missionWithOnlyProfile(mission, profile.profile), knowledge, constraints,
      )
    }
  }

  async draft(
    mission: RealResearchMission,
    knowledge: RealMasterKnowledge,
    signal: AbortSignal,
    constraints?: RealEditorialCoverageConstraints,
  ): Promise<IntelligenceDraft[]> {
    const drafts: IntelligenceDraft[] = []
    for (const profile of mission.profiles.filter(item => item.enabled)) {
      const result = await this.stageForProfile(profile.profile).engine.draft(
        missionWithOnlyProfile(mission, profile.profile), knowledge, signal, constraints,
      )
      drafts.push(...result)
    }
    return drafts
  }

  validateReview(
    mission: RealResearchMission,
    knowledge: RealMasterKnowledge,
    drafts: IntelligenceDraft[],
    constraints?: RealEditorialCoverageConstraints,
  ): void {
    this.stages.review.engine.validateReview?.(mission, knowledge, drafts, constraints)
  }

  review(
    mission: RealResearchMission,
    knowledge: RealMasterKnowledge,
    drafts: IntelligenceDraft[],
    signal: AbortSignal,
    constraints?: RealEditorialCoverageConstraints,
  ): Promise<IntelligenceReview> {
    return this.stages.review.engine.review(mission, knowledge, drafts, signal, constraints)
  }

  private stageForProfile(profile: 'adventure' | 'student'): RoutedIntelligenceStage {
    return profile === 'adventure' ? this.stages.draft_adventure : this.stages.draft_student
  }
}

function missionWithOnlyProfile(
  mission: RealResearchMission,
  profile: 'adventure' | 'student',
): RealResearchMission {
  return {
    ...mission,
    profiles: mission.profiles.filter(item => item.enabled && item.profile === profile),
  }
}
