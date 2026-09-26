import type { SupabaseClient } from '@supabase/supabase-js'
import { MANUAL_LOCAL_ACTOR_ID } from '@modules/editorial-pipeline/manual-runtime'
import { SupabaseGeographyCatalogRepository } from '@modules/editorial-pipeline/supabase-geography-repository'
import {
  BatchSharedLibraryTransition,
  RealEditorialLibraryVersionDraftApplicationService,
  SupabaseBatchLibraryCandidateGateway,
  SupabaseRealEditorialLibraryVersioningRepository,
} from '@modules/library-versioning'
import {
  DurableGenericRealEditorialExecution,
  issueLiveProviderNetworkPermit,
  SupabaseGenericDurableExecutionRepository,
  withLiveProviderClients,
  type RealPipelineProviderSelection,
} from '@modules/real-pipeline'
import type { ProviderCenterService } from '@modules/real-pipeline/provider-center'
import {
  SupabaseVisualCandidateRepository,
  SupabaseVisualMediaStorage,
  SupabaseVisualProcessingRepository,
  VisualCandidateAcquisitionService,
  VisualCandidateDiscoveryService,
  VisualCandidateDownloader,
  type VisualDownloadFetch,
  type WikimediaCommonsFetch,
  WikimediaCommonsDiscoveryAdapter,
} from '@modules/visual-acquisition'
import { discoveryQueryForVisualIntent } from '@modules/visual-acquisition/structured-visual-intent-adapter'
import type { BatchEditorialPhaseContext, BatchEditorialPhasePort, BatchEditorialPhaseResult } from './editorial-phase-port'
import { BatchExecutionContextMapper } from './batch-execution-context'
import { readBatchJobProviderAuthorization } from './batch-provider-authorization'
import type { RedoGenerationGuidance } from '@shared/redo-guidance-contracts'
import { StructuredEditorialPackageV1Schema, type VisualIntent } from '@shared/structured-editorial-package-contracts'
import { resolveStructuredVisualIntents } from '@modules/visual-acquisition/structured-visual-resolution'
import { StructuredEditorialPackageArtifactService } from '@modules/editorial-pipeline/structured-editorial-package-service'

export interface ProductionBatchPhasePortDependencies {
  client: SupabaseClient
  providerCenter: () => Promise<ProviderCenterService>
  environment?: NodeJS.ProcessEnv
  /** Test-only network boundaries. They are rejected outside NODE_ENV=test and
   * still run the production port, authorization, repositories and executor. */
  testProviderSelection?: RealPipelineProviderSelection
  testWikimediaFetch?: WikimediaCommonsFetch
  testImageFetch?: VisualDownloadFetch
}

/**
 * Production composition adapter. It maps a durable BATCH_JOB to the generic
 * owner-neutral executor and deliberately obtains live clients only inside an
 * authorized phase. No test delegate or pilot identity is reachable here.
 */
export class ProductionBatchEditorialPhasePort implements BatchEditorialPhasePort {
  private readonly contextMapper: BatchExecutionContextMapper
  private readonly visual: BatchVisualReviewDelegate
  private readonly environment: NodeJS.ProcessEnv

  constructor(private readonly dependencies: ProductionBatchPhasePortDependencies) {
    if ((dependencies.testProviderSelection || dependencies.testWikimediaFetch || dependencies.testImageFetch)
      && (dependencies.environment ?? process.env).NODE_ENV !== 'test') {
      throw new Error('BATCH_TEST_DOUBLE_FORBIDDEN_OUTSIDE_TEST')
    }
    this.contextMapper = new BatchExecutionContextMapper(new SupabaseGeographyCatalogRepository(dependencies.client))
    this.visual = new BatchVisualReviewDelegate(dependencies.client, {
      fetchFn: dependencies.testWikimediaFetch,
      imageFetchFn: dependencies.testImageFetch,
    })
    this.environment = dependencies.environment ?? process.env
  }

