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
    const research = await this.workflow.execute(mission, signal)
    if (research.state !== 'ready_for_drafting') {
      throw new FullEditorialPipelineError(
        'REVIEW_REQUIRED',
        'La investigación requiere revisión humana antes de redactar',
      )
    }
    this.intelligence.validateDraft?.(
      mission,
      research.masterKnowledge,
      research.editorialConstraints,
    )
    const drafts = await this.calls.execute(
      `${mission.taskId}:drafting`,
      this.configuration.draftingCost,
      () => this.intelligence.draft(
        mission,
        research.masterKnowledge,
        signal,
        research.editorialConstraints,
      ),
    )
    this.intelligence.validateReview?.(
      mission,
      research.masterKnowledge,
      drafts,
      research.editorialConstraints,
    )
    const review = await this.calls.execute(
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
}

export class FullEditorialPipelineError extends Error {
  constructor(readonly code: 'REVIEW_REQUIRED', message: string) {
    super(message)
    this.name = 'FullEditorialPipelineError'
  }
}

function wordCount(value: string): number {
  return value.trim() ? value.trim().split(/\s+/).length : 0
}
