import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  DurableRealEditorialPipeline,
  MemoryCostLedgerRepository,
  missionForPilot,
  realEditorialPayloadHash,
  TavilyResearchError,
  type IntelligenceDraft,
  type IntelligenceEngine,
  type IntelligenceReview,
  type IntelligenceRoundAnalysis,
  type RealEditorialArtifact,
  type RealEditorialArtifactKind,
  type RealEditorialPilotRepository,
  type ProviderResultSanitization,
  type ResearchTool,
  type ResearchToolResult,
} from '@modules/real-pipeline'
import {
  REAL_EDITORIAL_PILOT_POLICY,
  RealEditorialPilotRecordSchema,
  type RealEditorialPilotRecord,
  type RealEditorialPilotSnapshot,
  type RealEditorialPilotState,
} from '@shared/real-editorial-pilot-contracts'
import type {
  RealMasterKnowledge,
  RealResearchMission,
} from '@shared/real-pipeline-contracts'
import type { RealWorkflowCheckpoint } from '@modules/real-pipeline/real-workflow'

const now = '2026-07-25T20:00:00.000Z'
const pilotId = '81000000-0000-4000-8000-000000000001'
const runId = '81000000-0000-4000-8000-000000000002'
const destinationId = '81000000-0000-4000-8000-000000000003'

class MemoryDurableRepository implements RealEditorialPilotRepository {
  readonly artifacts = new Map<string, RealEditorialArtifact[]>()
  readonly events: string[] = []
  readonly eventDetails: Array<{ eventType: string; payload: Record<string, unknown> }> = []
  pilot = pilotRecord()
  result?: RealEditorialPilotSnapshot

  async inspect() {
    return {
      repositoryAvailable: true,
      connectivityValidated: true,
      guardFree: true,
      activeExecutions: 0,
      pendingReservations: 0,
      manualMorellaCount: 13,
      identicalPilotCount: 0,
      budgetValid: true,
    }
  }

  async prepare() { return this.pilot }
  async confirmBudget() { return this.pilot }
  async getPilot(id: string) { return id === this.pilot.id ? structuredClone(this.pilot) : undefined }
  async findByIdentity(identityKey: string) {
    return identityKey === this.pilot.identityKey ? structuredClone(this.pilot) : undefined
  }
  async getResult(id: string) { return id === this.pilot.id ? structuredClone(this.result) : undefined }

  async appendArtifact(
    _pilotId: string,
    targetRunId: string,
    kind: RealEditorialArtifactKind,
    key: string,
    version: number,
    payload: unknown,
  ) {
    const identity = `${targetRunId}:${kind}:${key}`
    const values = this.artifacts.get(identity) ?? []
    const hash = realEditorialPayloadHash(payload)
    const existing = values.find(item => item.version === version)
    if (existing && existing.payloadHash !== hash) throw new Error('VERSION_CONFLICT')
    if (!existing) values.push({
      kind,
      key,
      version,
      payload: structuredClone(payload),
      payloadHash: hash,
      createdAt: now,
    })
    this.artifacts.set(identity, values)
  }

  async latestArtifact(targetRunId: string, kind: RealEditorialArtifactKind, key: string) {
    const values = this.artifacts.get(`${targetRunId}:${kind}:${key}`) ?? []
    return structuredClone(values.sort((left, right) => right.version - left.version)[0])
  }

  async updateState(
    _pilotId: string,
    _runId: string,
    state: RealEditorialPilotState,
  ) {
    this.pilot = RealEditorialPilotRecordSchema.parse({ ...this.pilot, state, updatedAt: now })
  }

  async saveResult(snapshot: RealEditorialPilotSnapshot) {
    this.result = structuredClone(snapshot)
    await this.appendArtifact(pilotId, runId, 'checkpoint', 'pipeline', 1, snapshot)
    await this.updateState(pilotId, runId, snapshot.state)
    this.events.push('real.editorial.pending_human_review')
  }

