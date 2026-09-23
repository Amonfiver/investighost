import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'
import {
  DestinationBatchService,
  EditorialBatchWorker,
  DestinationBatchHumanReviewService,
  DestinationBatchRedoService,
  createFactoryBatchPhasePort,
  ProductionBatchEditorialPhasePort,
  SupabaseDestinationBatchRepository,
} from '@modules/factory-batches'
import { SupabaseRealEditorialLibraryVersioningRepository } from '@modules/library-versioning'
import { SupabaseRealEditorialPilotRepository } from '@modules/real-pipeline/real-editorial-repository'
import { GeographicResolver } from '@modules/editorial-pipeline/geography'
import { SupabaseGeographyCatalogRepository } from '@modules/editorial-pipeline/supabase-geography-repository'
import { createLocalSupabaseClientFromEnv } from '@services/supabase'
import type {
  IntelligenceDraft,
  IntelligenceEngine,
  IntelligenceReview,
  IntelligenceRoundAnalysis,
  ResearchTool,
  ResearchToolResult,
} from '@modules/real-pipeline'
import type { RealResearchMission, RealResearchSource } from '@shared/real-pipeline-contracts'

const integration = process.env.RUN_SUPABASE_INTEGRATION === 'true' ? describe : describe.skip
const created: Array<{ batchId: string; jobId: string; destinationId: string }> = []
const testToken = 'batch_execution_test_capability_084j'

class ResearchDouble implements ResearchTool {
  readonly id = 'tavily'
  readonly model = 'search-and-extract'
  readonly simulation = true
  calls = 0

  async research(mission: RealResearchMission): Promise<ResearchToolResult> {
    this.calls += 1
    const source: RealResearchSource = {
      id: `granada-source-${mission.round}`,
      round: mission.round,
      url: `https://fixture.example.test/granada/${mission.round}`,
      normalizedUrl: `https://fixture.example.test/granada/${mission.round}`,
      title: 'Fuente controlada sobre Granada',
      capturedAt: '2026-09-22T00:00:00.000Z',
      contentHash: 'a'.repeat(64), score: 0.95,
      content: 'Granada conserva patrimonio histórico, paisaje urbano y una vida cultural documentable.',
    }
    return { round: mission.round, sources: [source], providerRequestIds: [`research-${mission.round}`], failures: [], usageUnits: 0, credits: 0 }
  }
}

class IntelligenceDouble implements IntelligenceEngine {
  readonly id = 'openai'
  readonly model = 'gpt-5.6-luna'
  readonly simulation = true
  readonly routedByStage = true
  analysisCalls = 0
  draftCalls = 0
  reviewCalls = 0
  readonly draftsByProfile = new Map<string, number>()
  private remainingFailures: number

  constructor(private readonly failure?: { profile: 'student' | 'adventure'; destination: string; times?: number; code?: string }) {
    this.remainingFailures = failure?.times ?? 0
  }

  async analyze(mission: RealResearchMission): Promise<IntelligenceRoundAnalysis> {
    this.analysisCalls += 1
    return {
      masterKnowledge: {
        requestId: mission.requestId, destinationId: mission.destination.canonicalId, revision: mission.round,
        claims: [{ id: 'granada-claim', topic: 'patrimonio', statement: 'Granada reúne patrimonio histórico y vida cultural.', evidenceIds: [], confidence: 0.9, suitableProfiles: ['student', 'adventure'] }],
        contradictions: [], generatedAt: '2026-09-22T00:00:00.000Z',
      },
      coverage: { score: 0.95, sufficient: true, topics: [{ topic: 'contexto', required: true, coverage: 1, evidenceIds: [] }] },
      proposedQueries: [], gaps: [], decision: { action: 'stop_ready', reason: 'Cobertura de fixture suficiente.', queries: [] },
      usage: { providerId: 'openai', model: 'gpt-5.6-luna', inputTokens: 0, outputTokens: 0, estimatedCost: 0, currency: 'EUR' },
    }
  }

