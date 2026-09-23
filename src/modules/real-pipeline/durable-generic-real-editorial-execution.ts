import {
  FullRealEditorialPipeline,
  type RealEditorialResearchPhaseResult,
} from './full-editorial-pipeline'
import { ControlledRealWorkflow, type RealWorkflowOutcome } from './real-workflow'
import { CostLedgerService } from './cost-ledger'
import { LedgeredWorkflowCallExecutor } from './ledgered-call-executor'
import {
  createGenericLedgerMetadataFactory,
  createGenericRealEditorialMission,
  type GenericEditorialPhaseResult,
  type GenericRealEditorialExecutionContext,
} from './generic-real-editorial-execution'
import {
  SupabaseGenericDurableExecutionRepository,
  SupabaseGenericExecutionLedgerRepository,
  type GenericDurableArtifactReference,
} from './generic-durable-execution-repository'
import type { IntelligenceDraft, RealPipelineProviderSelection } from './ports'
import { REAL_EDITORIAL_OPERATION_BUDGETS } from './durable-real-editorial-pipeline'
import type { BatchSharedLibraryTransition } from '@modules/library-versioning/batch-library-transition'

export interface DurableGenericRealEditorialExecutionDependencies {
  repository: SupabaseGenericDurableExecutionRepository
  providers: RealPipelineProviderSelection
  library?: BatchSharedLibraryTransition
  actorId?: string
  now?: () => Date
}

/**
 * Concrete execution core for durable owners. It deliberately uses the same
 * governed workflow, full-profile pipeline and ledger executor as pilots;
 * owner-specific persistence is supplied by the generic repository.
 */
export class DurableGenericRealEditorialExecution {
  private readonly now: () => Date

  constructor(private readonly dependencies: DurableGenericRealEditorialExecutionDependencies) {
    this.now = dependencies.now ?? (() => new Date())
  }

  async executeResearch(context: GenericRealEditorialExecutionContext, signal: AbortSignal): Promise<GenericEditorialPhaseResult> {
    const runtime = await this.runtime(context)
    const existing = await runtime.repository.latestArtifactReference(runtime.execution.id, 'master_knowledge', 'final')
    if (existing) return { artifactRef: existing.id, actualCost: 0 }
    const research = await runtime.pipeline.executeResearch(runtime.mission, signal)
    await runtime.repository.appendArtifact(runtime.execution.id, 'master_knowledge', 'final', 1, research)
    const stored = await this.requireArtifact(runtime, 'master_knowledge', 'final')
    return { artifactRef: stored.id, actualCost: runtime.calls.snapshot().spentCost }
  }

  /** Analysis belongs to the governed research loop. This phase makes its
   * persisted, coverage-validated output independently addressable. */
  async executeAnalysis(context: GenericRealEditorialExecutionContext, signal: AbortSignal): Promise<GenericEditorialPhaseResult> {
    const runtime = await this.runtime(context)
    const existing = await runtime.repository.latestArtifactReference(runtime.execution.id, 'coverage', 'final')
    if (existing) return { artifactRef: existing.id, actualCost: 0 }
    const research = await this.loadResearch(runtime, signal)
    const analysis = runtime.pipeline.executeAnalysis(runtime.mission, research)
    await runtime.repository.appendArtifact(runtime.execution.id, 'coverage', 'final', 1, analysis)
    const stored = await this.requireArtifact(runtime, 'coverage', 'final')
    return { artifactRef: stored.id, actualCost: 0 }
  }

  async executeStudent(context: GenericRealEditorialExecutionContext, signal: AbortSignal): Promise<GenericEditorialPhaseResult> {
    return this.executeProfile(context, 'student', signal)
  }

  async executeAdventure(context: GenericRealEditorialExecutionContext, signal: AbortSignal): Promise<GenericEditorialPhaseResult> {
    return this.executeProfile(context, 'adventure', signal)
  }

