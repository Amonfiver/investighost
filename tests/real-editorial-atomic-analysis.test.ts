import { describe, expect, it, vi } from 'vitest'
import {
  realEditorialAnalysisArtifacts,
  SupabaseRealEditorialPilotRepository,
  type IntelligenceRoundAnalysis,
} from '@modules/real-pipeline'
import type {
  RealResearchDossier,
  RealResearchMission,
} from '@shared/real-pipeline-contracts'

const pilotId = 'a1000000-0000-4000-8000-000000000001'
const runId = 'a1000000-0000-4000-8000-000000000002'
const timestamp = '2026-08-01T12:00:00.000Z'

function mission(round: 1 | 2): RealResearchMission {
  return {
    requestId: pilotId,
    runId,
    taskId: `task:${pilotId}`,
    round,
    createdAt: timestamp,
  } as RealResearchMission
}

function analysis(round: 1 | 2, queryText = 'Morella consulta focalizada'): IntelligenceRoundAnalysis {
  const query = {
    id: 'q1',
    gapId: 'g1',
    query: queryText,
    rationale: 'Completar la cobertura.',
  }
  return {
    masterKnowledge: {
      requestId: pilotId,
      destinationId: 'destination-morella',
      revision: round,
      claims: [{
        id: 'claim-1',
        topic: 'ruta',
        statement: 'Hecho sintético trazable.',
        evidenceIds: ['evidence-1'],
        confidence: 0.9,
        suitableProfiles: ['adventure'],
      }],
      contradictions: [],
      generatedAt: timestamp,
    },
    coverage: {
      score: 0.8,
      sufficient: round === 2,
      topics: [],
    },
    proposedQueries: [query],
    gaps: [{
      id: 'g1',
      topic: 'ruta',
      description: 'Falta detalle.',
      importance: 'high',
      requiredForProfiles: ['adventure'],
      resolvableWithResearch: true,
    }],
    decision: round === 1
      ? { action: 'continue_focused', nextRound: 2, reason: 'Falta detalle.', queries: [query] }
      : { action: 'stop_ready', reason: 'Fin de la segunda ronda.', queries: [] },
    usage: {
      inputTokens: 100,
      outputTokens: 50,
      estimatedCost: 0.001,
      currency: 'EUR',
      providerRequestIds: ['resp-synthetic'],
    },
  }
}

const dossier = { evidence: [] } as unknown as RealResearchDossier

describe('persistencia atómica e identidad por ronda del análisis', () => {
  it('genera identidades por ronda y deja las consultas de ronda 2 como diagnósticas', () => {
    const roundOne = realEditorialAnalysisArtifacts(mission(1), analysis(1), dossier)
    const roundTwo = realEditorialAnalysisArtifacts(
      mission(2),
      analysis(2, 'Morella senderismo y paseos'),
      dossier,
    )

    expect(roundOne.find(item => item.kind === 'query')).toMatchObject({
      key: 'round-1/q1',
      version: 1,
      payload: { generatingRound: 1, queryOrdinal: 1, actionable: true },
    })
    expect(roundTwo.find(item => item.kind === 'query')).toMatchObject({
      key: 'round-2/q1',
      version: 1,
      payload: { generatingRound: 2, queryOrdinal: 1, actionable: false },
    })
    expect(roundTwo.filter(item => item.kind === 'round')).toHaveLength(1)
  })

  it('envía todo el análisis en una sola RPC, incluido round/round-2', async () => {
    const rpc = vi.fn(async () => ({ data: 8, error: null }))
    const repository = new SupabaseRealEditorialPilotRepository({ rpc } as never)

    await repository.saveAnalysis(
      pilotId,
      runId,
      mission(2),
      analysis(2),
      dossier,
      'a1000000-0000-4000-8000-000000000003',
    )

    expect(rpc).toHaveBeenCalledOnce()
    const [name, parameters] = rpc.mock.calls[0]
    expect(name).toBe('persist_real_editorial_analysis')
    expect(parameters).toMatchObject({
      p_pilot_id: pilotId,
      p_run_id: runId,
      p_round: 2,
      p_provider_receipt_id: 'a1000000-0000-4000-8000-000000000003',
    })
    expect(parameters.p_artifacts).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'round', key: 'round-2', version: 1 }),
      expect.objectContaining({ kind: 'query', key: 'round-2/q1', version: 1 }),
    ]))
  })

  it('un conflicto transaccional no intenta inserciones parciales desde el cliente', async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: 'ANALYSIS_ARTIFACT_CONFLICT' },
    }))
    const from = vi.fn()
    const repository = new SupabaseRealEditorialPilotRepository({ rpc, from } as never)

    await expect(repository.saveAnalysis(
      pilotId,
      runId,
      mission(2),
      analysis(2),
      dossier,
    )).rejects.toMatchObject({ code: 'VERSION_CONFLICT' })
    expect(rpc).toHaveBeenCalledOnce()
    expect(from).not.toHaveBeenCalled()
  })

  it('rechaza una decisión que intentaría activar ronda 3 antes de persistir', async () => {
    const rpc = vi.fn()
    const repository = new SupabaseRealEditorialPilotRepository({ rpc } as never)
    const invalid = analysis(2)
    invalid.decision = {
      action: 'continue_focused',
      nextRound: 2,
      reason: 'No debe continuar.',
      queries: invalid.proposedQueries,
    }

    await expect(repository.saveAnalysis(
      pilotId,
      runId,
      mission(2),
      invalid,
      dossier,
    )).rejects.toMatchObject({ code: 'CHECKPOINT_INVALID' })
    expect(rpc).not.toHaveBeenCalled()
  })
})
