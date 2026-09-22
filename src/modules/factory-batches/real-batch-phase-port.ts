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
  SupabaseGenericDurableExecutionRepository,
  withLiveProviderClients,
} from '@modules/real-pipeline'
import type { ProviderCenterService } from '@modules/real-pipeline/provider-center'
import {
  SupabaseVisualCandidateRepository,
  SupabaseVisualMediaStorage,
  SupabaseVisualProcessingRepository,
  VisualCandidateAcquisitionService,
  VisualCandidateDiscoveryService,
  VisualCandidateDownloader,
  WikimediaCommonsDiscoveryAdapter,
} from '@modules/visual-acquisition'
import type { BatchEditorialPhaseContext, BatchEditorialPhasePort, BatchEditorialPhaseResult } from './editorial-phase-port'
import { BatchExecutionContextMapper } from './batch-execution-context'
import { readBatchJobProviderAuthorization } from './batch-provider-authorization'

export interface ProductionBatchPhasePortDependencies {
  client: SupabaseClient
  providerCenter: () => Promise<ProviderCenterService>
  environment?: NodeJS.ProcessEnv
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
    this.contextMapper = new BatchExecutionContextMapper(new SupabaseGeographyCatalogRepository(dependencies.client))
    this.visual = new BatchVisualReviewDelegate(dependencies.client)
    this.environment = dependencies.environment ?? process.env
  }

  async run(input: BatchEditorialPhaseContext): Promise<BatchEditorialPhaseResult> {
    const context = await this.contextMapper.map(input.batch, input.job)
    if (input.phase === 'IDENTITY') return { artifactRef: context.destination.destinationId }
    const authorization = readBatchJobProviderAuthorization(this.environment)
    if (!authorization.enabled || !authorization.featureToken) {
      throw new Error('BATCH_PROVIDER_AUTHORIZATION_REQUIRED: falta la capability explícita de ejecución batch')
    }
    if (input.phase === 'VISUALS') return this.visual.prepare(context.destination)
    return withLiveProviderClients(
      await this.dependencies.providerCenter(),
      {
        featureToken: authorization.featureToken,
        preflightStatus: 'ready_for_real_batch_execution',
        executionOwner: {
          type: 'BATCH_JOB', id: context.owner.id, batchId: context.batchId,
          destinationId: context.destination.destinationId, policyId: context.policy.promptVersion,
        },
        taskAuthorized: true, budgetReserved: true, globalGuardAcquired: true,
      },
      async providers => {
        const execution = new DurableGenericRealEditorialExecution({
          repository: new SupabaseGenericDurableExecutionRepository(this.dependencies.client),
          providers: { researchTool: providers.tavily, intelligenceEngine: providers.intelligence },
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
      },
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

  constructor(client: SupabaseClient) {
    const candidates = new SupabaseVisualCandidateRepository(client)
    this.discovery = new VisualCandidateDiscoveryService(new WikimediaCommonsDiscoveryAdapter(), candidates)
    this.acquisition = new VisualCandidateAcquisitionService(
      candidates,
      new SupabaseVisualProcessingRepository(client),
      new VisualCandidateDownloader(),
      new SupabaseVisualMediaStorage(client),
    )
  }

  async prepare(destination: { destinationId: string; name: string; countryCode: string; region?: string }): Promise<BatchEditorialPhaseResult> {
    const countryOrRegion = destination.region ?? destination.countryCode
    for (const query of [
      { category: 'landmark' as const, role: 'hero' as const },
      { category: 'landmark' as const, role: 'highlight' as const },
      { category: 'landscape' as const, role: 'highlight' as const },
      { category: 'culture' as const, role: 'gallery' as const },
      { category: 'atmosphere' as const, role: 'gallery' as const },
      { category: 'detail' as const, role: 'gallery' as const },
    ]) {
      await this.discovery.discover({ destinationId: destination.destinationId, destinationName: destination.name, countryOrRegion, ...query, limit: 20 })
    }
    const prepared = await this.acquisition.prepareDestinationForHumanVisualReview(destination.destinationId, {
      modes: ['adventure', 'student'], highlightLimit: 4, galleryLimit: 6,
    })
    return {
      artifactRef: prepared.package.packageId,
      visualReviewState: prepared.package.state === 'DRAFT' ? 'EMPTY' : 'PARTIAL',
      warnings: prepared.failures.map(failure => `${failure.candidateId}:${failure.code}`),
    }
  }
}