  async saveResearchResult(
    _pilotId: string,
    _runId: string,
    mission: RealResearchMission,
    result: ResearchToolResult,
  ) {
    await this.appendArtifact(pilotId, runId, 'tavily_result', `round-${mission.round}`, 1, result)
    for (const source of result.sources) {
      await this.appendArtifact(pilotId, runId, 'source_accepted', source.id, 1, source)
      await this.appendArtifact(pilotId, runId, 'extracted_document', source.id, 1, source)
    }
  }

  async saveAnalysis(
    _pilotId: string,
    _runId: string,
    mission: RealResearchMission,
    analysis: IntelligenceRoundAnalysis,
  ) {
    await this.appendArtifact(pilotId, runId, 'master_knowledge', 'master', mission.round, analysis.masterKnowledge)
    await this.appendArtifact(pilotId, runId, 'coverage', 'coverage', mission.round, analysis.coverage)
    for (const claim of analysis.masterKnowledge.claims) {
      await this.appendArtifact(pilotId, runId, 'fact', claim.id, mission.round, claim)
    }
    for (const gap of analysis.gaps) {
      await this.appendArtifact(pilotId, runId, 'gap', gap.id, mission.round, gap)
    }
  }

  async saveDrafts(_pilotId: string, _runId: string, drafts: IntelligenceDraft[]) {
    for (const draft of drafts) {
      await this.appendArtifact(
        pilotId,
        runId,
        draft.profile === 'adventure' ? 'draft_adventure' : 'draft_student',
        draft.profile,
        1,
        draft,
      )
    }
  }

  async saveReview(_pilotId: string, _runId: string, review: IntelligenceReview) {
    await this.appendArtifact(pilotId, runId, 'final_review', 'final', 1, review)
  }

  async appendEvent(
    _pilotId: string,
    _runId: string | undefined,
    eventType: string,
    _state?: RealEditorialPilotState,
    payload: Record<string, unknown> = {},
  ) {
    this.events.push(eventType)
    this.eventDetails.push({ eventType, payload: structuredClone(payload) })
  }

  async recordIncident() {}

  async cancel() {
    await this.updateState(pilotId, runId, 'cancelled')
  }

  async reopenCancelled() {
    if (this.pilot.state !== 'cancelled') return
    const artifact = await this.latestArtifact(runId, 'checkpoint', 'workflow')
    if (artifact) {
      const checkpoint = artifact.payload as RealWorkflowCheckpoint
      await this.appendArtifact(pilotId, runId, 'checkpoint', 'workflow', artifact.version + 1, {
        ...checkpoint,
        state: checkpoint.completedRound === 0 ? 'queued' : 'researching_round_2',
      })
    }
    await this.updateState(pilotId, runId, 'preflight')
  }
}

class FakeResearchTool implements ResearchTool {
  readonly id = 'tavily'
  readonly model = 'search-and-extract'
  readonly simulation = true
  readonly rounds: number[] = []

  constructor(private readonly sanitization?: ProviderResultSanitization) {}

  async research(mission: RealResearchMission): Promise<ResearchToolResult> {
    this.rounds.push(mission.round)
    const url = `https://fixtures.investighost.local/morella/round-${mission.round}`
    const content = Array.from({ length: 1_200 }, (_, index) => `evidencia${mission.round}-${index}`).join(' ')
    return {
      round: mission.round,
      sources: [{
        id: `source-round-${mission.round}`,
        round: mission.round,
        url,
        normalizedUrl: url,
        title: `Morella ronda ${mission.round}`,
        capturedAt: now,
        contentHash: createHash('sha256').update(content).digest('hex'),
        score: 0.95,
        content,
      }],
      providerRequestIds: [`fake-tavily-${mission.round}`],
      failures: [],
      usageUnits: 0,
      credits: 0,
      urlSanitization: this.sanitization,
    }
  }
}

class InvalidUrlResearchTool implements ResearchTool {
  readonly id = 'tavily'
  readonly model = 'search-and-extract'
  readonly simulation = true
  calls = 0

  async research(): Promise<ResearchToolResult> {
    this.calls += 1
    throw new TavilyResearchError(
      'NO_VALID_HTTPS_SOURCES',
      'Tavily no devolvió ninguna URL HTTPS absoluta y válida',
      {
        providerRequestIds: ['sanitized-request-id'],
        credits: 1,
        calculatedCost: 0.008,
        toolCalls: 1,
      },
      {
        totalReceived: 1,
        accepted: 0,
        discarded: 1,
        discardReasons: { http: 1 },
      },
    )
  }
}

