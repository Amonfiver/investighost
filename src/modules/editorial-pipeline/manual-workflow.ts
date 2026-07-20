import { createHash, randomUUID } from 'node:crypto'
import {
  EditorialDraftBundleSchema,
  EditorialResearchRequestSchema,
  EditorialResearchRunSchema,
  ResearchDestinationResultSchema,
  ResearchEventSchema,
  type EditorialDraftBundle,
  type EditorialResearchRequest,
  type EditorialResearchRun,
  type GeographicEntity,
  type ResearchDestinationResult,
  type ResearchEvent,
  type ResearchStage,
} from '@shared/editorial-contracts'
import {
  ManualDestinationCorrectionSchema,
  ManualDestinationQuerySchema,
  ManualDraftDecisionSchema,
  ManualDraftReviewSchema,
  ManualResearchStartSchema,
  ManualSectionEditSchema,
  ManualSectionRegenerationSchema,
  type ManualDestinationCorrection,
  type ManualDestinationQuery,
  type ManualDestinationResolution,
  type ManualDraftDecision,
  type ManualDraftReview,
  type ManualResearchStart,
  type ManualSectionEdit,
  type ManualSectionRegeneration,
} from '@shared/manual-contracts'
import type { EditorialResearchRepository, EditorialResearchSummary, EditorialDraftVersionSummary } from './repository'
import { GeographicResolver } from './geography'
import { MockEditorialSourceProvider } from './mock-source-provider'
import { SourceAcquisitionService, type EditorialSourceProvider } from './source-providers'
import { MockFactualStructuringProvider } from './mock-factual-provider'
import { FactualStructuringService, type FactualProposal, type FactualStructuringProvider } from './factual-structuring'
import { MockEditorialGenerationProvider } from './mock-editorial-provider'
import { EditorialGenerationService, type EditorialGenerationProvider } from './editorial-generation'
import { RevisiatorService } from './quality-review'

export type ManualWorkflowErrorCode =
  | 'DESTINATION_AMBIGUOUS'
  | 'DESTINATION_NOT_FOUND'
  | 'RESEARCH_NOT_FOUND'
  | 'DRAFT_NOT_FOUND'
  | 'SECTION_NOT_FOUND'
  | 'INVALID_STATE'
  | 'QUALITY_GATE_FAILED'
  | 'INVALID_INPUT'

export class ManualWorkflowError extends Error {
  constructor(readonly code: ManualWorkflowErrorCode, message: string, readonly cause?: unknown) {
    super(message)
    this.name = 'ManualWorkflowError'
  }
}

export interface ManualPipelineProviders {
  source: EditorialSourceProvider
  factual: FactualStructuringProvider
  editorial: EditorialGenerationProvider
}

export interface ManualWorkflowDependencies {
  now?: () => Date
  id?: () => string
  providers?: (destination: GeographicEntity) => ManualPipelineProviders
  ownerProcess?: string
}

const CONFIGURATION_VERSION = 'manual-v1'
const CONTRACT_VERSION = '3h-v1'

export class ManualResearchService {
  private readonly now: () => Date
  private readonly id: () => string
  private readonly providers: (destination: GeographicEntity) => ManualPipelineProviders
  private readonly ownerProcess: string

  constructor(
    private readonly repository: EditorialResearchRepository,
    private readonly resolver: GeographicResolver,
    dependencies: ManualWorkflowDependencies = {},
  ) {
    this.now = dependencies.now ?? (() => new Date())
    this.id = dependencies.id ?? randomUUID
    this.providers = dependencies.providers ?? createManualMockProviders
    this.ownerProcess = dependencies.ownerProcess ?? `manual-electron:${process.pid}`
  }

  async resolveDestination(candidate: ManualDestinationQuery): Promise<ManualDestinationResolution> {
    const input = ManualDestinationQuerySchema.parse(candidate)
    return this.resolver.resolve(input)
  }

  async correctDestination(candidate: ManualDestinationCorrection): Promise<ManualDestinationResolution> {
    const input = ManualDestinationCorrectionSchema.parse(candidate)
    return this.resolver.applyHumanCorrection(input.query, {
      actorId: input.actorId,
      candidateId: input.candidateId,
      reason: input.reason,
    })
  }