  async run(input: BatchEditorialPhaseContext): Promise<BatchEditorialPhaseResult> {
    const context = await this.contextMapper.map(input.batch, input.job)
    if (input.phase === 'IDENTITY') return { artifactRef: context.destination.destinationId }
    const authorization = readBatchJobProviderAuthorization(this.environment)
    if (!authorization.enabled || !authorization.featureToken) {
      throw new Error('BATCH_PROVIDER_AUTHORIZATION_REQUIRED: falta la capability explícita de ejecución batch')
    }
    if (input.phase === 'VISUALS') return this.visual.prepare(context.destination, input.job.id, input.job.redoScope === 'VISUALS' ? input.job.redoOperationId : undefined, input.job.redoGuidance, input.job.redoPreviousArtifactRefs?.VISUALS)
    const gate = {
        featureToken: authorization.featureToken,
        preflightStatus: 'ready_for_real_batch_execution',
        executionOwner: {
          type: 'BATCH_JOB', id: context.owner.id, batchId: context.batchId,
          destinationId: context.destination.destinationId, policyId: context.policy.promptVersion,
        },
        taskAuthorized: true, budgetReserved: true, globalGuardAcquired: true,
      } as const
    const execute = async (providers: RealPipelineProviderSelection) => {
        const execution = new DurableGenericRealEditorialExecution({
          repository: new SupabaseGenericDurableExecutionRepository(this.dependencies.client),
          providers,
          library: createBatchLibraryTransition(this.dependencies.client),
          actorId: MANUAL_LOCAL_ACTOR_ID,
        })
        const signal = new AbortController().signal
        if (input.phase === 'RESEARCH') return execution.executeResearch(context, signal)
        if (input.phase === 'ANALYSIS') return execution.executeAnalysis(context, signal)
        if (input.phase === 'STUDENT') return execution.executeStudent(context, signal)
        if (input.phase === 'ADVENTURE') return execution.executeAdventure(context, signal)
        if (input.phase === 'AUTO_REVIEW') return execution.executeReview(context, signal)
        throw new Error(`BATCH_PHASE_UNSUPPORTED:${input.phase}`)
    }
    if (this.dependencies.testProviderSelection) {
      const center = await this.dependencies.providerCenter()
      issueLiveProviderNetworkPermit({
        ...gate,
        providerCenter: center.snapshot(),
        intelligenceProviderIds: [this.dependencies.testProviderSelection.intelligenceEngine.id === 'deepseek' ? 'deepseek' : 'openai'],
      }, this.environment)
      return execute(this.dependencies.testProviderSelection)
    }
    return withLiveProviderClients(
      await this.dependencies.providerCenter(),
      gate,
      clients => execute({ researchTool: clients.tavily, intelligenceEngine: clients.intelligence }),
      { environment: this.environment },
    )
  }
}

function createBatchLibraryTransition(client: SupabaseClient): BatchSharedLibraryTransition {
  const versioning = new SupabaseRealEditorialLibraryVersioningRepository(client)
  return new BatchSharedLibraryTransition(
    new SupabaseBatchLibraryCandidateGateway(client),
    new RealEditorialLibraryVersionDraftApplicationService(versioning, versioning, versioning),
  )
}

class BatchVisualReviewDelegate {
  private readonly discovery: VisualCandidateDiscoveryService
  private readonly acquisition: VisualCandidateAcquisitionService
  private readonly client: SupabaseClient
  private readonly candidates: SupabaseVisualCandidateRepository

  constructor(client: SupabaseClient, options: { fetchFn?: WikimediaCommonsFetch; imageFetchFn?: VisualDownloadFetch } = {}) {
    this.client = client
    this.candidates = new SupabaseVisualCandidateRepository(client)
    this.discovery = new VisualCandidateDiscoveryService(new WikimediaCommonsDiscoveryAdapter({ fetchFn: options.fetchFn }), this.candidates)
    this.acquisition = new VisualCandidateAcquisitionService(
      this.candidates,
      new SupabaseVisualProcessingRepository(client),
      new VisualCandidateDownloader(options.imageFetchFn),
      new SupabaseVisualMediaStorage(client),
    )
  }