  async draft(mission: RealResearchMission): Promise<IntelligenceDraft[]> {
    this.draftCalls += 1
    const profile = mission.profiles[0]?.profile
    if (!profile) throw new Error('FIXTURE_PROFILE_REQUIRED')
    this.draftsByProfile.set(profile, (this.draftsByProfile.get(profile) ?? 0) + 1)
    if (this.failure && this.remainingFailures > 0 && profile === this.failure.profile && mission.destination.name === this.failure.destination) {
      this.remainingFailures -= 1
      throw new Error(`${this.failure.code ?? 'NETWORK_TIMEOUT'}: controlled provider-boundary failure`)
    }
    return [{
      profile,
      title: profile === 'student' ? 'Granada' : 'Granada para explorar',
      content: profile === 'student'
        ? 'Granada es una ciudad andaluza con patrimonio histórico y una vida cultural documentada.'
        : 'Granada combina patrimonio, miradores y barrios históricos para una experiencia viajera consciente.',
      approximateWordCount: 16, promptVersion: 'fixture-084j', schemaVersion: 'fixture-084j',
      usage: { providerId: 'openai', model: 'gpt-5.6-luna', inputTokens: 0, outputTokens: 0, estimatedCost: 0, currency: 'EUR' },
    }]
  }

  async review(): Promise<IntelligenceReview> {
    this.reviewCalls += 1
    return { outcome: 'passed', issues: [], promptVersion: 'fixture-084j', schemaVersion: 'fixture-084j', usage: { providerId: 'openai', model: 'gpt-5.6-luna', inputTokens: 0, outputTokens: 0, estimatedCost: 0, currency: 'EUR' } }
  }
}

function providerCenterFixture() {
  const provider = (id: 'tavily' | 'openai', category: 'research_tool' | 'intelligence_engine', model: string) => ({
    id, displayName: id, category, configured: true, credentialMask: '••••••••' as const, active: true,
    selectedModel: model, availableModels: [model], tariffStatus: 'current' as const,
    tariffSummary: 'Tarifa de test vigente', connectionState: 'simulated_ok' as const,
  })
  return {
    snapshot: () => ({ secureStorageAvailable: true, simulationOnly: true as const, realClientsAvailable: true as const, externalCallsAllowed: false as const, pricingCatalogVersion: '2026-09-01.1', providers: [provider('tavily', 'research_tool', 'search-and-extract'), provider('openai', 'intelligence_engine', 'gpt-5.6-luna')] }),
  } as never
}

function fixtureWikimediaFetch() {
  let index = 0
  return async () => ({ ok: true, status: 200, json: async () => ({ query: { pages: [{
    pageid: 9_000 + ++index, title: `File:Granada fixture ${index}.jpg`, imageinfo: [{
      canonicaltitle: `File:Granada fixture ${index}.jpg`, url: `https://fixture.example.test/granada-${index}.jpg`, mime: 'image/jpeg', width: 2000, height: 1200, size: 40,
      extmetadata: {
        Artist: { value: 'Autor de fixture' }, LicenseShortName: { value: 'CC BY 4.0' }, LicenseUrl: { value: 'https://creativecommons.org/licenses/by/4.0/' },
        ImageDescription: { value: 'Vista documentada de Granada.' }, UsageTerms: { value: 'CC BY 4.0' },
      },
    }],
  }] } }) })
}

function fixtureImageFetch() {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x04, 0xb0, 0x07, 0xd0, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00, 0xff, 0xd9])
  return async () => ({ ok: true, status: 200, redirected: false, headers: new Headers({ 'content-type': 'image/jpeg', 'content-length': String(jpeg.byteLength) }), arrayBuffer: async () => jpeg.buffer.slice(0) })
}