  async executeReview(context: GenericRealEditorialExecutionContext, signal: AbortSignal): Promise<GenericEditorialPhaseResult> {
    const runtime = await this.runtime(context)
    const reviewKey = this.reviewKey(context)
    const existing = await runtime.repository.latestArtifactReference(runtime.execution.id, 'final_review', reviewKey)
    if (existing) return { artifactRef: existing.id, actualCost: 0 }
    const research = await this.loadResearch(runtime, signal)
    const student = await this.requireArtifact(runtime, 'draft_student', this.profileKey(context, 'student'))
    const adventure = await this.requireArtifact(runtime, 'draft_adventure', this.profileKey(context, 'adventure'))
    const review = await runtime.pipeline.executeReview(
      runtime.mission,
      research,
      [student.payload as IntelligenceDraft, adventure.payload as IntelligenceDraft],
      signal,
    )
    await runtime.repository.appendArtifact(runtime.execution.id, 'final_review', reviewKey, 1, review)
    const stored = await this.requireArtifact(runtime, 'final_review', reviewKey)
    return { artifactRef: stored.id, actualCost: runtime.calls.snapshot().spentCost, warnings: review.issues }
  }

  private async executeProfile(
    context: GenericRealEditorialExecutionContext,
    profile: 'student' | 'adventure',
    signal: AbortSignal,
  ): Promise<GenericEditorialPhaseResult> {
    const runtime = await this.runtime(context)
    const kind = profile === 'student' ? 'draft_student' : 'draft_adventure'
    const artifactKey = this.profileKey(context, profile)
    let artifact = await runtime.repository.latestArtifactReference(runtime.execution.id, kind, artifactKey)
    let actualCost = 0
    const regenerates = this.regeneratesProfile(context, profile)
    if (!artifact || regenerates) {
      const research = await this.loadResearch(runtime, signal)
      const draft = profile === 'student'
        ? await runtime.pipeline.executeStudent(runtime.mission, research, signal)
        : await runtime.pipeline.executeAdventure(runtime.mission, research, signal)
      await runtime.repository.appendArtifact(runtime.execution.id, kind, artifactKey, (artifact?.version ?? 0) + 1, draft)
      artifact = await this.requireArtifact(runtime, kind, artifactKey)
      actualCost = runtime.calls.snapshot().spentCost
    }
    if (context.owner.type !== 'BATCH_JOB') return { artifactRef: artifact.id, artifactKey, actualCost }
    const library = this.dependencies.library
    const actorId = this.dependencies.actorId
    if (!library || !actorId) throw new DurableGenericExecutionError('LIBRARY_TRANSITION_UNAVAILABLE', 'La transición compartida de Library no está configurada')
    const reference = await library.materialize({
      executionOwnerId: runtime.execution.id,
      destination: runtime.context.destination,
      sourceArtifact: { id: artifact.id, payloadHash: artifact.payloadHash },
      draft: artifact.payload as IntelligenceDraft,
      actorId,
    })
    const libraryCheckpointKey = regenerates ? `library/${profile}/redo/${context.redo!.operationId}` : `library/${profile}`
    await runtime.repository.appendArtifact(runtime.execution.id, 'checkpoint', libraryCheckpointKey, 1, reference)
    return { artifactRef: reference.revisionId, artifactKey, actualCost }
  }

