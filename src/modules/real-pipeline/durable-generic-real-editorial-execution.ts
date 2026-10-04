import { randomUUID } from 'node:crypto'
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
import type { IntelligenceDraft, IntelligenceEngine, IntelligenceReview, IntelligenceRoundAnalysis, RealPipelineProviderSelection } from './ports'
import type { IntelligenceRoutingStage, ResolvedIntelligenceRoute } from './llm-routing'
import type { RealEditorialCoverageConstraints } from '@shared/real-editorial-pilot-contracts'
import type { RealMasterKnowledge, RealResearchDossier, RealResearchMission } from '@shared/real-pipeline-contracts'
import type { ZodTypeAny } from 'zod'
import { REAL_EDITORIAL_OPERATION_BUDGETS } from './durable-real-editorial-pipeline'
import type { BatchSharedLibraryTransition } from '@modules/library-versioning/batch-library-transition'
import { redoGenerationStrategy, redoVariation } from '@shared/redo-guidance-contracts'
import { assessRedoVariation, enforceRedoVariation, veryDifferentConstraint, type RedoVariationTrace } from './redo-variation-policy'
import {
  GeneratedAdventurePackageV1Schema,
  GeneratedStudentDocumentV1Schema,
  generateAdventurePackageV1,
  generateStudentDocumentV1,
  projectAdventurePackageToLegacyText,
  projectStudentDocumentToLegacyText,
  type StructuredGenerationTransport,
} from './structured-generation-runtime'
import { StructuredEditorialPackageArtifactService, composeStructuredEditorialPackage } from '@modules/editorial-pipeline/structured-editorial-package-service'
import type { AdventurePackageV1, StudentDocumentV1 } from '@shared/structured-editorial-package-contracts'

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
    const redoWarnings = await this.redoWarnings(runtime, context)
    const reviewed = redoWarnings.length > 0 ? { ...review, issues: [...review.issues, ...redoWarnings] } : review
    await runtime.repository.appendArtifact(runtime.execution.id, 'final_review', reviewKey, 1, reviewed)
    const stored = await this.requireArtifact(runtime, 'final_review', reviewKey)
    return { artifactRef: stored.id, actualCost: runtime.calls.snapshot().spentCost, warnings: reviewed.issues }
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
    const structuredKind = profile === 'student' ? 'student_document' : 'adventure_package'
    let structuredArtifact = await runtime.repository.latestArtifactReference(runtime.execution.id, structuredKind, artifactKey)
    let actualCost = 0
    const regenerates = this.regeneratesProfile(context, profile)
    const transport = runtime.structuredTransport
    if (transport && (!structuredArtifact || regenerates)) {
      const research = await this.loadResearch(runtime, signal)
      const previous = structuredArtifact?.payload as { document?: StudentDocumentV1 | AdventurePackageV1 } | undefined
      const draftingReservation = REAL_EDITORIAL_OPERATION_BUDGETS.drafting / runtime.mission.profiles.filter(candidate => candidate.enabled).length
      const generate = (attempt: 1 | 2) => runtime.calls.execute<
        Awaited<ReturnType<typeof generateStudentDocumentV1>> | Awaited<ReturnType<typeof generateAdventurePackageV1>>
      >(
        `${runtime.mission.taskId}:draft_${profile}${attempt === 2 ? ':variation-attempt-2' : ''}`,
        draftingReservation,
        () => profile === 'student'
          ? generateStudentDocumentV1(transport, {
            destination: { id: runtime.context.destination.destinationId, name: runtime.context.destination.name, countryCode: runtime.context.destination.countryCode, region: runtime.context.destination.region },
            masterKnowledge: research.masterKnowledge, dossier: research.dossier, guidance: context.redo?.guidance,
            ...(previous?.document ? { previousRevision: { revisionId: context.redo?.previousArtifactRefs?.[profile.toUpperCase()] ?? 'previous-document', document: previous.document } } : {}),
            ...((attempt === 2 || (attempt === 1 && context.redo?.guidance && redoVariation(context.redo.guidance) === 'VERY_DIFFERENT')) ? { variationAttempt: { attempt, ...(attempt === 2 ? { previousFailure: 'REDO_OUTPUT_TOO_SIMILAR_TO_PREVIOUS' as const } : {}), constraint: veryDifferentConstraint(attempt) } } : {}),
          }, signal)
          : generateAdventurePackageV1(transport, {
            destination: { id: runtime.context.destination.destinationId, name: runtime.context.destination.name, countryCode: runtime.context.destination.countryCode, region: runtime.context.destination.region },
            masterKnowledge: research.masterKnowledge, dossier: research.dossier, guidance: context.redo?.guidance,
            ...(previous?.document ? { previousRevision: { revisionId: context.redo?.previousArtifactRefs?.[profile.toUpperCase()] ?? 'previous-package', document: previous.document } } : {}),
            ...((attempt === 2 || (attempt === 1 && context.redo?.guidance && redoVariation(context.redo.guidance) === 'VERY_DIFFERENT')) ? { variationAttempt: { attempt, ...(attempt === 2 ? { previousFailure: 'REDO_OUTPUT_TOO_SIMILAR_TO_PREVIOUS' as const } : {}), constraint: veryDifferentConstraint(attempt) } } : {}),
          }, signal),
      )
      const first = await generate(1)
      let generated = first
      if (context.redo?.guidance && previous?.document) {
        const variation = redoVariation(context.redo.guidance)
        const assessment = assessRedoVariation(variation, previous.document, first.document)
        const retryAllowed = variation === 'VERY_DIFFERENT' && assessment.result === 'FAIL' && !signal.aborted
          && runtime.calls.canExecute(`${runtime.mission.taskId}:draft_${profile}:variation-attempt-2`, draftingReservation)
        let retryGenerated: typeof first | null = null
        try {
          await enforceRedoVariation({
            variation, previous: previous.document, first: first.document,
            canRetry: retryAllowed,
            onTrace: async trace => this.saveRedoVariationTrace(runtime, context, profile, trace),
            generateRetry: retryAllowed ? async () => {
              retryGenerated = await generate(2)
              return retryGenerated.document
            } : undefined,
          })
          if (retryGenerated) generated = retryGenerated
        } catch (error) {
          if (signal.aborted) throw error
          await this.saveRedoVariationTrace(runtime, context, profile, {
            variation, targetMet: false, warning: 'REDO_VARIATION_TARGET_NOT_MET',
            attempts: [{ attempt: 1, result: assessment.result, similarity: assessment.similarity, threshold: assessment.threshold, retryTriggered: retryAllowed }],
          })
        }
      }
      const nextVersion = (structuredArtifact?.version ?? 0) + 1
      await runtime.repository.appendArtifact(runtime.execution.id, structuredKind, artifactKey, nextVersion, {
        document: generated.document, visualIntents: generated.visualIntents,
      })
      await runtime.repository.appendArtifact(runtime.execution.id, 'visual_intent', profile, nextVersion, generated.visualIntents)
      structuredArtifact = await this.requireArtifact(runtime, structuredKind, artifactKey)
      const draft = this.legacyDraft(profile, generated.document, generated.usage)
      await runtime.repository.appendArtifact(runtime.execution.id, kind, artifactKey, (artifact?.version ?? 0) + 1, draft)
      artifact = await this.requireArtifact(runtime, kind, artifactKey)
      actualCost = runtime.calls.snapshot().spentCost
    } else if (!artifact || regenerates) {
      const research = await this.loadResearch(runtime, signal)
      const mission = regenerates ? this.guidedMission(runtime.mission, context, profile, artifact?.payload as IntelligenceDraft | undefined) : runtime.mission
      const draft = profile === 'student'
        ? await runtime.pipeline.executeStudent(mission, research, signal)
        : await runtime.pipeline.executeAdventure(mission, research, signal)
      if (context.redo) await runtime.repository.appendArtifact(runtime.execution.id, 'checkpoint', `redo-guidance/${context.redo.operationId}/${profile}`, 1, {
        guidance: context.redo.guidance ?? null, reason: context.redo.reason ?? null,
        previousRevisionId: context.redo.previousArtifactRefs?.[profile.toUpperCase()] ?? null,
        warning: this.similarityWarning(context, artifact?.payload as IntelligenceDraft | undefined, draft),
      })
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
      sourceArtifact: { id: structuredArtifact?.id ?? artifact.id, payloadHash: structuredArtifact?.payloadHash ?? artifact.payloadHash },
      draft: artifact.payload as IntelligenceDraft,
      actorId,
    })
    const libraryCheckpointKey = regenerates ? `library/${profile}/redo/${context.redo!.operationId}` : `library/${profile}`
    await runtime.repository.appendArtifact(runtime.execution.id, 'checkpoint', libraryCheckpointKey, 1, reference)
    if (structuredArtifact) await runtime.repository.appendArtifact(runtime.execution.id, 'checkpoint', `structured-library/${profile}${regenerates ? `/redo/${context.redo!.operationId}` : ''}`, 1, reference)
    if (structuredArtifact && (profile === 'adventure' || (profile === 'student' && regenerates))) await this.saveStructuredPackage(runtime, context)
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
      undefined,
      undefined,
      (_operationId, reservation) => repository.canRetryTerminalAnalysisAfterHumanResolution(
        execution.id,
        reservation,
      ),
    )
    // The generic batch owner must persist each successful multi-stage
    // analysis result before advancing to the next remote call.  Otherwise a
    // Stage B failure makes a completed Stage A indistinguishable from a call
    // that never happened after a process restart.
    const intelligenceEngine = new DurableGenericIntelligenceEngine(
      this.dependencies.providers.intelligenceEngine,
      repository,
      execution.id,
    )
    const providers = { ...this.dependencies.providers, intelligenceEngine }
    const workflow = new ControlledRealWorkflow(
      providers,
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
      structuredTransport: hasStructuredTransport(intelligenceEngine)
        ? intelligenceEngine as StructuredGenerationTransport
        : undefined,
      pipeline: new FullRealEditorialPipeline(workflow, intelligenceEngine, calls, {
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

  private legacyDraft(
    profile: 'student' | 'adventure',
    document: StudentDocumentV1 | AdventurePackageV1,
    usage: { providerId: string; model: string; inputTokens: number; cachedInputTokens?: number; outputTokens: number; estimatedCost: number; currency: 'EUR' | 'USD'; providerRequestIds?: string[] },
  ): IntelligenceDraft {
    const isStudent = profile === 'student'
    const title = isStudent ? (document as StudentDocumentV1).headline : (document as AdventurePackageV1).copy.headline
    const content = isStudent ? projectStudentDocumentToLegacyText(document as StudentDocumentV1) : projectAdventurePackageToLegacyText(document as AdventurePackageV1)
    return {
      profile, title, content, approximateWordCount: content.trim().split(/\s+/).filter(Boolean).length,
      promptVersion: 'structured-generation-v1', schemaVersion: isStudent ? 'student-document-v1' : 'adventure-package-v1', usage,
    }
  }

  private async saveStructuredPackage(
    runtime: Awaited<ReturnType<DurableGenericRealEditorialExecution['runtime']>>,
    context: GenericRealEditorialExecutionContext,
  ): Promise<void> {
    const studentRedo = context.redo?.scope === 'EDITORIAL' || context.redo?.scope === 'STUDENT'
    const adventureRedo = context.redo?.scope === 'EDITORIAL' || context.redo?.scope === 'ADVENTURE'
    const [masterKnowledge, studentArtifact, adventureArtifact, studentRevision, adventureRevision] = await Promise.all([
      this.requireArtifact(runtime, 'master_knowledge', 'final'),
      this.requireArtifact(runtime, 'student_document', this.profileKey(context, 'student')),
      this.requireArtifact(runtime, 'adventure_package', this.profileKey(context, 'adventure')),
      this.requireArtifact(runtime, 'checkpoint', `structured-library/student${studentRedo ? `/redo/${context.redo!.operationId}` : ''}`),
      this.requireArtifact(runtime, 'checkpoint', `structured-library/adventure${adventureRedo ? `/redo/${context.redo!.operationId}` : ''}`),
    ])
    const student = GeneratedStudentDocumentV1Schema.parse(studentArtifact.payload)
    const adventure = GeneratedAdventurePackageV1Schema.parse(adventureArtifact.payload)
    const packageValue = composeStructuredEditorialPackage({
      masterKnowledgeArtifactId: masterKnowledge.id,
      package: {
        version: 'structured-editorial-package-v1', packageId: randomUUID(), executionId: runtime.execution.id,
        destinationId: runtime.context.destination.destinationId, masterKnowledgeArtifactId: masterKnowledge.id,
        state: 'STRUCTURED_GENERATED',
        student: { document: student.document, libraryRevision: libraryRevision(studentRevision.payload) },
        adventure: { document: adventure.document, libraryRevision: libraryRevision(adventureRevision.payload) },
        visualIntents: [...student.visualIntents, ...adventure.visualIntents],
      },
    })
    await new StructuredEditorialPackageArtifactService(runtime.repository).save(runtime.execution.id, packageValue)
  }

  private profileKey(context: GenericRealEditorialExecutionContext, profile: 'student' | 'adventure'): string {
    void context
    return profile
  }

  private regeneratesProfile(context: GenericRealEditorialExecutionContext, profile: 'student' | 'adventure'): boolean {
    return Boolean(context.redo && (context.redo.scope === 'EDITORIAL' || (context.redo.scope === 'STUDENT' && profile === 'student') || (context.redo.scope === 'ADVENTURE' && profile === 'adventure')))
  }

  private reviewKey(context: GenericRealEditorialExecutionContext): string { return context.redo ? `redo/${context.redo.operationId}` : 'final' }

  private guidedMission(
    mission: Awaited<ReturnType<DurableGenericRealEditorialExecution['runtime']>>['mission'],
    context: GenericRealEditorialExecutionContext,
    profile: 'student' | 'adventure',
    previous: IntelligenceDraft | undefined,
  ) {
    if (!context.redo?.guidance) return mission
    return {
      ...mission,
      redoGuidance: context.redo.guidance,
      redoReason: context.redo.reason,
      ...(previous ? { previousRevision: { revisionId: context.redo.previousArtifactRefs?.[profile.toUpperCase()] ?? 'previous-draft', content: previous.content } } : {}),
      objectives: [...mission.objectives, redoGenerationStrategy(context.redo.guidance, profile).instruction],
    }
  }

  private similarityWarning(context: GenericRealEditorialExecutionContext, previous: IntelligenceDraft | undefined, next: IntelligenceDraft): string | null {
    if (!previous || !context.redo?.guidance || redoVariation(context.redo.guidance) !== 'VERY_DIFFERENT') return null
    const words = (value: string) => new Set(value.toLocaleLowerCase('es').match(/[\p{L}\p{N}]{4,}/gu) ?? [])
    const left = words(previous.content); const right = words(next.content)
    const overlap = [...left].filter(word => right.has(word)).length / Math.max(1, Math.min(left.size, right.size))
    return overlap >= 0.85 ? 'REDO_OUTPUT_TOO_SIMILAR_TO_PREVIOUS' : null
  }

  private async redoWarnings(runtime: Awaited<ReturnType<DurableGenericRealEditorialExecution['runtime']>>, context: GenericRealEditorialExecutionContext): Promise<string[]> {
    if (!context.redo) return []
    const profiles = context.redo.scope === 'EDITORIAL' ? ['student', 'adventure'] : context.redo.scope === 'STUDENT' ? ['student'] : context.redo.scope === 'ADVENTURE' ? ['adventure'] : []
    const warnings: string[] = []
    for (const profile of profiles) {
      const variation = await runtime.repository.latestArtifact(runtime.execution.id, 'checkpoint', `redo-variation/${context.redo.operationId}/${profile}`)
      const artifact = variation ?? await runtime.repository.latestArtifact(runtime.execution.id, 'checkpoint', `redo-guidance/${context.redo.operationId}/${profile}`)
      const warning = (artifact?.payload as { warning?: unknown } | undefined)?.warning
      if (typeof warning === 'string') warnings.push(warning)
    }
    return warnings
  }

  private async saveRedoVariationTrace(
    runtime: Awaited<ReturnType<DurableGenericRealEditorialExecution['runtime']>>,
    context: GenericRealEditorialExecutionContext,
    profile: 'student' | 'adventure',
    trace: RedoVariationTrace,
  ): Promise<void> {
    if (!context.redo) return
    const key = `redo-variation/${context.redo.operationId}/${profile}`
    const previous = await runtime.repository.latestArtifactReference(runtime.execution.id, 'checkpoint', key)
    await runtime.repository.appendArtifact(runtime.execution.id, 'checkpoint', key, (previous?.version ?? 0) + 1, {
      redoOperationId: context.redo.operationId,
      profile,
      ...trace,
    })
  }

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

/**
 * Owner-neutral equivalent of the pilot's durable intelligence adapter.  It
 * deliberately stores only the validated stage output and usage, never a
 * prompt or credential.  The artifact key is stable, so a restart can reuse
 * a completed stage without issuing it again.
 */
export class DurableGenericIntelligenceEngine implements IntelligenceEngine {
  readonly id: string
  readonly model: string
  readonly simulation: boolean
  readonly analysisStrategy?: 'deepseek_multi_stage'

  constructor(
    private readonly delegate: IntelligenceEngine,
    private readonly repository: SupabaseGenericDurableExecutionRepository,
    private readonly executionOwnerId: string,
  ) {
    this.id = delegate.id
    this.model = delegate.model
    this.simulation = delegate.simulation
    this.analysisStrategy = delegate.analysisStrategy
  }

  get analysisStageIds(): readonly string[] | undefined { return this.delegate.analysisStageIds }

  routeFor(stage: IntelligenceRoutingStage): ResolvedIntelligenceRoute {
    const routed = this.delegate as IntelligenceEngine & { routeFor?: (value: IntelligenceRoutingStage) => ResolvedIntelligenceRoute }
    if (routed.routeFor) return routed.routeFor(stage)
    return { providerId: this.id === 'deepseek' || this.model === 'deepseek-flash' ? 'deepseek' : 'openai', model: this.model, apiModel: this.model }
  }

  validateAnalyze(mission: RealResearchMission, dossier: RealResearchDossier): void {
    this.delegate.validateAnalyze?.(mission, dossier)
  }

  analysisStageBudget(stage: string): number {
    if (!this.delegate.analysisStageBudget) throw new Error('MULTI_STAGE_UNAVAILABLE')
    return this.delegate.analysisStageBudget(stage)
  }

  analyze(...args: Parameters<IntelligenceEngine['analyze']>): Promise<IntelligenceRoundAnalysis> {
    return this.delegate.analyze(...args)
  }

  async analyzeMultiStage(...args: Parameters<NonNullable<IntelligenceEngine['analyzeMultiStage']>>): Promise<IntelligenceRoundAnalysis> {
    const [mission, dossier, signal, executeStage] = args
    if (!this.delegate.analyzeMultiStage) throw new Error('MULTI_STAGE_UNAVAILABLE')
    return this.delegate.analyzeMultiStage(mission, dossier, signal, async (stage, operation) => {
      const key = `analysis-stage/round-${mission.round}/${stage}`
      const existing = await this.repository.latestArtifact(this.executionOwnerId, 'checkpoint', key)
      if (existing && isStageCheckpoint(existing.payload)) return structuredClone(existing.payload)
      const result = await executeStage(stage, operation)
      const prior = await this.repository.latestArtifact(this.executionOwnerId, 'checkpoint', key)
      await this.repository.appendArtifact(this.executionOwnerId, 'checkpoint', key, (prior?.version ?? 0) + 1, {
        stage,
        output: result.output,
        usage: result.usage,
      })
      return result
    })
  }

  validateDraft(mission: RealResearchMission, knowledge: RealMasterKnowledge, constraints?: RealEditorialCoverageConstraints): void {
    this.delegate.validateDraft?.(mission, knowledge, constraints)
  }

  draft(...args: Parameters<IntelligenceEngine['draft']>): Promise<IntelligenceDraft[]> { return this.delegate.draft(...args) }

  async generateStructured<T>(operation: string, payload: Record<string, unknown>, schema: ZodTypeAny, signal: AbortSignal): Promise<{ output: T; usage: IntelligenceRoundAnalysis['usage'] }> {
    if (!this.delegate.generateStructured) throw new Error('STRUCTURED_GENERATION_UNAVAILABLE')
    return this.delegate.generateStructured<T>(operation, payload, schema, signal)
  }

  validateReview(mission: RealResearchMission, knowledge: RealMasterKnowledge, drafts: IntelligenceDraft[], constraints?: RealEditorialCoverageConstraints): void {
    this.delegate.validateReview?.(mission, knowledge, drafts, constraints)
  }

  review(...args: Parameters<IntelligenceEngine['review']>): Promise<IntelligenceReview> { return this.delegate.review(...args) }
}

function isStageCheckpoint(value: unknown): value is { output: unknown; usage: IntelligenceRoundAnalysis['usage'] } {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && 'output' in value && 'usage' in value)
}

export class DurableGenericExecutionError extends Error {
  constructor(readonly code: 'ARTIFACT_REQUIRED' | 'RESEARCH_ARTIFACT_REQUIRED' | 'LIBRARY_TRANSITION_UNAVAILABLE', message: string) {
    super(message)
    this.name = 'DurableGenericExecutionError'
  }
}

function hasStructuredTransport(value: RealPipelineProviderSelection['intelligenceEngine']): value is RealPipelineProviderSelection['intelligenceEngine'] & StructuredGenerationTransport {
  const candidate = value as RealPipelineProviderSelection['intelligenceEngine'] & { structuredGenerationAvailable?: boolean }
  return candidate.structuredGenerationAvailable === undefined
    ? typeof candidate.generateStructured === 'function'
    : candidate.structuredGenerationAvailable && typeof candidate.generateStructured === 'function'
}

function libraryRevision(value: unknown): { libraryEntryId: string; versionId: string; revisionId: string; revisionHash: string } {
  if (!value || typeof value !== 'object') throw new DurableGenericExecutionError('ARTIFACT_REQUIRED', 'Falta la revisión Library estructurada')
  const candidate = value as Record<string, unknown>
  if (typeof candidate.libraryEntryId !== 'string' || typeof candidate.versionId !== 'string' || typeof candidate.revisionId !== 'string' || typeof candidate.revisionHash !== 'string') {
    throw new DurableGenericExecutionError('ARTIFACT_REQUIRED', 'La revisión Library estructurada no es válida')
  }
  return { libraryEntryId: candidate.libraryEntryId, versionId: candidate.versionId, revisionId: candidate.revisionId, revisionHash: candidate.revisionHash }
}