async function importGranadaFixture(
  client: ReturnType<typeof createLocalSupabaseClientFromEnv>['client'],
  label: string,
  names: readonly string[] = ['Granada'],
  budgets: { maxCostPerDestination?: number; maxCostPerBatch?: number } = {},
) {
  const destinations = names.map(name => ({ id: randomUUID(), name }))
  const { error } = await client.from('geographic_entities').insert(destinations.map(destination => ({
    id: destination.id, parent_id: '70000000-0000-4000-8000-000000000001', entity_type: 'locality', name: destination.name,
    normalized_name: destination.name.toLocaleLowerCase('es'), country_code: 'ES', region_code: 'AN', slug: `${destination.name.toLocaleLowerCase('es').replaceAll(' ', '-')}-${destination.id.slice(0, 8)}`,
    source_name: '084j-fixture', source_version: 'v1', source_license: 'test', status: 'active', resolution_method: 'exact',
  })))
  expect(error).toBeNull()
  const repository = new SupabaseDestinationBatchRepository(client)
  const service = new DestinationBatchService(repository, new GeographicResolver(new SupabaseGeographyCatalogRepository(client), 'geonames-2026-07-20'))
  const imported = await service.importJson(JSON.stringify({
    batch: { name: `084J Granada ${label} ${randomUUID()}`, maxCostPerDestination: budgets.maxCostPerDestination ?? 0.2, maxCostPerBatch: budgets.maxCostPerBatch ?? 1 },
    destinations: names.map(name => ({ name, country: 'ES', region: 'Andalucía' })),
  }))
  if (process.env.KEEP_FACTORY_REDO_SMOKE === 'true') {
    const { error: markerError } = await client.from('editorial_destination_batches')
      .update({ smoke_fixture: true }).eq('id', imported.batch.id)
    expect(markerError).toBeNull()
  }
  for (const [index, job] of imported.jobs.entries()) created.push({ batchId: imported.batch.id, jobId: job.id, destinationId: destinations[index]!.id })
  return { repository, service, batch: (await repository.getBatch(imported.batch.id))!, jobs: imported.jobs, destinations }
}

function productionPort(
  client: ReturnType<typeof createLocalSupabaseClientFromEnv>['client'],
  research: ResearchDouble,
  intelligence: IntelligenceDouble,
) {
  return new ProductionBatchEditorialPhasePort({
    client, providerCenter: async () => providerCenterFixture(),
    environment: { NODE_ENV: 'test', INVESTIGHOST_REAL_BATCH_EXECUTION_TOKEN: testToken },
    testProviderSelection: { researchTool: research, intelligenceEngine: intelligence },
    testWikimediaFetch: fixtureWikimediaFetch(), testImageFetch: fixtureImageFetch(),
  })
}