  async start(candidate: ManualResearchStart): Promise<ResearchDestinationResult> {
    let input: ManualResearchStart
    try {
      input = ManualResearchStartSchema.parse(candidate)
    } catch (error) {
      throw new ManualWorkflowError('INVALID_INPUT', 'La configuración Manual no es válida', error)
    }
    const existing = await this.repository.findByIdempotencyKey(input.idempotencyKey)
    if (existing) return existing

    const resolution = await this.resolveDestination({
      query: input.destinationQuery,
      countryCode: input.countryCode,
      regionCode: input.regionCode,
      type: input.destinationType,
    })
    if (resolution.status === 'ambiguous') {
      throw new ManualWorkflowError('DESTINATION_AMBIGUOUS', 'El destino requiere una selección humana antes de investigar')
    }
    if (resolution.status === 'not_found') {
      throw new ManualWorkflowError('DESTINATION_NOT_FOUND', resolution.reason)
    }

    const startedAt = this.now()
    const request = EditorialResearchRequestSchema.parse({
      id: this.id(),
      destinationId: resolution.entity.id,
      destinationQuerySnapshot: input.destinationQuery,
      profiles: input.profiles,
      language: input.language,
      depth: input.depth,
      notes: input.notes || undefined,
      options: { budgetLimit: input.budgetLimit, simulation: true },
      configurationVersion: CONFIGURATION_VERSION,
      idempotencyKey: input.idempotencyKey,
      actorId: input.actorId,
      state: 'queued',
      version: 1,
      createdAt: startedAt,
      updatedAt: startedAt,
    })
    const run = EditorialResearchRunSchema.parse({
      id: this.id(),
      requestId: request.id,
      stage: 'destination_resolution',
      providerId: 'manual-mock-pipeline',
      model: 'deterministic-local-fixtures-v1',
      promptVersion: 'profiles-v1',
      contractVersion: CONTRACT_VERSION,
      attempt: 1,
      estimatedCost: 0,
      currency: 'EUR',
      inputUnits: 0,
      outputUnits: 0,
      startedAt,
      state: 'running',
      createdAt: startedAt,
      updatedAt: startedAt,
    })
    await this.repository.saveScaffold({ destination: resolution.entity, request, run })
    const lockToken = this.id()
    const locked = await this.repository.acquireExecutionLock(
      request.id,
      lockToken,
      new Date(startedAt.getTime() + 5 * 60_000),
      this.ownerProcess,
    )
    if (!locked) throw new ManualWorkflowError('INVALID_STATE', 'La investigación ya está siendo ejecutada')

    try {
      const providers = this.providers(resolution.entity)
      await this.setProgress(request, run, 'researching', 'source_discovery')
      const queries = buildQueries(resolution.entity.name)
      const sourceResult = await new SourceAcquisitionService(providers.source, {
        timeoutMs: 5_000,
        maxAttempts: 3,
        backoffMs: [0, 100, 400],
        maxQueries: 4,
        maxResultsPerQuery: 5,
        maxSources: 8,
        budgetLimit: input.budgetLimit,
        costs: { discovery: 0.01, reading: 0.02, evaluation: 0.01 },
      }, { now: this.now, id: this.id }).acquire({
        requestId: request.id,
        runId: run.id,
        actorId: input.actorId,
        correlationId: input.idempotencyKey,
        destination: resolution.entity,
        queries,
        language: input.language,
      })

      await this.setProgress(request, run, 'structuring', 'fact_structuring')
      const factualResult = await new FactualStructuringService(providers.factual, this.repository, this.now).structure({
        requestId: request.id,
        runId: run.id,
        destinationId: resolution.entity.id,
        language: input.language,
        attempt: run.attempt,
        documents: sourceResult.documents,
      })

      await this.setProgress(request, run, 'validating', 'profile_generation')
      const editorialResult = await new EditorialGenerationService(providers.editorial, {
        fullDraftCost: 0.08,
        sectionRegenerationCost: 0.02,
        budgetLimit: input.budgetLimit,
        currency: 'EUR',
      }, { now: this.now, id: this.id }).generate({
        requestId: request.id,
        runId: run.id,
        actorId: input.actorId,
        destinationName: resolution.entity.name,
        language: input.language,
        facts: factualResult.facts,
        places: factualResult.places,
        activities: factualResult.activities,
        profiles: input.profiles,
      })

      await this.setProgress(request, run, 'validating', 'quality_review')
      const quality = new RevisiatorService(this.now).review({
        destinationName: resolution.entity.name,
        language: input.language,
        requestedProfiles: input.profiles,
        sources: sourceResult.sources,
        facts: factualResult.facts,
        drafts: editorialResult.drafts,
      })
      const completedAt = this.now()
      const usage = [...sourceResult.usage, ...editorialResult.usage]
      const events = [
        this.event(request, run, 'manual.destination.resolved', 'destination_resolution', { method: resolution.method }),
        ...sourceResult.events,
        this.event(request, run, 'manual.facts.structured', 'fact_structuring', {
          facts: factualResult.facts.length,
          places: factualResult.places.length,
          activities: factualResult.activities.length,
        }),
        this.event(request, run, 'manual.drafts.generated', 'profile_generation', { profiles: input.profiles }),
        this.event(request, run, 'manual.quality.completed', 'quality_review', { summary: quality.summary }),
        this.event(request, run, 'manual.awaiting_human_review', 'human_review', {}),
      ]
      const completedRequest = EditorialResearchRequestSchema.parse({
        ...request,
        state: 'completed',
        version: request.version + 1,
        updatedAt: completedAt,
      })
      const totalCost = usage.reduce((sum, item) => sum + (item.actualCost ?? 0), 0)
      const completedRun = EditorialResearchRunSchema.parse({
        ...run,
        stage: 'human_review',
        state: 'completed',
        estimatedCost: totalCost,
        actualCost: totalCost,
        inputUnits: usage.reduce((sum, item) => sum + item.inputUnits, 0),
        outputUnits: usage.reduce((sum, item) => sum + item.outputUnits, 0),
        completedAt,
        updatedAt: completedAt,
      })
      const result = ResearchDestinationResultSchema.parse({
        request: completedRequest,
        run: completedRun,
        destination: resolution.entity,
        sources: sourceResult.sources,
        facts: factualResult.facts,
        places: factualResult.places,
        activities: factualResult.activities,
        drafts: editorialResult.drafts,
        qualityReviews: quality.reviews,
        qualityChecks: quality.checks,
        usage,
        events,
      })
      await this.repository.save(result)
      return result
    } catch (error) {
      const failedAt = this.now()
      const failedRequest = EditorialResearchRequestSchema.parse({ ...request, state: 'failed', version: request.version + 1, updatedAt: failedAt })
      const failedRun = EditorialResearchRunSchema.parse({
        ...run,
        state: 'failed',
        errorCode: errorCode(error),
        errorMessage: errorMessage(error),
        completedAt: failedAt,
        updatedAt: failedAt,
      })
      await this.repository.updateExecution(failedRequest, failedRun).catch(() => undefined)
      throw error
    } finally {
      await this.repository.releaseExecutionLock(request.id, lockToken).catch(() => false)
    }
  }

