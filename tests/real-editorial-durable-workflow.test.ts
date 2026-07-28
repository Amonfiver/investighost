import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  DurableRealEditorialPipeline,
  DurableRealEditorialTavilyRequestJournal,
  MemoryCostLedgerRepository,
  missionForPilot,
  OpenAIIntelligenceError,
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
  type TavilyRequestIdentity,
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
  readonly incidents: Array<{
    code: string
    classification: string
    message: string
  }> = []
  pilot = pilotRecord()
  result?: RealEditorialPilotSnapshot

  async inspect() {
    return {
      repositoryAvailable: true,
      connectivityValidated: true,
      guardFree: true,
      activeExecutions: 0,
      pendingReservations: 0,
      recoverableReservations: 0,
      humanRequiredCalls: 0,
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
  async getBudgetReview() { return undefined }
  async openBudgetReview() { return '81000000-0000-4000-8000-000000000099' }
  async resolveBudgetReview() { throw new Error('No usado por este doble') }

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
    for (const query of analysis.proposedQueries) {
      await this.appendArtifact(pilotId, runId, 'query', query.id, 1, query)
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

  async recordIncident(
    _pilotId: string,
    _runId: string,
    code: string,
    classification: string,
    message: string,
  ) {
    this.incidents.push({ code, classification, message })
    return '81000000-0000-4000-8000-000000000098'
  }

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

class ConfirmedTimeoutResearchTool implements ResearchTool {
  readonly id = 'tavily'
  readonly model = 'search-and-extract'
  readonly simulation = false

  async research(): Promise<ResearchToolResult> {
    throw new TavilyResearchError(
      'TIMEOUT_CANCELLED',
      'Tavily ronda 1, search 1, query “Morella patrimonio oficial” superó 60000 ms; '
        + 'el transporte confirmó la cancelación; el reintento controlado es seguro',
      undefined,
      undefined,
      {
        providerOutcome: 'cancelled_confirmed',
        correlationId: 'f'.repeat(64),
        stage: 'round-1:search:1',
        query: 'Morella patrimonio oficial',
        timeoutMs: 60_000,
        retrySafe: true,
        detail: 'Cancelación confirmada.',
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

class DivergentQueryRationaleEngine extends FakeIntelligenceEngine {
  override async analyze(mission: RealResearchMission): Promise<IntelligenceRoundAnalysis> {
    const analysis = await super.analyze(mission)
    if (mission.round !== 1 || analysis.decision.action !== 'continue_focused') return analysis
    const proposed = {
      ...analysis.proposedQueries[0],
      id: 'q3',
      gapId: analysis.gaps[0].id,
      query: 'Morella rutas duración dificultad temporada y seguridad',
      rationale: 'Obtener duración, dificultad, temporada y riesgos.',
    }
    return {
      ...analysis,
      proposedQueries: [proposed],
      decision: {
        ...analysis.decision,
        queries: [{
          ...proposed,
          rationale: 'Obtener duración, dificultad, temporada y seguridad.',
        }],
      },
    }
  }
}

class FailingAnalysisEngine extends FakeIntelligenceEngine {
  override async analyze(mission: RealResearchMission): Promise<never> {
    this.calls.push(`analysis-${mission.round}`)
    throw new OpenAIIntelligenceError(
      'CLIENT_ERROR',
      'Fallo OpenAI sintético anterior a respuesta remota',
    )
  }
}

class InvalidPayloadEngine extends FakeIntelligenceEngine {
  validateAnalyze(): void {
    throw new OpenAIIntelligenceError(
      'INVALID_REQUEST',
      'Payload sintético incompatible',
    )
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

  it('registra un timeout cancelado con certeza y libera su reserva sin continuar', async () => {
    const repository = new MemoryDurableRepository()
    const ledger = ledgerRepository()
    const intelligence = new FakeIntelligenceEngine()

    await expect(new DurableRealEditorialPipeline({
      repository,
      ledgerRepository: ledger,
      providers: {
        researchTool: new ConfirmedTimeoutResearchTool(),
        intelligenceEngine: intelligence,
      },
      now: () => new Date(now),
      id: () => '82100000-0000-4000-8000-000000000001',
    }).execute(repository.pilot, new AbortController().signal))
      .rejects.toMatchObject({ code: 'TIMEOUT_CANCELLED' })

    expect(ledger.budgetSnapshot().task).toMatchObject({
      reserved: 0,
      spent: 0,
    })
    expect(repository.incidents).toEqual([
      expect.objectContaining({
        code: 'TIMEOUT_CANCELLED',
        classification: 'recoverable',
        message: expect.stringContaining('reintento controlado es seguro'),
      }),
    ])
    expect(repository.events).toContain('real.editorial.execution.halted')
    expect(intelligence.calls).toEqual([])
    expect(await repository.latestArtifact(runId, 'tavily_result', 'round-1'))
      .toBeUndefined()
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

  it('reanuda en OpenAI reutilizando Tavily durable sin repetir la ronda 1', async () => {
    const repository = new MemoryDurableRepository()
    const ledger = ledgerRepository()
    const firstResearch = new FakeResearchTool()

    await expect(new DurableRealEditorialPipeline({
      repository,
      ledgerRepository: ledger,
      providers: {
        researchTool: firstResearch,
        intelligenceEngine: new FailingAnalysisEngine(),
      },
      now: () => new Date(now),
      id: () => '82700000-0000-4000-8000-000000000001',
    }).execute(repository.pilot, new AbortController().signal))
      .rejects.toMatchObject({ code: 'CLIENT_ERROR' })

    expect(firstResearch.rounds).toEqual([1])
    expect(ledger.budgetSnapshot().task).toMatchObject({ reserved: 0, spent: 0.048 })
    const storedResearch = await repository.latestArtifact(runId, 'tavily_result', 'round-1')
    const storedCheckpoint = await repository.latestArtifact(runId, 'checkpoint', 'workflow')
    expect(storedResearch).toBeDefined()
    expect(storedCheckpoint?.payload).toMatchObject({
      state: 'analyzing_round_1',
      completedRound: 0,
    })
    await repository.appendArtifact(
      pilotId,
      runId,
      'checkpoint',
      'workflow',
      (storedCheckpoint?.version ?? 0) + 1,
      {
        ...(storedCheckpoint?.payload as RealWorkflowCheckpoint),
        state: 'researching_round_1',
      },
    )

    const resumedResearch = new FakeResearchTool()
    const resumedIntelligence = new FakeIntelligenceEngine()
    const result = await new DurableRealEditorialPipeline({
      repository,
      ledgerRepository: ledger,
      providers: {
        researchTool: resumedResearch,
        intelligenceEngine: resumedIntelligence,
      },
      now: () => new Date('2026-07-25T22:43:45.000Z'),
      id: () => '82700000-0000-4000-8000-000000000002',
    }).execute(repository.pilot, new AbortController().signal)

    expect(result.state).toBe('pending_human_review')
    expect(resumedResearch.rounds).toEqual([2])
    expect(resumedIntelligence.calls).toEqual(['analysis-1', 'analysis-2', 'draft', 'review'])
    expect(await repository.latestArtifact(runId, 'tavily_result', 'round-1'))
      .toEqual(storedResearch)
    expect(repository.artifacts.get(`${runId}:tavily_result:round-1`)).toHaveLength(1)
    expect(repository.pilot).toMatchObject({
      id: pilotId,
      currentRunId: runId,
      budget: { taskId: `real-editorial-task:${pilotId}` },
    })
    expect(ledger.budgetSnapshot().task.reserved).toBe(0)
    expect(ledger.budgetSnapshot().task.spent).toBeCloseTo(0.2, 8)
    expect(await ledger.findByIdempotencyKey(
      `real-editorial-task:${pilotId}:round:1:research:attempt:1`,
    )).toMatchObject({ state: 'reconciled' })
    expect(await ledger.findByIdempotencyKey(
      `real-editorial-task:${pilotId}:round:1:research:attempt:2`,
    )).toBeUndefined()
    const failedAnalysis = await ledger.findByIdempotencyKey(
      `real-editorial-task:${pilotId}:round:1:analysis:attempt:1`,
    )
    expect(failedAnalysis).toMatchObject({ state: 'failed', calculatedCost: 0 })
    expect(await ledger.findByIdempotencyKey(
      `real-editorial-task:${pilotId}:round:1:analysis:attempt:2`,
    )).toMatchObject({
      state: 'reconciled',
      input: { retryOfCallId: failedAnalysis?.callId },
    })

    const duplicateResearch = new FakeResearchTool()
    const duplicate = await new DurableRealEditorialPipeline({
      repository,
      ledgerRepository: ledger,
      providers: {
        researchTool: duplicateResearch,
        intelligenceEngine: new FakeIntelligenceEngine(),
      },
      now: () => new Date('2026-07-25T22:44:00.000Z'),
      id: () => '82700000-0000-4000-8000-000000000003',
    }).execute(repository.pilot, new AbortController().signal)
    expect(duplicate).toEqual(result)
    expect(duplicateResearch.rounds).toEqual([])
  })

  it('encadena un tercer intento OpenAI sin duplicar Tavily, piloto, run ni presupuesto', async () => {
    const repository = new MemoryDurableRepository()
    const ledger = ledgerRepository()
    const firstResearch = new FakeResearchTool()
    const executeWith = (
      researchTool: ResearchTool,
      intelligenceEngine: IntelligenceEngine,
      suffix: string,
    ) => new DurableRealEditorialPipeline({
      repository,
      ledgerRepository: ledger,
      providers: { researchTool, intelligenceEngine },
      now: () => new Date(now),
      id: () => `87000000-0000-4000-8000-${suffix.padStart(12, '0')}`,
    }).execute(repository.pilot, new AbortController().signal)

    await expect(executeWith(firstResearch, new FailingAnalysisEngine(), '1'))
      .rejects.toMatchObject({ code: 'CLIENT_ERROR' })
    const storedResearch = await repository.latestArtifact(
      runId,
      'tavily_result',
      'round-1',
    )
    const secondResearch = new FakeResearchTool()
    await expect(executeWith(secondResearch, new FailingAnalysisEngine(), '2'))
      .rejects.toMatchObject({ code: 'CLIENT_ERROR' })

    const thirdResearch = new FakeResearchTool()
    const result = await executeWith(thirdResearch, new FakeIntelligenceEngine(), '3')

    expect(result.state).toBe('pending_human_review')
    expect(firstResearch.rounds).toEqual([1])
    expect(secondResearch.rounds).toEqual([])
    expect(thirdResearch.rounds).toEqual([2])
    expect(repository.artifacts.get(`${runId}:tavily_result:round-1`)).toHaveLength(1)
    expect(await repository.latestArtifact(runId, 'tavily_result', 'round-1'))
      .toEqual(storedResearch)
    const analysisOne = await ledger.findByIdempotencyKey(
      `real-editorial-task:${pilotId}:round:1:analysis:attempt:1`,
    )
    const analysisTwo = await ledger.findByIdempotencyKey(
      `real-editorial-task:${pilotId}:round:1:analysis:attempt:2`,
    )
    expect(analysisOne).toMatchObject({ state: 'failed', calculatedCost: 0 })
    expect(analysisTwo).toMatchObject({
      state: 'failed',
      calculatedCost: 0,
      input: { retryOfCallId: analysisOne?.callId },
    })
    expect(await ledger.findByIdempotencyKey(
      `real-editorial-task:${pilotId}:round:1:analysis:attempt:3`,
    )).toMatchObject({
      state: 'reconciled',
      input: { retryOfCallId: analysisTwo?.callId },
    })
    expect(repository.pilot).toMatchObject({
      id: pilotId,
      currentRunId: runId,
      budget: {
        taskId: `real-editorial-task:${pilotId}`,
        taskLimitCost: 0.2,
      },
    })
    expect(ledger.budgetSnapshot().task).toMatchObject({ reserved: 0, spent: 0.2 })

    const duplicateResearch = new FakeResearchTool()
    const duplicateIntelligence = new FakeIntelligenceEngine()
    await expect(executeWith(duplicateResearch, duplicateIntelligence, '4'))
      .resolves.toEqual(result)
    expect(duplicateResearch.rounds).toEqual([])
    expect(duplicateIntelligence.calls).toEqual([])
    expect(await ledger.findByIdempotencyKey(
      `real-editorial-task:${pilotId}:round:1:analysis:attempt:4`,
    )).toBeUndefined()
  })

  it('valida el payload OpenAI antes de crear su reserva o invocar el cliente', async () => {
    const repository = new MemoryDurableRepository()
    const ledger = ledgerRepository()
    const intelligence = new InvalidPayloadEngine()

    await expect(new DurableRealEditorialPipeline({
      repository,
      ledgerRepository: ledger,
      providers: {
        researchTool: new FakeResearchTool(),
        intelligenceEngine: intelligence,
      },
      now: () => new Date(now),
      id: () => '87500000-0000-4000-8000-000000000001',
    }).execute(repository.pilot, new AbortController().signal))
      .rejects.toMatchObject({ code: 'INVALID_REQUEST' })

    expect(intelligence.calls).toEqual([])
    expect(await ledger.findByIdempotencyKey(
      `real-editorial-task:${pilotId}:round:1:analysis:attempt:1`,
    )).toBeUndefined()
    expect(ledger.budgetSnapshot().task).toMatchObject({
      reserved: 0,
      spent: 0.048,
    })
  })

  it('rechaza rounds corruptas antes de reservar o invocar OpenAI', async () => {
    const repository = new MemoryDurableRepository()
    const ledger = ledgerRepository()
    const initialIntelligence = new FailingAnalysisEngine()

    await expect(new DurableRealEditorialPipeline({
      repository,
      ledgerRepository: ledger,
      providers: {
        researchTool: new FakeResearchTool(),
        intelligenceEngine: initialIntelligence,
      },
      now: () => new Date(now),
      id: () => '82800000-0000-4000-8000-000000000001',
    }).execute(repository.pilot, new AbortController().signal))
      .rejects.toMatchObject({ code: 'CLIENT_ERROR' })

    const stored = await repository.latestArtifact(runId, 'checkpoint', 'workflow')
    const storedPayload = stored?.payload as RealWorkflowCheckpoint
    await repository.appendArtifact(
      pilotId,
      runId,
      'checkpoint',
      'workflow',
      (stored?.version ?? 0) + 1,
      {
        ...storedPayload,
        state: 'researching_round_1',
        dossier: {
          ...storedPayload.dossier,
          rounds: [1, 1],
        },
      },
    )
    const resumedResearch = new FakeResearchTool()
    const resumedIntelligence = new FakeIntelligenceEngine()
    const reservationsBefore = (await ledger.entries()).length

    await expect(new DurableRealEditorialPipeline({
      repository,
      ledgerRepository: ledger,
      providers: {
        researchTool: resumedResearch,
        intelligenceEngine: resumedIntelligence,
      },
      now: () => new Date('2026-07-25T22:43:45.000Z'),
      id: () => '82800000-0000-4000-8000-000000000002',
    }).execute(repository.pilot, new AbortController().signal))
      .rejects.toMatchObject({ code: 'CHECKPOINT_INVALID' })

    expect(resumedResearch.rounds).toEqual([])
    expect(resumedIntelligence.calls).toEqual([])
    expect(await ledger.entries()).toHaveLength(reservationsBefore)
    expect(ledger.budgetSnapshot().task).toMatchObject({ reserved: 0, spent: 0.048 })
    expect(repository.artifacts.get(`${runId}:tavily_result:round-1`)).toHaveLength(1)
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

  it('reanuda tras ampliar presupuesto reutilizando la query durable equivalente', async () => {
    const repository = new MemoryDurableRepository()
    const ledger = ledgerRepository()
    const firstResearch = new FakeResearchTool()
    const firstController = new AbortController()
    const firstIntelligence = new DivergentQueryRationaleEngine(firstController)

    await expect(new DurableRealEditorialPipeline({
      repository,
      ledgerRepository: ledger,
      providers: { researchTool: firstResearch, intelligenceEngine: firstIntelligence },
      now: () => new Date(now),
      id: () => '88000000-0000-4000-8000-000000000001',
    }).execute(repository.pilot, firstController.signal)).rejects.toMatchObject({
      code: 'CANCELLED',
    })

    const roundOneResearch = await repository.latestArtifact(runId, 'tavily_result', 'round-1')
    const roundOneAnalysis = await repository.latestArtifact(runId, 'round', 'round-1')
    const durableQuery = await repository.latestArtifact(runId, 'query', 'q3')
    const halted = await repository.latestArtifact(runId, 'checkpoint', 'workflow')
    const haltedCheckpoint = halted?.payload as RealWorkflowCheckpoint
    expect(durableQuery?.payload).toMatchObject({
      id: 'q3',
      rationale: 'Obtener duración, dificultad, temporada y riesgos.',
    })
    expect(haltedCheckpoint.lastDecision).toMatchObject({
      action: 'continue_focused',
      queries: [{
        id: 'q3',
        rationale: 'Obtener duración, dificultad, temporada y seguridad.',
      }],
    })

    await repository.appendArtifact(
      pilotId,
      runId,
      'checkpoint',
      'workflow',
      (halted?.version ?? 0) + 1,
      {
        ...haltedCheckpoint,
        state: 'researching_round_2',
        nextRoundQueries: haltedCheckpoint.lastDecision?.action === 'continue_focused'
          ? haltedCheckpoint.lastDecision.queries
          : [],
        updatedAt: '2026-07-28T17:16:29.183Z',
      },
    )
    const spentCost = ledger.budgetSnapshot().task.spent
    repository.pilot = RealEditorialPilotRecordSchema.parse({
      ...repository.pilot,
      state: 'researching_round_2',
      budget: {
        ...repository.pilot.budget,
        taskLimitCost: 0.27,
        batchLimitCost: 0.27,
        dailyLimitCost: 0.27,
        spentCost,
      },
    })

    const resumedResearch = new FakeResearchTool()
    const resumedIntelligence = new FakeIntelligenceEngine()
    const result = await new DurableRealEditorialPipeline({
      repository,
      ledgerRepository: ledger,
      providers: {
        researchTool: resumedResearch,
        intelligenceEngine: resumedIntelligence,
      },
      now: () => new Date('2026-07-28T17:18:01.188Z'),
      id: () => '88000000-0000-4000-8000-000000000002',
    }).execute(repository.pilot, new AbortController().signal)

    expect(result).toMatchObject({
      state: 'pending_human_review',
      publicationCount: 0,
      trawelConnected: false,
      automaticEnabled: false,
    })
    expect(firstResearch.rounds).toEqual([1])
    expect(resumedResearch.rounds).toEqual([2])
    expect(resumedIntelligence.calls).toEqual(['analysis-2', 'draft', 'review'])
    expect(await repository.latestArtifact(runId, 'tavily_result', 'round-1'))
      .toEqual(roundOneResearch)
    expect(await repository.latestArtifact(runId, 'round', 'round-1'))
      .toEqual(roundOneAnalysis)
    expect(repository.artifacts.get(`${runId}:tavily_result:round-1`)).toHaveLength(1)
    expect(repository.artifacts.get(`${runId}:round:round-1`)).toHaveLength(1)
    expect(repository.artifacts.get(`${runId}:query:q3`)).toHaveLength(1)

    const ledgerEntries = await ledger.entries()
    const artifactCounts = new Map(
      [...repository.artifacts].map(([key, values]) => [key, values.length]),
    )
    const duplicateResearch = new FakeResearchTool()
    const duplicateIntelligence = new FakeIntelligenceEngine()
    await expect(new DurableRealEditorialPipeline({
      repository,
      ledgerRepository: ledger,
      providers: {
        researchTool: duplicateResearch,
        intelligenceEngine: duplicateIntelligence,
      },
      now: () => new Date('2026-07-28T17:20:00.000Z'),
      id: () => '88000000-0000-4000-8000-000000000003',
    }).execute(repository.pilot, new AbortController().signal)).resolves.toEqual(result)
    expect(duplicateResearch.rounds).toEqual([])
    expect(duplicateIntelligence.calls).toEqual([])
    expect(await ledger.entries()).toEqual(ledgerEntries)
    expect(new Map([...repository.artifacts].map(([key, values]) => [key, values.length])))
      .toEqual(artifactCounts)
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

  it('conserva y reutiliza una respuesta Tavily tardía por identidad durable exacta', async () => {
    const repository = new MemoryDurableRepository()
    const journal = new DurableRealEditorialTavilyRequestJournal(
      repository,
      pilotId,
      runId,
    )
    const firstIdentity: TavilyRequestIdentity = {
      version: 'tavily-request-v1',
      correlationId: 'c'.repeat(64),
      requestHash: 'd'.repeat(64),
      pathname: '/search',
      query: 'Morella patrimonio oficial',
      round: 2,
      requestIndex: 1,
      timeoutMs: 60_000,
      context: {
        operationId: `real-editorial-task:${pilotId}:round:2:research`,
        reservationId: 'reservation-tavily-attempt-1',
        callId: 'call-tavily-attempt-1',
        attempt: 1,
      },
    }
    const response = {
      status: 200,
      body: {
        request_id: 'tavily-request-late',
        results: [{
          url: 'https://example.test/morella',
          title: 'Morella oficial',
          content: 'Resumen',
          score: 0.9,
        }],
        usage: { credits: 1 },
      },
    }

    await journal.started(firstIdentity)
    await journal.failed(firstIdentity, {
      providerOutcome: 'ambiguous',
      correlationId: firstIdentity.correlationId,
      stage: 'round-2:search:1',
      query: firstIdentity.query,
      timeoutMs: firstIdentity.timeoutMs,
      retrySafe: false,
      detail: 'El aborto local no confirma el resultado remoto.',
    })
    await journal.completed(firstIdentity, response, true)

    const secondIdentity: TavilyRequestIdentity = {
      ...firstIdentity,
      context: {
        ...firstIdentity.context,
        reservationId: 'reservation-tavily-attempt-2',
        callId: 'call-tavily-attempt-2',
        attempt: 2,
      },
    }
    await expect(journal.load(secondIdentity)).resolves.toEqual({
      response,
      billable: false,
    })
    await journal.reused(secondIdentity, response)

    const artifact = await repository.latestArtifact(
      runId,
      'tavily_result',
      `request-${firstIdentity.correlationId}`,
    )
    expect(artifact?.payload).toMatchObject({
      version: 'tavily-request-v1',
      correlationId: firstIdentity.correlationId,
      requestHash: firstIdentity.requestHash,
      originAttempt: 1,
      responseStatus: 200,
      responseBody: {
        request_id: 'tavily-request-late',
        usage: { credits: 1 },
      },
    })
    expect(repository.events).toEqual([
      'real.editorial.tavily.request.started',
      'real.editorial.tavily.request.ambiguous',
      'real.editorial.tavily.request.late_completed',
      'real.editorial.tavily.request.reused',
    ])
    expect(repository.artifacts.get(
      `${runId}:tavily_result:request-${firstIdentity.correlationId}`,
    )).toHaveLength(1)
  })
})