integration('durable Supabase-local batch worker E2E', () => {
  afterEach(async () => {
    if (process.env.KEEP_FACTORY_REDO_SMOKE === 'true') {
      created.splice(0)
      return
    }
    const { client } = createLocalSupabaseClientFromEnv()
    const stagingPaths: string[] = []
    for (const fixture of created.splice(0)) {
      const { data: candidates, error } = await client
        .from('real_editorial_visual_candidates')
        .select('id')
        .eq('canonical_destination_id', fixture.destinationId)
      if (error) throw error
      const candidateIds = (candidates ?? []).map(candidate => String(candidate.id))
      if (candidateIds.length > 0) {
        const { data: stages, error: stagesError } = await client
          .from('real_editorial_visual_candidate_stages')
          .select('staging_storage_identity')
          .in('candidate_id', candidateIds)
        if (stagesError) throw stagesError
        stagingPaths.push(...(stages ?? []).map(stage => String(stage.staging_storage_identity)))
      }
    }
    if (stagingPaths.length > 0) {
      const { error } = await client.storage.from('visual-staging-private').remove(stagingPaths)
      if (error) throw error
    }
    cleanupLocalFixtureRows()
  })

  it('uses the production port, durable repositories and explicit network doubles to reach READY_FOR_REVIEW', async () => {
    const { client } = createLocalSupabaseClientFromEnv()
    const destinationId = randomUUID()
    const { error: geographyError } = await client.from('geographic_entities').insert({
      id: destinationId, parent_id: '70000000-0000-4000-8000-000000000001', entity_type: 'locality', name: 'Granada', normalized_name: 'granada', country_code: 'ES', region_code: 'AN', slug: `granada-e2e-${destinationId.slice(0, 8)}`,
      source_name: '084j-fixture', source_version: 'v1', source_license: 'test', status: 'active', resolution_method: 'exact',
    })
    expect(geographyError).toBeNull()
    const repository = new SupabaseDestinationBatchRepository(client)
    const service = new DestinationBatchService(repository, new GeographicResolver(new SupabaseGeographyCatalogRepository(client), 'geonames-2026-07-20'))
    const imported = await service.importJson(JSON.stringify({ batch: { name: `084J Granada ${destinationId}`, maxCostPerDestination: 0.2, maxCostPerBatch: 1 }, destinations: [{ name: 'Granada', country: 'ES', region: 'Andalucía' }] }))
    const job = imported.jobs[0]
    if (!job) throw new Error('BATCH_JOB_NOT_CREATED')
    created.push({ batchId: imported.batch.id, jobId: job.id, destinationId })
    if (job.canonicalDestinationId !== destinationId) throw new Error(`GRANADA_RESOLUTION_FAILED:${JSON.stringify({ identityState: job.identityState, status: job.status, normalizedCountry: job.normalizedCountry, canonicalDestinationId: job.canonicalDestinationId })}`)

    const research = new ResearchDouble()
    const intelligence = new IntelligenceDouble()
    const port = new ProductionBatchEditorialPhasePort({
      client, providerCenter: async () => providerCenterFixture(),
      environment: { NODE_ENV: 'test', INVESTIGHOST_REAL_BATCH_EXECUTION_TOKEN: testToken },
      testProviderSelection: { researchTool: research, intelligenceEngine: intelligence },
      testWikimediaFetch: fixtureWikimediaFetch(), testImageFetch: fixtureImageFetch(),
    })
    const result = await new EditorialBatchWorker(repository, port, { workerId: '084j-durable-e2e' }).runJob(job.id)
    expect(result.processed).toBe(true)
    if (result.job?.status !== 'READY_FOR_REVIEW') {
      throw new Error(`GRANADA_E2E_UNEXPECTED_JOB:${JSON.stringify(result.job)}`)
    }
    expect(result.job).toMatchObject({ status: 'READY_FOR_REVIEW', completedPhases: ['IDENTITY', 'RESEARCH', 'ANALYSIS', 'STUDENT', 'ADVENTURE', 'VISUALS', 'AUTO_REVIEW'] })
    expect(result.job?.artifactRefs).toMatchObject({ IDENTITY: destinationId, RESEARCH: expect.any(String), ANALYSIS: expect.any(String), STUDENT: expect.any(String), ADVENTURE: expect.any(String), VISUALS: expect.any(String), AUTO_REVIEW: expect.any(String) })
    expect(research.calls).toBe(1)
    expect(intelligence.analysisCalls).toBe(1)
    expect(intelligence.draftCalls).toBe(2)
    expect(intelligence.reviewCalls).toBe(1)

    const { data: execution } = await client.from('real_editorial_executions').select('id').eq('owner_id', job.id).eq('owner_type', 'BATCH_JOB').single()
    expect(execution?.id).toBeTruthy()
    const { data: library } = await client.from('real_editorial_library_entries').select('profile,status,execution_owner_id').eq('execution_owner_id', execution!.id).order('profile')
    expect(library).toEqual([{ profile: 'adventure', status: 'candidate', execution_owner_id: execution!.id }, { profile: 'student', status: 'candidate', execution_owner_id: execution!.id }])
    const { data: packageRow } = await client.from('real_editorial_visual_packages').select('id,state').eq('canonical_destination_id', destinationId).eq('workflow_key', 'visual-acquisition-v1').single()
    expect(packageRow).toMatchObject({ state: 'PARTIAL' })
    const review = await service.readJobForReview(job.id)
    expect(review).toMatchObject({
      jobId: job.id, batchId: imported.batch.id, destination: { canonicalDestinationId: destinationId, name: 'Granada' },
      status: 'READY_FOR_REVIEW', phase: 'AUTO_REVIEW', student: { revisionId: result.job!.artifactRefs.STUDENT },
      adventure: { revisionId: result.job!.artifactRefs.ADVENTURE }, visualPackageId: packageRow!.id,
      reviewArtifactId: result.job!.artifactRefs.AUTO_REVIEW, warnings: [], cost: expect.any(Number), attempts: 1, lastError: null,
    })
    expect(review.reviewSummary).toMatchObject({ outcome: 'passed' })
    const { count: approvals } = await client.from('real_editorial_library_version_decisions').select('*', { count: 'exact', head: true })
      .in('revision_id', [result.job!.artifactRefs.STUDENT!, result.job!.artifactRefs.ADVENTURE!])
    const { count: deliveries } = await client.from('real_editorial_trawel_deliveries').select('*', { count: 'exact', head: true })
      .eq('investighost_canonical_destination_id', destinationId)
    expect(approvals).toBe(0)
    expect(deliveries).toBe(0)
    const replay = await new EditorialBatchWorker(repository, port, { workerId: '084j-idempotency-replay' }).runJob(job.id)
    expect(replay.processed).toBe(false)
    expect([research.calls, intelligence.analysisCalls, intelligence.draftCalls, intelligence.reviewCalls]).toEqual([1, 1, 2, 1])
  })

  it.each([
    { label: 'Student', scope: 'STUDENT', studentDrafts: 2, adventureDrafts: 1 },
    { label: 'Adventure', scope: 'ADVENTURE', studentDrafts: 1, adventureDrafts: 2 },
    { label: 'Visuals', scope: 'VISUALS', studentDrafts: 1, adventureDrafts: 1 },
    { label: 'Editorial', scope: 'EDITORIAL', studentDrafts: 2, adventureDrafts: 2 },
  ] as const)('selectively redoes $label with the production port and preserves unrelated phases', async ({ label, scope, studentDrafts, adventureDrafts }) => {
    const { client } = createLocalSupabaseClientFromEnv()
    const destinationName = `Granada Redo ${label} ${randomUUID().slice(0, 8)}`
    const { repository, batch, jobs } = await importGranadaFixture(client, `redo-${scope.toLowerCase()}`, [destinationName])
    const research = new ResearchDouble()
    const intelligence = new IntelligenceDouble()
    const worker = new EditorialBatchWorker(repository, productionPort(client, research, intelligence), { workerId: `085c-redo-${scope.toLowerCase()}` })
    const initial = await worker.runJob(jobs[0]!.id)
    const before = initial.job!.artifactRefs
    const requested = await new DestinationBatchRedoService(repository).request({ jobId: jobs[0]!.id, scope, reason: 'ajustar explicación' })
    expect(requested).toMatchObject({ status: 'REDO_REQUIRED', redoScope: scope })
    const completed = await worker.runJob(jobs[0]!.id)
    if (completed.job?.status !== 'READY_FOR_REVIEW') throw new Error(`REDO_${scope}_UNEXPECTED:${completed.job?.lastFailure ?? 'missing failure'}`)
    if (scope === 'STUDENT' || scope === 'EDITORIAL') expect(completed.job!.artifactRefs.STUDENT).not.toBe(before.STUDENT)
    else expect(completed.job!.artifactRefs.STUDENT).toBe(before.STUDENT)
    if (scope === 'ADVENTURE' || scope === 'EDITORIAL') expect(completed.job!.artifactRefs.ADVENTURE).not.toBe(before.ADVENTURE)
    else expect(completed.job!.artifactRefs.ADVENTURE).toBe(before.ADVENTURE)
    if (scope === 'VISUALS') expect(completed.job!.artifactRefs.VISUALS).not.toBe(before.VISUALS)
    else expect(completed.job!.artifactRefs.VISUALS).toBe(before.VISUALS)
    expect(completed.job!.artifactRefs.AUTO_REVIEW).not.toBe(before.AUTO_REVIEW)
    expect([research.calls, intelligence.analysisCalls, intelligence.draftsByProfile.get('student'), intelligence.draftsByProfile.get('adventure'), intelligence.reviewCalls]).toEqual([1, 1, studentDrafts, adventureDrafts, 2])
    const { data: operations } = await client.from('editorial_destination_batch_redo_operations').select('scope,status,reason,previous_artifact_refs').eq('job_id', jobs[0]!.id)
    expect(operations).toEqual([expect.objectContaining({ scope, status: 'COMPLETED', reason: 'ajustar explicación', previous_artifact_refs: expect.objectContaining(before) })])
    const { data: execution, error: executionError } = await client.from('real_editorial_executions').select('id').eq('owner_id', jobs[0]!.id).single()
    expect(executionError).toBeNull()
    const { data: preapprovalRows, error: preapprovalError } = await client.from('real_editorial_library_entries').select('id')
      .eq('execution_owner_id', execution!.id).eq('status', 'candidate')
    expect(preapprovalError).toBeNull()
    expect(preapprovalRows).toHaveLength(2)
    const approvedLibrary = await new SupabaseRealEditorialPilotRepository(client).listLibraryEntries()
    expect(approvedLibrary.every(entry => entry.origin === 'real_editorial_pilot' && entry.editorialState === 'approved')).toBe(true)
    expect(approvedLibrary.some(entry => (preapprovalRows ?? []).some(row => row.id === entry.entryId))).toBe(false)
    if (scope === 'STUDENT' && process.env.KEEP_FACTORY_REDO_SMOKE === 'true') {
      console.info(`[factory redo smoke] batch=${batch.id} job=${jobs[0]!.id} destination=${destinationName}`)
    }
  }, 20_000)

  it('runs an explicitly marked local smoke redo with deterministic boundaries while normal jobs remain fail-closed', async () => {
    const { client } = createLocalSupabaseClientFromEnv()
    const { repository, batch, jobs } = await importGranadaFixture(client, 'manual-smoke', [`Granada Smoke ${randomUUID().slice(0, 8)}`])
    const research = new ResearchDouble()
    const intelligence = new IntelligenceDouble()
    await new EditorialBatchWorker(repository, productionPort(client, research, intelligence), { workerId: '085cr2-seed' }).runJob(jobs[0]!.id)
    const { error: markerError } = await client.from('editorial_destination_batches').update({ smoke_fixture: true }).eq('id', batch.id)
    expect(markerError).toBeNull()
    const marked = await repository.getBatch(batch.id)
    if (!marked) throw new Error('SMOKE_BATCH_MISSING')
    const smokeEnvironment = { INVESTIGHOST_FACTORY_SMOKE_MODE: 'true' }
    const smokePort = createFactoryBatchPhasePort({ client, providerCenter: async () => providerCenterFixture(), environment: smokeEnvironment, isDevelopment: true })
    await expect(smokePort.run({ batch: { ...marked, smokeFixture: false }, job: jobs[0]!, phase: 'RESEARCH' })).rejects.toThrow('BATCH_PROVIDER_AUTHORIZATION_REQUIRED')
    const before = (await repository.getJob(jobs[0]!.id))!.artifactRefs
    await new DestinationBatchRedoService(repository).request({ jobId: jobs[0]!.id, scope: 'ADVENTURE', reason: 'Quiero una versión más visual y menos genérica.' })
    const result = await new EditorialBatchWorker(repository, smokePort, { workerId: '085cr2-smoke' }).runJob(jobs[0]!.id)
    expect(result.job).toMatchObject({ status: 'READY_FOR_REVIEW' })
    expect(result.job!.artifactRefs.STUDENT).toBe(before.STUDENT)
    expect(result.job!.artifactRefs.VISUALS).toBe(before.VISUALS)
    expect(result.job!.artifactRefs.ADVENTURE).not.toBe(before.ADVENTURE)
    expect(result.job!.artifactRefs.AUTO_REVIEW).not.toBe(before.AUTO_REVIEW)
    const review = await repository.readJobForReview(jobs[0]!.id)
    expect(review?.redo).toMatchObject({ scope: 'ADVENTURE', status: 'COMPLETED', reason: 'Quiero una versión más visual y menos genérica.' })
  }, 20_000)

  it('retries Adventure from durable state without repeating research, analysis, Student or Library drafts', async () => {
    const { client } = createLocalSupabaseClientFromEnv()
    const { repository, service, jobs } = await importGranadaFixture(client, 'retry', ['Granada Retry'])
    const research = new ResearchDouble()
    const intelligence = new IntelligenceDouble({ profile: 'adventure', destination: 'Granada Retry', times: 1 })
    const first = await new EditorialBatchWorker(repository, productionPort(client, research, intelligence), { workerId: '084j-retry-first' }).runJob(jobs[0]!.id)
    expect(first.job).toMatchObject({ status: 'FAILED', currentPhase: 'ADVENTURE', completedPhases: ['IDENTITY', 'RESEARCH', 'ANALYSIS', 'STUDENT'], retryable: true })
    const retried = await service.retry(jobs[0]!.id)
    expect(retried.resumedPhase).toBe('ADVENTURE')
    const final = await new EditorialBatchWorker(repository, productionPort(client, research, intelligence), { workerId: '084j-retry-second' }).runJob(jobs[0]!.id)
    expect(final.job).toMatchObject({ status: 'READY_FOR_REVIEW', attemptCount: 2 })
    expect(research.calls).toBe(1)
    expect(intelligence.analysisCalls).toBe(1)
    expect(intelligence.draftsByProfile.get('student')).toBe(1)
    expect(intelligence.draftsByProfile.get('adventure')).toBe(2)
    const { count } = await client.from('real_editorial_library_entries').select('*', { count: 'exact', head: true })
      .eq('execution_owner_id', (await client.from('real_editorial_executions').select('id').eq('owner_id', jobs[0]!.id).single()).data!.id)
    expect(count).toBe(2)
  })

  it('resumes a new production runtime at Student after persisted Research and Analysis', async () => {
    const { client } = createLocalSupabaseClientFromEnv()
    const { repository, jobs } = await importGranadaFixture(client, 'resume', ['Granada Resume'])
    const research = new ResearchDouble()
    const interruptedProvider = new IntelligenceDouble({ profile: 'student', destination: 'Granada Resume', times: 1 })
    const interrupted = await new EditorialBatchWorker(repository, productionPort(client, research, interruptedProvider), { workerId: '084j-process-before-restart' }).runJob(jobs[0]!.id)
    expect(interrupted.job).toMatchObject({ status: 'FAILED', currentPhase: 'STUDENT', completedPhases: ['IDENTITY', 'RESEARCH', 'ANALYSIS'], retryable: true })
    // This is the persisted state a process leaves after dying between the
    // completed Analysis checkpoint and Student; the next runtime must reclaim
    // the stale lease instead of starting Research/Analysis over.
    await repository.updateJob({
      ...interrupted.job!, status: 'PROCESSING', retryable: true, claimedBy: '084j-terminated-process',
      claimToken: randomUUID(), claimExpiresAt: new Date(Date.now() - 1_000), updatedAt: new Date(),
    })
    const resumed = await new EditorialBatchWorker(repository, productionPort(client, research, interruptedProvider), { workerId: '084j-process-after-restart' }).runJob(jobs[0]!.id)
    expect(resumed.job).toMatchObject({ status: 'READY_FOR_REVIEW', attemptCount: 2 })
    expect(research.calls).toBe(1)
    expect(interruptedProvider.analysisCalls).toBe(1)
    expect(interruptedProvider.draftsByProfile.get('student')).toBe(2)
  })

  it('isolates a controlled failed job from the next valid job with concurrency one', async () => {
    const { client } = createLocalSupabaseClientFromEnv()
    const { repository, batch, jobs } = await importGranadaFixture(client, 'isolation', ['Granada Failure A', 'Granada Valid B'])
    const research = new ResearchDouble()
    const intelligence = new IntelligenceDouble({ profile: 'student', destination: 'Granada Failure A', times: 1, code: 'INSUFFICIENT_EVIDENCE' })
    const results = await new EditorialBatchWorker(repository, productionPort(client, research, intelligence), { workerId: '084j-isolation' }).runBatch(batch.id)
    expect(results).toHaveLength(2)
    expect((await repository.getJob(jobs[0]!.id))?.status).toBe('FAILED')
    expect((await repository.getJob(jobs[1]!.id))?.status).toBe('READY_FOR_REVIEW')
  }, 15_000)

  it('rejects insufficient durable budget before calling the research provider or creating spend', async () => {
    const { client } = createLocalSupabaseClientFromEnv()
    const { repository, jobs } = await importGranadaFixture(client, 'budget', ['Granada Budget'], { maxCostPerDestination: 0.0001 })
    const research = new ResearchDouble()
    const intelligence = new IntelligenceDouble()
    const result = await new EditorialBatchWorker(repository, productionPort(client, research, intelligence), { workerId: '084j-budget' }).runJob(jobs[0]!.id)
    expect(result.job).toMatchObject({ status: 'FAILED', currentPhase: 'RESEARCH' })
    expect(research.calls).toBe(0)
    const { count } = await client.from('real_editorial_provider_calls').select('*', { count: 'exact', head: true })
      .eq('execution_owner_id', (await client.from('real_editorial_executions').select('id').eq('owner_id', jobs[0]!.id).single()).data!.id)
    expect(count).toBe(0)
  })

  it('moves a READY_FOR_REVIEW job through the canonical human Library approval without delivery', async () => {
    const { client } = createLocalSupabaseClientFromEnv()
    const { repository, jobs } = await importGranadaFixture(client, 'human-approval', ['Granada Approval'])
    const research = new ResearchDouble()
    const intelligence = new IntelligenceDouble()
    await new EditorialBatchWorker(repository, productionPort(client, research, intelligence), { workerId: '084j-approval' }).runJob(jobs[0]!.id)
    const approved = await new DestinationBatchHumanReviewService(repository, new SupabaseRealEditorialLibraryVersioningRepository(client)).approve(jobs[0]!.id)
    expect(approved.status).toBe('APPROVED')
    const review = await repository.readJobForReview(jobs[0]!.id)
    expect(review?.student).toBeTruthy()
    expect(review?.adventure).toBeTruthy()
    const library = new SupabaseRealEditorialLibraryVersioningRepository(client)
    expect((await library.getCurrentApproved(review!.student!.libraryEntryId))?.revisionId).toBe(review!.student!.revisionId)
    expect((await library.getCurrentApproved(review!.adventure!.libraryEntryId))?.revisionId).toBe(review!.adventure!.revisionId)
    const { count } = await client.from('real_editorial_trawel_deliveries').select('*', { count: 'exact', head: true })
      .eq('investighost_canonical_destination_id', jobs[0]!.canonicalDestinationId!)
    expect(count).toBe(0)
  }, 15_000)
})