  list(limit = 100): Promise<EditorialResearchSummary[]> {
    return this.repository.list(limit)
  }

  get(requestId: string): Promise<ResearchDestinationResult | null> {
    return this.repository.getByRequestId(requestId)
  }

  listDraftVersions(requestId: string): Promise<EditorialDraftVersionSummary[]> {
    return this.repository.listDraftVersions(requestId)
  }

  async editSection(candidate: ManualSectionEdit): Promise<ResearchDestinationResult> {
    const input = ManualSectionEditSchema.parse(candidate)
    const result = await this.requireResult(input.requestId)
    const current = this.requireDraft(result, input.draftId)
    if (!['ready', 'changes_requested', 'rejected'].includes(current.draft.state)) {
      throw new ManualWorkflowError('INVALID_STATE', 'Solo puede editarse un borrador listo, devuelto o rechazado')
    }
    const section = current.sections.find(item => item.id === input.sectionId)
    if (!section) throw new ManualWorkflowError('SECTION_NOT_FOUND', 'La sección no pertenece al borrador actual')
    const nextVersion = current.draft.contentVersion + 1
    const changedAt = this.now()
    const draftId = deterministicUuid(`${current.draft.id}:human:${nextVersion}:${input.heading}:${input.content}`)
    const next = EditorialDraftBundleSchema.parse({
      draft: {
        ...current.draft,
        id: draftId,
        contentVersion: nextVersion,
        state: 'ready',
        previousDraftId: current.draft.id,
        regenerationReason: input.reason,
        humanEdited: true,
        updatedBy: input.actorId,
        version: current.draft.version + 1,
        createdAt: changedAt,
        updatedAt: changedAt,
      },
      sections: current.sections.map((item, position) => ({
        ...item,
        id: deterministicUuid(`${draftId}:section:${item.kind}:${position}`),
        draftId,
        heading: item.id === section.id ? input.heading : item.heading,
        content: item.id === section.id ? input.content : item.content,
        humanEdited: item.id === section.id || item.humanEdited,
        regenerationReason: item.id === section.id ? input.reason : item.regenerationReason,
        version: item.id === section.id ? item.version + 1 : item.version,
        createdAt: changedAt,
        updatedAt: changedAt,
      })),
    })
    return this.replaceDraftAndReview(result, current, next, input.actorId, 'manual.section.edited', { sectionKind: section.kind, reason: input.reason })
  }

