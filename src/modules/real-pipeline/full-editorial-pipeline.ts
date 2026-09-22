import {
  assessProfileEvidence,
  type ProfileEvidenceAssessment,
  type RealProfileSettings,
} from '@shared/real-profile-settings'
import type { RealResearchMission } from '@shared/real-pipeline-contracts'
import type {
  IntelligenceDraft,
  IntelligenceEngine,
  IntelligenceReview,
} from './ports'
import {
  type ControlledRealWorkflow,
  type RealWorkflowOutcome,
  type WorkflowCallExecutor,
} from './real-workflow'

export interface FullEditorialPipelineConfiguration {
  draftingCost: number
  reviewCost: number
}

export interface FullEditorialPipelineResult {
  research: RealWorkflowOutcome
  drafts: IntelligenceDraft[]
  review: IntelligenceReview
  evidenceAssessment: ProfileEvidenceAssessment[]
  publicationCount: 0
  regenerationCount: 0
  externalEffects: false
}

/**
 * The research process is deliberately a closed loop: each governed round
 * contains retrieval and its evidence analysis, because that analysis decides
 * whether a second focused retrieval round is allowed.  The public phase API
 * keeps that invariant while making the result addressable by the outer
 * durable executor.
 */
export type RealEditorialResearchPhaseResult = RealWorkflowOutcome

export class FullRealEditorialPipeline {
  constructor(
    private readonly workflow: ControlledRealWorkflow,
    private readonly intelligence: IntelligenceEngine,
    private readonly calls: WorkflowCallExecutor,
    private readonly configuration: FullEditorialPipelineConfiguration,
  ) {}

  async execute(
    mission: RealResearchMission,
    settings: RealProfileSettings,
    signal: AbortSignal,
  ): Promise<FullEditorialPipelineResult> {
    const research = await this.executeResearch(mission, signal)
    const analysis = this.executeAnalysis(mission, research)
    const enabledProfiles = mission.profiles.filter(profile => profile.enabled)
    const drafts = isStageRoutedIntelligence(this.intelligence)
      ? await this.draftEnabledProfiles(mission, analysis, enabledProfiles, signal)
      : await this.calls.execute(
        `${mission.taskId}:drafting`,
        this.configuration.draftingCost,
        () => this.intelligence.draft(
          mission,
          analysis.masterKnowledge,
          signal,
          analysis.editorialConstraints,
        ),
      )
    const review = await this.executeReview(mission, analysis, drafts, signal)
    const availableEvidenceWords = research.dossier.sources
      .reduce((total, source) => total + wordCount(source.content), 0)
    return {
      research,
      drafts,
      review,
      evidenceAssessment: assessProfileEvidence(settings, availableEvidenceWords),
      publicationCount: 0,
      regenerationCount: 0,
      externalEffects: false,
    }
  }

  /** Executes the governed research loop and persists through its workflow
   * checkpoint store.  It is safe to replay: `ControlledRealWorkflow` resumes
   * its durable checkpoint instead of reissuing completed provider calls. */
  async executeResearch(
    mission: RealResearchMission,
    signal: AbortSignal,
  ): Promise<RealEditorialResearchPhaseResult> {
    const research = await this.workflow.execute(mission, signal)
    if (research.state !== 'ready_for_drafting') {
      throw new FullEditorialPipelineError(
        'REVIEW_REQUIRED',
        'La investigación requiere revisión humana antes de redactar',
      )
    }
    return research
  }

  /**
   * Analysis is already executed inside every governed research round: it is
   * what decides coverage and whether another query is permitted.  This phase
   * boundary validates and exposes that durable result without inventing a
   * second, ungoverned analysis call.
   */
  executeAnalysis(
    mission: RealResearchMission,
    research: RealEditorialResearchPhaseResult,
  ): RealEditorialResearchPhaseResult {
    this.intelligence.validateDraft?.(
      mission,
      research.masterKnowledge,
      research.editorialConstraints,
    )
    return research
  }

  async executeStudent(
    mission: RealResearchMission,
    research: RealEditorialResearchPhaseResult,
    signal: AbortSignal,
  ): Promise<IntelligenceDraft> {
    return this.draftProfile(mission, research, 'student', signal)
  }

  async executeAdventure(
    mission: RealResearchMission,
    research: RealEditorialResearchPhaseResult,
    signal: AbortSignal,
  ): Promise<IntelligenceDraft> {
    return this.draftProfile(mission, research, 'adventure', signal)
  }

  async executeReview(
    mission: RealResearchMission,
    research: RealEditorialResearchPhaseResult,
    drafts: IntelligenceDraft[],
    signal: AbortSignal,
  ): Promise<IntelligenceReview> {
    this.intelligence.validateReview?.(
      mission,
      research.masterKnowledge,
      drafts,
      research.editorialConstraints,
    )
    return this.calls.execute(
      `${mission.taskId}:final-review`,
      this.configuration.reviewCost,
      () => this.intelligence.review(
        mission,
        research.masterKnowledge,
        drafts,
        signal,
        research.editorialConstraints,
      ),
    )
  }

  private async draftEnabledProfiles(
    mission: RealResearchMission,
    research: RealEditorialResearchPhaseResult,
    profiles: RealResearchMission['profiles'],
    signal: AbortSignal,
  ): Promise<IntelligenceDraft[]> {
    const drafts: IntelligenceDraft[] = []
    for (const profile of profiles) {
      drafts.push(await this.draftProfile(mission, research, profile.profile, signal))
    }
    return drafts
  }

  private async draftProfile(
    mission: RealResearchMission,
    research: RealEditorialResearchPhaseResult,
    profile: 'adventure' | 'student',
    signal: AbortSignal,
  ): Promise<IntelligenceDraft> {
    if (!isStageRoutedIntelligence(this.intelligence)) {
      throw new FullEditorialPipelineError(
        'PHASE_ROUTING_REQUIRED',
        'La redacción por perfil requiere un motor enrutable por etapa',
      )
    }
    const requested = mission.profiles.find(candidate => candidate.profile === profile && candidate.enabled)
    if (!requested) {
      throw new FullEditorialPipelineError('PROFILE_DISABLED', `El perfil ${profile} no está habilitado`)
    }
    const profileMission: RealResearchMission = { ...mission, profiles: [requested] }
    const drafts = await this.calls.execute(
      `${mission.taskId}:draft_${profile}`,
      this.configuration.draftingCost / mission.profiles.filter(candidate => candidate.enabled).length,
      () => this.intelligence.draft(
        profileMission,
        research.masterKnowledge,
        signal,
        research.editorialConstraints,
      ),
    )
    const draft = drafts.find(candidate => candidate.profile === profile)
    if (!draft) throw new FullEditorialPipelineError('PROFILE_DRAFT_MISSING', `No se devolvió el borrador ${profile}`)
    return draft
  }

}

export class FullEditorialPipelineError extends Error {
  constructor(
    readonly code: 'REVIEW_REQUIRED' | 'PHASE_ROUTING_REQUIRED' | 'PROFILE_DISABLED' | 'PROFILE_DRAFT_MISSING',
    message: string,
  ) {
    super(message)
    this.name = 'FullEditorialPipelineError'
  }
}

function wordCount(value: string): number {
  return value.trim() ? value.trim().split(/\s+/).length : 0
}

function isStageRoutedIntelligence(engine: IntelligenceEngine): boolean {
  return (engine as IntelligenceEngine & { routedByStage?: boolean }).routedByStage === true
}