class FakeIntelligenceEngine implements IntelligenceEngine {
  readonly id = 'openai'
  readonly model = 'gpt-5.6-luna'
  readonly simulation = true
  readonly calls: string[] = []

  constructor(private readonly abortAfterRoundOne?: AbortController) {}

  async analyze(mission: RealResearchMission): Promise<IntelligenceRoundAnalysis> {
    this.calls.push(`analysis-${mission.round}`)
    const base = {
      masterKnowledge: knowledge(mission.round),
      usage: { inputTokens: 100, outputTokens: 50, estimatedCost: 0.022, currency: 'EUR' as const },
    }
    if (mission.round === 1) {
      this.abortAfterRoundOne?.abort()
      const gap = {
        id: 'gap-access',
        topic: 'access',
        description: 'Falta acceso actual.',
        importance: 'critical' as const,
        requiredForProfiles: ['adventure' as const],
        resolvableWithResearch: true,
      }
      const query = {
        id: 'query-access',
        gapId: gap.id,
        query: 'Morella acceso actual',
        rationale: 'Cerrar carencia práctica.',
      }
      return {
        ...base,
        coverage: {
          score: 0.7,
          sufficient: false,
          topics: [{ topic: 'access', required: true, coverage: 0.2, evidenceIds: [] }],
        },
        proposedQueries: [query],
        gaps: [gap],
        decision: {
          action: 'continue_focused',
          nextRound: 2,
          reason: 'Falta acceso.',
          queries: [query],
        },
      }
    }
    return {
      ...base,
      coverage: {
        score: 0.95,
        sufficient: true,
        topics: [{ topic: 'access', required: true, coverage: 1, evidenceIds: ['evidence-2'] }],
      },
      proposedQueries: [],
      gaps: [],
      decision: { action: 'stop_ready', reason: 'Cobertura suficiente.', queries: [] },
    }
  }

  async draft(): Promise<IntelligenceDraft[]> {
    this.calls.push('draft')
    return [
      draft('adventure', 1_000),
      draft('student', 1_800),
    ]
  }

  async review(): Promise<IntelligenceReview> {
    this.calls.push('review')
    return {
      outcome: 'passed',
      issues: [],
      promptVersion: 'fake-v1',
      schemaVersion: 'fake-v1',
      usage: { inputTokens: 100, outputTokens: 50, estimatedCost: 0.02, currency: 'EUR' },
    }
  }
}

function pilotRecord(): RealEditorialPilotRecord {
  return RealEditorialPilotRecordSchema.parse({
    id: pilotId,
    policyId: REAL_EDITORIAL_PILOT_POLICY.id,
    mode: 'real_editorial_pilot',
    taskOrigin: 'human_authorized',
    variantKey: 'initial',
    preparationKey: 'morella-real-editorial-pilot-v1-initial-prepare',
    identityKey: 'a'.repeat(64),
    canonicalDestinationId: destinationId,
    destinationName: 'Morella',
    normalizedDestination: 'morella',
    countryCode: 'ES',
    destinationType: 'locality',
    language: 'es',
    pipelineVersion: 'real-editorial-v1',
    profiles: [
      { profile: 'adventure', enabled: true, targetWords: 1_000, depth: 'standard' },
      { profile: 'student', enabled: true, targetWords: 1_800, depth: 'deep' },
    ],
    state: 'preflight',
    budgetConfirmed: true,
    publicationCount: 0,
    trawelConnected: false,
    automaticEnabled: false,
    currentRunId: runId,
    version: 1,
    createdAt: now,
    updatedAt: now,
    budget: {
      pilotId,
      taskId: `real-editorial-task:${pilotId}`,
      batchId: `real-editorial-batch:${pilotId}`,
      dailyScopeId: `real-editorial-day:${pilotId}`,
      budgetDate: '2026-07-25',
      currency: 'EUR',
      targetCost: 0.125,
      warningCost: 0.16,
      taskLimitCost: 0.2,
      batchLimitCost: 0.2,
      dailyLimitCost: 0.2,
      manualExtensionCost: 0.25,
      technicalLimitCost: 0.5,
      reservedCost: 0,
      spentCost: 0,
      confirmedAt: now,
    },
  })
}