  async regenerateSection(candidate: ManualSectionRegeneration): Promise<ResearchDestinationResult> {
    const input = ManualSectionRegenerationSchema.parse(candidate)
    const result = await this.requireResult(input.requestId)
    const current = this.requireDraft(result, input.draftId)
    if (!['ready', 'changes_requested', 'rejected'].includes(current.draft.state)) {
      throw new ManualWorkflowError('INVALID_STATE', 'Solo puede regenerarse un borrador listo, devuelto o rechazado')
    }
    const generated = await new EditorialGenerationService(this.providers(result.destination).editorial, {
      fullDraftCost: 0.08,
      sectionRegenerationCost: 0.02,
      budgetLimit: Number(result.request.options.budgetLimit ?? 2),
      currency: 'EUR',
    }, { now: this.now, id: this.id }).regenerateSection({
      requestId: result.request.id,
      runId: result.run.id,
      actorId: input.actorId,
      destinationName: result.destination.name,
      language: result.request.language,
      facts: result.facts,
      places: result.places,
      activities: result.activities,
      current,
      sectionId: input.sectionId,
      reason: input.reason,
    })
    const next = generated.drafts[0]
    return this.replaceDraftAndReview(
      result,
      current,
      next,
      input.actorId,
      'manual.section.regenerated',
      { reason: input.reason },
      { usage: generated.usage, estimatedCost: generated.estimatedCost, actualCost: generated.actualCost },
    )
  }

  async submitForReview(candidate: ManualDraftReview): Promise<ResearchDestinationResult> {
    const input = ManualDraftReviewSchema.parse(candidate)
    const result = await this.requireResult(input.requestId)
    const bundle = this.requireDraft(result, input.draftId)
    if (bundle.draft.state !== 'ready') throw new ManualWorkflowError('INVALID_STATE', 'El borrador debe estar listo para iniciar revisión')
    const review = result.qualityReviews.find(item => item.draftId === bundle.draft.id && item.draftVersion === bundle.draft.contentVersion)
    if (!review || !['passed', 'passed_with_warnings'].includes(review.outcome)) {
      throw new ManualWorkflowError('QUALITY_GATE_FAILED', 'RevisIAtor exige resolver los controles antes de la revisión humana')
    }
    return this.changeDraftState(result, bundle, 'in_review', input.actorId, 'manual.review.started', {})
  }

  async decide(candidate: ManualDraftDecision): Promise<ResearchDestinationResult> {
    const input = ManualDraftDecisionSchema.parse(candidate)
    const result = await this.requireResult(input.requestId)
    const bundle = this.requireDraft(result, input.draftId)
    if (bundle.draft.state !== 'in_review') throw new ManualWorkflowError('INVALID_STATE', 'La decisión exige un borrador en revisión')
    return this.changeDraftState(result, bundle, input.decision, input.actorId, `manual.review.${input.decision}`, { comment: input.comment })
  }

  private async setProgress(
    request: EditorialResearchRequest,
    run: EditorialResearchRun,
    requestState: EditorialResearchRequest['state'],
    stage: ResearchStage,
  ): Promise<void> {
    request.state = requestState
    request.updatedAt = this.now()
    run.stage = stage
    run.updatedAt = request.updatedAt
    await this.repository.updateExecution(request, run)
  }

  private async requireResult(requestId: string): Promise<ResearchDestinationResult> {
    const result = await this.repository.getByRequestId(requestId)
    if (!result) throw new ManualWorkflowError('RESEARCH_NOT_FOUND', 'No existe una investigación completa con ese identificador')
    return result
  }

  private requireDraft(result: ResearchDestinationResult, draftId: string): EditorialDraftBundle {
    const bundle = result.drafts.find(item => item.draft.id === draftId)
    if (!bundle) throw new ManualWorkflowError('DRAFT_NOT_FOUND', 'El borrador no es la versión actual de la investigación')
    return bundle
  }