  private async runtime(context: GenericRealEditorialExecutionContext) {
    const repository = this.dependencies.repository
    const execution = await repository.ensureExecution(context, {
      taskLimitCost: context.policy.limits.taskBudgetEur,
      batchLimitCost: context.policy.limits.batchBudgetEur,
      dailyLimitCost: context.policy.limits.dailyBudgetEur,
    })
    const missionArtifact = await repository.latestArtifact(execution.id, 'mission', 'initial')
    const storedMission = missionArtifact
      ? missionArtifact.payload as ReturnType<typeof createGenericRealEditorialMission>
      : createGenericRealEditorialMission(context, this.now())
    if (!missionArtifact) await repository.appendArtifact(execution.id, 'mission', 'initial', 1, storedMission)
    // A redo preserves the durable execution and its research artifacts, but
    // must own a fresh task identity for new provider reservations.
    const mission = context.redo ? { ...storedMission, runId: context.runId, taskId: context.taskId } : storedMission
    const ledger = new CostLedgerService(new SupabaseGenericExecutionLedgerRepository(
      repository.client,
      execution.id,
      context,
    ), { now: this.now })
    const calls = new LedgeredWorkflowCallExecutor(
      ledger,
      createGenericLedgerMetadataFactory(context, this.dependencies.providers.intelligenceEngine),
      context.policy.limits.taskBudgetEur,
    )
    const workflow = new ControlledRealWorkflow(
      this.dependencies.providers,
      repository.checkpointStore(execution.id, context.redo ? `workflow/redo/${context.redo.operationId}` : 'workflow'),
      calls,
      {
        researchCostPerRound: REAL_EDITORIAL_OPERATION_BUDGETS.researchPerRound,
        analysisCostPerRound: REAL_EDITORIAL_OPERATION_BUDGETS.analysisPerRound,
        completionCostAfterFirstRound: REAL_EDITORIAL_OPERATION_BUDGETS.researchPerRound
          + REAL_EDITORIAL_OPERATION_BUDGETS.analysisPerRound
          + REAL_EDITORIAL_OPERATION_BUDGETS.drafting
          + REAL_EDITORIAL_OPERATION_BUDGETS.finalReview,
        budgetLimit: context.policy.limits.taskBudgetEur,
        ledgerBudgetAuthoritative: true,
        now: this.now,
      },
    )
    return {
      context, execution, repository, mission, calls,
      pipeline: new FullRealEditorialPipeline(workflow, this.dependencies.providers.intelligenceEngine, calls, {
        draftingCost: REAL_EDITORIAL_OPERATION_BUDGETS.drafting,
        reviewCost: REAL_EDITORIAL_OPERATION_BUDGETS.finalReview,
      }),
    }
  }

  private async loadResearch(runtime: Awaited<ReturnType<DurableGenericRealEditorialExecution['runtime']>>, signal: AbortSignal): Promise<RealEditorialResearchPhaseResult> {
    const artifact = await runtime.repository.latestArtifact(runtime.execution.id, 'master_knowledge', 'final')
    if (artifact) return artifact.payload as RealWorkflowOutcome
    await this.executeResearch(runtime.context, signal)
    const recovered = await runtime.repository.latestArtifact(runtime.execution.id, 'master_knowledge', 'final')
    if (!recovered) throw new DurableGenericExecutionError('RESEARCH_ARTIFACT_REQUIRED', 'La investigación no dejó un artifact durable')
    return recovered.payload as RealWorkflowOutcome
  }

  private profileKey(context: GenericRealEditorialExecutionContext, profile: 'student' | 'adventure'): string {
    void context
    return profile
  }

  private regeneratesProfile(context: GenericRealEditorialExecutionContext, profile: 'student' | 'adventure'): boolean {
    return Boolean(context.redo && (context.redo.scope === 'EDITORIAL' || (context.redo.scope === 'STUDENT' && profile === 'student') || (context.redo.scope === 'ADVENTURE' && profile === 'adventure')))
  }

  private reviewKey(context: GenericRealEditorialExecutionContext): string { return context.redo ? `redo/${context.redo.operationId}` : 'final' }

  private async requireArtifact(
    runtime: Awaited<ReturnType<DurableGenericRealEditorialExecution['runtime']>>,
    kind: GenericDurableArtifactReference['kind'],
    key: string,
  ): Promise<GenericDurableArtifactReference> {
    const artifact = await runtime.repository.latestArtifactReference(runtime.execution.id, kind, key)
    if (!artifact) throw new DurableGenericExecutionError('ARTIFACT_REQUIRED', `Falta ${kind}/${key}`)
    return artifact
  }
}

export class DurableGenericExecutionError extends Error {
  constructor(readonly code: 'ARTIFACT_REQUIRED' | 'RESEARCH_ARTIFACT_REQUIRED' | 'LIBRARY_TRANSITION_UNAVAILABLE', message: string) {
    super(message)
    this.name = 'DurableGenericExecutionError'
  }
}