function knowledge(round: 1 | 2): RealMasterKnowledge {
  return {
    requestId: pilotId,
    destinationId,
    revision: round,
    claims: [{
      id: `claim-${round}`,
      topic: round === 1 ? 'heritage' : 'access',
      statement: `Hecho documentado de ronda ${round}.`,
      evidenceIds: [`evidence-${round}`],
      confidence: 0.95,
      suitableProfiles: ['adventure', 'student'],
    }],
    contradictions: [],
    generatedAt: now,
  }
}

function draft(profile: 'adventure' | 'student', words: number): IntelligenceDraft {
  return {
    profile,
    title: `${profile} Morella`,
    content: Array.from({ length: words }, (_, index) => `${profile}${index}`).join(' '),
    approximateWordCount: words,
    promptVersion: 'fake-v1',
    schemaVersion: 'fake-v1',
    usage: { inputTokens: 100, outputTokens: 50, estimatedCost: 0.02, currency: 'EUR' },
  }
}

function ledgerRepository() {
  let sequence = 0
  return new MemoryCostLedgerRepository(
    { task: 0.2, batch: 0.2, daily: 0.2, currency: 'EUR' },
    {
      now: () => new Date(now),
      id: () => `durable-ledger-${++sequence}`,
    },
  )
}

describe('workflow editorial durable con clientes falsos', () => {
  it('verifica el mismo SHA-256 aunque JSONB reordene las claves', () => {
    expect(realEditorialPayloadHash({
      zeta: 1,
      nested: { beta: 2, alpha: 1 },
    })).toBe(realEditorialPayloadHash({
      nested: { alpha: 1, beta: 2 },
      zeta: 1,
    }))
  })

  it('persiste el ciclo completo, queda pending_human_review y no produce efectos externos', async () => {
    const repository = new MemoryDurableRepository()
    const ledger = ledgerRepository()
    const research = new FakeResearchTool()
    const intelligence = new FakeIntelligenceEngine()
    const result = await new DurableRealEditorialPipeline({
      repository,
      ledgerRepository: ledger,
      providers: { researchTool: research, intelligenceEngine: intelligence },
      now: () => new Date(now),
      id: () => '82000000-0000-4000-8000-000000000001',
    }).execute(repository.pilot, new AbortController().signal)

    expect(result).toMatchObject({
      state: 'pending_human_review',
      currentRound: 2,
      publicationCount: 0,
      regenerationCount: 0,
      trawelConnected: false,
      automaticEnabled: false,
    })
    expect(result.drafts.map(item => [item.profile, item.approximateWordCount])).toEqual([
      ['adventure', 1_000],
      ['student', 1_800],
    ])
    expect(result.roundResults).toHaveLength(2)
    expect(research.rounds).toEqual([1, 2])
    expect(intelligence.calls).toEqual(['analysis-1', 'analysis-2', 'draft', 'review'])
    expect(repository.events).toContain('real.editorial.pending_human_review')
    expect(await repository.latestArtifact(runId, 'mission', 'initial')).toBeDefined()
    expect(await repository.latestArtifact(runId, 'master_knowledge', 'master')).toBeDefined()
    expect(await repository.latestArtifact(runId, 'draft_adventure', 'adventure')).toBeDefined()
    expect(await repository.latestArtifact(runId, 'draft_student', 'student')).toBeDefined()
    expect(await repository.latestArtifact(runId, 'final_review', 'final')).toBeDefined()
    expect(ledger.budgetSnapshot().task.reserved).toBe(0)
    expect(ledger.budgetSnapshot().task.spent).toBeCloseTo(0.2, 8)
  })

  it('reutiliza la misión durable aunque el reloj de la reanudación sea posterior', async () => {
    const repository = new MemoryDurableRepository()
    const ledger = ledgerRepository()
    const mission = missionForPilot(repository.pilot, new Date(now))
    await repository.appendArtifact(pilotId, runId, 'mission', 'initial', 1, mission)
    const original = await repository.latestArtifact(runId, 'mission', 'initial')
    const research = new FakeResearchTool()
    const result = await new DurableRealEditorialPipeline({
      repository,
      ledgerRepository: ledger,
      providers: { researchTool: research, intelligenceEngine: new FakeIntelligenceEngine() },
      now: () => new Date('2026-07-25T22:25:25.272Z'),
      id: () => '82500000-0000-4000-8000-000000000001',
    }).execute(repository.pilot, new AbortController().signal)

    expect(result.state).toBe('pending_human_review')
    expect(research.rounds).toEqual([1, 2])
    expect(repository.artifacts.get(`${runId}:mission:initial`)).toHaveLength(1)
    expect(await repository.latestArtifact(runId, 'mission', 'initial')).toEqual(original)

    const duplicateResearch = new FakeResearchTool()
    const duplicate = await new DurableRealEditorialPipeline({
      repository,
      ledgerRepository: ledger,
      providers: {
        researchTool: duplicateResearch,
        intelligenceEngine: new FakeIntelligenceEngine(),
      },
      now: () => new Date('2026-07-25T22:30:00.000Z'),
      id: () => '82500000-0000-4000-8000-000000000002',
    }).execute(repository.pilot, new AbortController().signal)
    expect(duplicate).toEqual(result)
    expect(duplicateResearch.rounds).toEqual([])
    expect(repository.artifacts.get(`${runId}:mission:initial`)).toHaveLength(1)
  })

  it('mantiene el conflicto si la misión durable pertenece a otra configuración', async () => {
    const repository = new MemoryDurableRepository()
    const ledger = ledgerRepository()
    const mission = missionForPilot(repository.pilot, new Date(now))
    await repository.appendArtifact(pilotId, runId, 'mission', 'initial', 1, mission)
    const original = await repository.latestArtifact(runId, 'mission', 'initial')
    repository.pilot = RealEditorialPilotRecordSchema.parse({
      ...repository.pilot,
      canonicalDestinationId: '81000000-0000-4000-8000-000000000004',
    })
    const research = new FakeResearchTool()

    await expect(new DurableRealEditorialPipeline({
      repository,
      ledgerRepository: ledger,
      providers: { researchTool: research, intelligenceEngine: new FakeIntelligenceEngine() },
      now: () => new Date('2026-07-25T22:25:25.272Z'),
      id: () => '82600000-0000-4000-8000-000000000001',
    }).execute(repository.pilot, new AbortController().signal))
      .rejects.toMatchObject({ code: 'VERSION_CONFLICT' })

    expect(research.rounds).toEqual([])
    expect(ledger.budgetSnapshot().task).toMatchObject({ reserved: 0, spent: 0 })
    expect(await ledger.entries()).toEqual([])
    expect(await repository.latestArtifact(runId, 'mission', 'initial')).toEqual(original)
    expect(repository.artifacts.get(`${runId}:mission:initial`)).toHaveLength(1)
  })

  it('reanuda tras reinicio desde el checkpoint sin repetir la ronda 1', async () => {
    const repository = new MemoryDurableRepository()
    const ledger = ledgerRepository()
    const firstResearch = new FakeResearchTool()
    const firstController = new AbortController()
    const firstIntelligence = new FakeIntelligenceEngine(firstController)

    await expect(new DurableRealEditorialPipeline({
      repository,
      ledgerRepository: ledger,
      providers: { researchTool: firstResearch, intelligenceEngine: firstIntelligence },
      now: () => new Date(now),
      id: () => '83000000-0000-4000-8000-000000000001',
    }).execute(repository.pilot, firstController.signal)).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(firstResearch.rounds).toEqual([1])
    const originalMission = await repository.latestArtifact(runId, 'mission', 'initial')
    expect((await repository.latestArtifact(runId, 'checkpoint', 'workflow'))?.payload)
      .toMatchObject({ completedRound: 1, state: 'cancelled' })

    await repository.reopenCancelled(pilotId)
    const reopenedCheckpointCount = repository.artifacts.get(`${runId}:checkpoint:workflow`)?.length ?? 0
    await repository.reopenCancelled(pilotId)
    expect(repository.artifacts.get(`${runId}:checkpoint:workflow`)).toHaveLength(
      reopenedCheckpointCount,
    )
    const resumedResearch = new FakeResearchTool()
    const resumedIntelligence = new FakeIntelligenceEngine()
    const result = await new DurableRealEditorialPipeline({
      repository,
      ledgerRepository: ledger,
      providers: { researchTool: resumedResearch, intelligenceEngine: resumedIntelligence },
      now: () => new Date('2026-07-25T22:25:25.272Z'),
      id: () => '84000000-0000-4000-8000-000000000001',
    }).execute(repository.pilot, new AbortController().signal)

    expect(result.state).toBe('pending_human_review')
    expect(resumedResearch.rounds).toEqual([2])
    expect(resumedIntelligence.calls).toEqual(['analysis-2', 'draft', 'review'])
    expect(ledger.budgetSnapshot().task.reserved).toBe(0)
    expect(ledger.budgetSnapshot().task.spent).toBeCloseTo(0.2, 8)
    expect(repository.pilot.id).toBe(pilotId)
    expect(repository.pilot.currentRunId).toBe(runId)
    expect(repository.pilot.budget?.taskId).toBe(`real-editorial-task:${pilotId}`)
    expect(repository.artifacts.get(`${runId}:mission:initial`)).toHaveLength(1)
    expect(await repository.latestArtifact(runId, 'mission', 'initial')).toEqual(originalMission)
  })

  it('registra únicamente contadores agregados al descartar URLs de Tavily', async () => {
    const repository = new MemoryDurableRepository()
    const ledger = ledgerRepository()
    const research = new FakeResearchTool({
      totalReceived: 3,
      accepted: 2,
      discarded: 1,
      discardReasons: { http: 1 },
    })
    await new DurableRealEditorialPipeline({
      repository,
      ledgerRepository: ledger,
      providers: { researchTool: research, intelligenceEngine: new FakeIntelligenceEngine() },
      now: () => new Date(now),
      id: () => '85000000-0000-4000-8000-000000000001',
    }).execute(repository.pilot, new AbortController().signal)

    const warnings = repository.eventDetails.filter(
      event => event.eventType === 'real.editorial.tavily.results.filtered',
    )
    expect(warnings).toHaveLength(2)
    expect(warnings[0].payload).toEqual({
      round: 1,
      totalReceived: 3,
      accepted: 2,
      discarded: 1,
      discardReasons: { http: 1 },
    })
    expect(JSON.stringify(warnings)).not.toContain('http://')
    expect(JSON.stringify(warnings)).not.toMatch(/(?:tvly-|api[_ -]?key|authorization|bearer)/i)
  })

  it('registra la advertencia y concilia el coste conocido cuando todas las URL son inválidas', async () => {
    const repository = new MemoryDurableRepository()
    const ledger = ledgerRepository()
    const research = new InvalidUrlResearchTool()

    await expect(new DurableRealEditorialPipeline({
      repository,
      ledgerRepository: ledger,
      providers: { researchTool: research, intelligenceEngine: new FakeIntelligenceEngine() },
      now: () => new Date(now),
      id: () => '86000000-0000-4000-8000-000000000001',
    }).execute(repository.pilot, new AbortController().signal))
      .rejects.toMatchObject({ code: 'NO_VALID_HTTPS_SOURCES' })

    expect(research.calls).toBe(1)
    expect(await repository.latestArtifact(runId, 'tavily_result', 'round-1')).toBeUndefined()
    expect(repository.eventDetails).toContainEqual({
      eventType: 'real.editorial.tavily.results.filtered',
      payload: {
        round: 1,
        totalReceived: 1,
        accepted: 0,
        discarded: 1,
        discardReasons: { http: 1 },
      },
    })
    expect(ledger.budgetSnapshot().task).toMatchObject({ reserved: 0, spent: 0.008 })
  })
})