  async prepare(destination: { destinationId: string; name: string; countryCode: string; region?: string }, jobId: string, redoOperationId?: string, guidance?: RedoGenerationGuidance, previousPackageId?: string): Promise<BatchEditorialPhaseResult> {
    const countryOrRegion = destination.region ?? destination.countryCode
    const structured = await this.loadStructuredPackage(jobId)
    const intents = structured.package.visualIntents
    if (intents.length === 0) throw new Error('STRUCTURED_VISUAL_INTENTS_REQUIRED')
    for (const intent of intents) {
      await this.discovery.discover(discoveryQueryForVisualIntent(intent, {
        destinationId: destination.destinationId, destinationName: destination.name, countryOrRegion,
      }, visualCategoryForIntent(intent)))
    }
    const avoidPrevious = guidance?.scope === 'VISUALS' && guidance.controls.avoidPreviousSimilarity !== 'OFF'
    const excluded = avoidPrevious && previousPackageId ? await this.acquisition.previousCandidateIds(previousPackageId) : []
    const prepared = await this.acquisition.prepareDestinationForHumanVisualReview(destination.destinationId, {
      modes: ['adventure', 'student'], highlightLimit: 4, galleryLimit: 6, excludeCandidateIds: excluded, ...visualSelectionGuidance(guidance),
    }, redoOperationId ? `visual-acquisition-v1/redo/${redoOperationId}` : undefined)
    // This production phase only has private staged assets, so this records a
    // rights-pending visual revision rather than pretending that staging is a
    // public approval. The same resolver receives approved asset provenance
    // after the authorized media ingress phase, not in this prompt.
    const visualRevision = resolveStructuredVisualIntents({
      package: structured.package,
      candidates: await this.candidates.listByDestination(destination.destinationId),
      assetsByCandidateId: new Map(),
      sourceVisualPackageId: prepared.package.packageId,
    })
    await new StructuredEditorialPackageArtifactService(new SupabaseGenericDurableExecutionRepository(this.client))
      .saveVisualRevision(structured.executionId, structured.package, visualRevision)
    return {
      artifactRef: prepared.package.packageId,
      visualReviewState: prepared.package.state === 'DRAFT' ? 'EMPTY' : 'PARTIAL',
      warnings: prepared.failures.map(failure => `${failure.candidateId}:${failure.code}`),
    }
  }

  private async loadStructuredPackage(jobId: string): Promise<{ executionId: string; package: ReturnType<typeof StructuredEditorialPackageV1Schema.parse> }> {
    const { data: execution, error: executionError } = await this.client.from('real_editorial_executions').select('id')
      .eq('owner_type', 'BATCH_JOB').eq('owner_id', jobId).maybeSingle()
    if (executionError) throw new Error(`STRUCTURED_VISUAL_EXECUTION_LOOKUP_FAILED:${executionError.message}`)
    if (!execution) throw new Error('STRUCTURED_VISUAL_EXECUTION_REQUIRED')
    const { data: artifact, error: artifactError } = await this.client.from('real_editorial_artifacts').select('payload')
      .eq('execution_owner_id', String((execution as { id: unknown }).id)).eq('artifact_kind', 'editorial_package').eq('artifact_key', 'structured/v1')
      .order('version', { ascending: false }).limit(1).maybeSingle()
    if (artifactError) throw new Error(`STRUCTURED_VISUAL_PACKAGE_LOOKUP_FAILED:${artifactError.message}`)
    const payload = artifact ? (artifact as { payload: unknown }).payload : null
    if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { visualIntents?: unknown }).visualIntents)) throw new Error('STRUCTURED_VISUAL_PACKAGE_REQUIRED')
    return { executionId: String((execution as { id: unknown }).id), package: StructuredEditorialPackageV1Schema.parse(payload) }
  }
}

function visualCategoryForIntent(intent: VisualIntent): 'landmark' | 'landscape' | 'culture' | 'food' | 'people-life' | 'atmosphere' | 'detail' {
  const terms = `${intent.subject} ${intent.keywords.join(' ')} ${intent.context}`.toLocaleLowerCase()
  if (/restaurante|cafe|café|bar|comida|gastronom/.test(terms)) return 'food'
  if (/barrio|museo|iglesia|palacio|monumento|torre/.test(terms)) return 'culture'
  if (/mirador|paisaje|río|rio|montaña|montana|playa/.test(terms)) return 'landscape'
  if (/mercado|vida local|personas/.test(terms)) return 'people-life'
  return intent.purpose === 'ADVENTURE_HERO' ? 'landmark' : 'detail'
}

function visualSelectionGuidance(guidance?: RedoGenerationGuidance) {
  if (guidance?.scope !== 'VISUALS') return {}
  const categories: string[] = []
  if (guidance.controls.heritage === 'PRIORITIZE') categories.push('culture', 'landmark')
  if (guidance.controls.landscape === 'PRIORITIZE') categories.push('landscape')
  if (guidance.controls.localLife === 'PRIORITIZE') categories.push('atmosphere')
  if (guidance.controls.representativeness === 'MORE_REPRESENTATIVE') categories.push('landmark', 'culture')
  if (guidance.controls.impact !== 'BALANCED') categories.push('landmark', 'landscape')
  return { preferredCategories: [...new Set(categories)], diversifyCategories: guidance.controls.variety !== 'NORMAL' }
}