  private async replaceDraftAndReview(
    result: ResearchDestinationResult,
    current: EditorialDraftBundle,
    next: EditorialDraftBundle,
    actorId: string,
    eventType: string,
    payload: Record<string, unknown>,
    extra: { usage: ResearchDestinationResult['usage']; estimatedCost: number; actualCost: number } = {
      usage: [], estimatedCost: 0, actualCost: 0,
    },
  ): Promise<ResearchDestinationResult> {
    const changedAt = this.now()
    const drafts = result.drafts.map(item => item.draft.id === current.draft.id ? next : item)
    const quality = new RevisiatorService(this.now).review({
      destinationName: result.destination.name,
      language: result.request.language,
      requestedProfiles: result.request.profiles,
      sources: result.sources,
      facts: result.facts,
      drafts,
    })
    const updated = ResearchDestinationResultSchema.parse({
      ...result,
      request: { ...result.request, version: result.request.version + 1, updatedAt: changedAt },
      run: {
        ...result.run,
        estimatedCost: result.run.estimatedCost + extra.estimatedCost,
        actualCost: (result.run.actualCost ?? 0) + extra.actualCost,
        outputUnits: result.run.outputUnits + extra.usage.reduce((sum, item) => sum + item.outputUnits, 0),
        updatedAt: changedAt,
      },
      drafts,
      qualityReviews: quality.reviews,
      qualityChecks: quality.checks,
      usage: [...result.usage, ...extra.usage],
      events: [...result.events, this.event(result.request, result.run, eventType, 'human_review', { ...payload, draftId: next.draft.id, actorId })],
    })
    await this.repository.save(updated)
    return updated
  }