/**
 * Append-only audit tables intentionally reject REST deletes. This integration
 * harness runs only against the named Supabase-local project and removes only
 * its own `084J` namespace in child-first order.
 */
function cleanupLocalFixtureRows(): void {
  execFileSync('docker', ['exec', '-i', 'supabase_db_investighost', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'], {
    input: `begin;
create temp table fixture_jobs on commit drop as select j.id job_id,j.canonical_destination_id destination_id from public.editorial_destination_batch_jobs j join public.editorial_destination_batches b on b.id=j.batch_id where b.name like '084J Granada%';
create temp table fixture_executions on commit drop as select id from public.real_editorial_executions where owner_type='BATCH_JOB' and owner_id in(select job_id from fixture_jobs);
create temp table fixture_entries on commit drop as select id from public.real_editorial_library_entries where execution_owner_id in(select id from fixture_executions);
create temp table fixture_versions on commit drop as select id from public.real_editorial_library_versions where library_entry_id in(select id from fixture_entries);
create temp table fixture_revisions on commit drop as select id from public.real_editorial_library_version_revisions where version_id in(select id from fixture_versions);
set local session_replication_role=replica;
delete from public.real_editorial_library_version_decisions where version_id in(select id from fixture_versions) or revision_id in(select id from fixture_revisions);
delete from public.real_editorial_library_version_findings where version_id in(select id from fixture_versions) or revision_id in(select id from fixture_revisions);
delete from public.real_editorial_library_version_revisions where id in(select id from fixture_revisions);
delete from public.real_editorial_library_versions where id in(select id from fixture_versions);
delete from public.real_editorial_library_entries where id in(select id from fixture_entries);
delete from public.real_editorial_events where execution_owner_id in(select id from fixture_executions);
delete from public.real_editorial_provider_calls where execution_owner_id in(select id from fixture_executions);
delete from public.real_editorial_call_reservations where execution_owner_id in(select id from fixture_executions);
delete from public.real_editorial_artifacts where execution_owner_id in(select id from fixture_executions);
delete from public.real_editorial_executions where id in(select id from fixture_executions);
delete from public.real_editorial_visual_packages where canonical_destination_id in(select destination_id from fixture_jobs);
delete from public.real_editorial_visual_assets where canonical_destination_id in(select destination_id from fixture_jobs);
delete from public.real_editorial_visual_candidates where canonical_destination_id in(select destination_id from fixture_jobs);
delete from public.editorial_destination_batch_issues where batch_id in(select id from public.editorial_destination_batches where name like '084J Granada%');
delete from public.editorial_destination_batch_redo_operations where job_id in(select job_id from fixture_jobs);
delete from public.editorial_destination_batch_jobs where id in(select job_id from fixture_jobs);
delete from public.editorial_destination_batches where name like '084J Granada%';
delete from public.geographic_entities where source_name='084j-fixture';
commit;`,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  })
}