  private async changeDraftState(
    result: ResearchDestinationResult,
    current: EditorialDraftBundle,
    state: EditorialDraftBundle['draft']['state'],
    actorId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<ResearchDestinationResult> {
    const changedAt = this.now()
    const drafts = result.drafts.map(item => item.draft.id === current.draft.id ? {
      ...item,
      draft: {
        ...item.draft,
        state,
        updatedBy: actorId,
        version: item.draft.version + 1,
        updatedAt: changedAt,
      },
    } : item)
    const updated = ResearchDestinationResultSchema.parse({
      ...result,
      request: { ...result.request, version: result.request.version + 1, updatedAt: changedAt },
      run: { ...result.run, updatedAt: changedAt },
      drafts,
      events: [...result.events, this.event(result.request, result.run, eventType, 'human_review', { ...payload, draftId: current.draft.id, actorId })],
    })
    await this.repository.save(updated)
    return updated
  }

  private event(
    request: EditorialResearchRequest,
    run: EditorialResearchRun,
    type: string,
    stage: ResearchStage,
    payload: Record<string, unknown>,
  ): ResearchEvent {
    return ResearchEventSchema.parse({
      id: this.id(),
      requestId: request.id,
      runId: run.id,
      type,
      stage,
      actorId: request.actorId,
      correlationId: request.idempotencyKey,
      payload,
      occurredAt: this.now(),
    })
  }
}

function createManualMockProviders(destination: GeographicEntity): ManualPipelineProviders {
  const queries = buildQueries(destination.name)
  const overviewUrl = `https://fixtures.investighost.local/${destination.slug}/official-overview`
  const practicalUrl = `https://fixtures.investighost.local/${destination.slug}/practical-life`
  return {
    source: new MockEditorialSourceProvider([
      {
        queries: [queries[0]],
        url: overviewUrl,
        title: `${destination.name}: contexto territorial sintético`,
        publisher: 'Investighost local fixtures',
        content: `${destination.name} dispone de un contexto territorial, patrimonial y natural que debe verificarse antes de planificar rutas. La preparación y la seguridad dependen de las condiciones locales.`,
        publishedAt: new Date('2026-07-20T10:00:00.000Z'),
        evaluation: { accepted: true, sourceType: 'official', territorialScope: 'destination', freshness: 'current', reliability: 0.95, reason: 'Fuente oficial sintética local' },
      },
      {
        queries: [queries[1]],
        url: practicalUrl,
        title: `${destination.name}: movilidad, costes y servicios sintéticos`,
        publisher: 'Investighost local fixtures',
        content: `La movilidad, los costes y los servicios de ${destination.name} requieren comprobación práctica. El presupuesto puede cambiar por temporada y conviene consultar accesibilidad y horarios.`,
        publishedAt: new Date('2026-07-20T11:00:00.000Z'),
        evaluation: { accepted: true, sourceType: 'tourism', territorialScope: 'local', freshness: 'current', reliability: 0.85, reason: 'Fuente turística sintética local' },
      },
    ]),
    factual: new MockFactualStructuringProvider([
      { sourceUrl: overviewUrl, proposal: overviewProposal(destination.name) },
      { sourceUrl: practicalUrl, proposal: practicalProposal(destination.name) },
    ]),
    editorial: new MockEditorialGenerationProvider(),
  }
}

function overviewProposal(destinationName: string): FactualProposal {
  return {
    facts: [
      { canonicalKey: 'destination.identity', value: destinationName, statement: `${destinationName} es la identidad territorial canónica resuelta para esta investigación`, category: 'geography', confidence: 0.99, volatility: 'stable' },
      { canonicalKey: 'destination.nature', value: 'route-context', statement: `El entorno de ${destinationName} permite plantear recorridos cuya dificultad debe comprobarse sobre el terreno`, category: 'nature', confidence: 0.88, volatility: 'seasonal' },
      { canonicalKey: 'destination.safety', value: 'conditions', statement: `La seguridad en ${destinationName} depende de revisar condiciones, desnivel y meteorología antes de cada recorrido`, category: 'safety', confidence: 0.92, volatility: 'seasonal' },
    ],
    places: [{ canonicalKey: 'territorial-center', name: `Entorno de ${destinationName}`, category: 'nature', factKeys: ['destination.identity', 'destination.nature'], profileRelevance: { adventure: 0.95, student: 0.55 } }],
    activities: [{ canonicalKey: 'prepared-route', name: `Recorrido preparado por ${destinationName}`, audienceProfiles: ['adventure'], durationMinutes: 120, costBand: 'free', season: 'Consultar condiciones actuales', requirements: ['Calzado adecuado', 'Agua'], accessibility: ['Confirmar desnivel y firme'], riskNotes: ['Revisar meteorología y condiciones'], factKeys: ['destination.nature', 'destination.safety'] }],
  }
}

function practicalProposal(destinationName: string): FactualProposal {
  return {
    facts: [
      { canonicalKey: 'daily.transport', value: 'verify-local-options', statement: `La movilidad cotidiana en ${destinationName} exige confirmar horarios y opciones locales`, category: 'logistics', confidence: 0.86, volatility: 'seasonal' },
      { canonicalKey: 'daily.budget', value: 'seasonal-costs', statement: `El presupuesto de estancia en ${destinationName} puede variar por temporada y debe compararse antes del viaje`, category: 'cost', confidence: 0.82, volatility: 'seasonal' },
      { canonicalKey: 'daily.services', value: 'local-services', statement: `Los servicios útiles para una estancia en ${destinationName} deben localizarse y verificar su horario`, category: 'service', confidence: 0.84, volatility: 'seasonal' },
      { canonicalKey: 'daily.accessibility', value: 'verify-access', statement: `La accesibilidad de rutas y servicios en ${destinationName} requiere consulta previa según las necesidades personales`, category: 'accessibility', confidence: 0.9, volatility: 'seasonal' },
    ],
    places: [{ canonicalKey: 'daily-services', name: `Servicios centrales de ${destinationName}`, category: 'service', factKeys: ['daily.services', 'daily.accessibility'], profileRelevance: { adventure: 0.45, student: 0.95 } }],
    activities: [{ canonicalKey: 'daily-planning', name: `Planificación cotidiana en ${destinationName}`, audienceProfiles: ['student'], durationMinutes: 60, costBand: 'budget', season: 'Comparar antes de la estancia', requirements: ['Consultar horarios', 'Preparar presupuesto'], accessibility: ['Confirmar accesos'], riskNotes: ['No asumir disponibilidad'], factKeys: ['daily.transport', 'daily.budget', 'daily.services', 'daily.accessibility'] }],
  }
}

function buildQueries(destinationName: string): [string, string] {
  return [`${destinationName} contexto y seguridad`, `${destinationName} movilidad costes y servicios`]
}

function deterministicUuid(value: string): string {
  const hex = createHash('sha256').update(value).digest('hex').slice(0, 32).split('')
  hex[12] = '4'
  hex[16] = ['8', '9', 'a', 'b'][Number.parseInt(hex[16], 16) % 4]
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20).join('')}`
}

function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') return error.code.slice(0, 120)
  return 'MANUAL_PIPELINE_FAILED'
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 2000)
}
