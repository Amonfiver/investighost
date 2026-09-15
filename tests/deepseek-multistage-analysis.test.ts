import { describe, expect, it } from 'vitest'
import {
  DEEPSEEK_ANALYSIS_STAGE_IDS,
  DeepSeekStageASchema,
  DeepSeekStageBSchema,
  DeepSeekStageCSchema,
  DeepSeekStageDSchema,
  DeepSeekMultiStageAnalysisEngine,
  assembleDeepSeekMultiStageAnalysis,
  deepSeekMultiStageTotalBudget,
} from '@modules/real-pipeline/deepseek-multistage-analysis'
import { OpenAIIntelligenceEngine, type OpenAIResponseEnvelope, type OpenAIResponseRequest, type OpenAIResponsesClient } from '@modules/real-pipeline/openai-intelligence-engine'
import { OpenAIRoundAnalysisOutputSchema } from '@shared/openai-intelligence-contracts'
import type { RealResearchDossier, RealResearchMission } from '@shared/real-pipeline-contracts'

const timestamp = '2026-09-16T00:00:00.000Z'
const mission: RealResearchMission = {
  requestId: 'request-cuenca', runId: 'run-cuenca', taskId: 'task-cuenca',
  destination: { canonicalId: 'destination-cuenca', name: 'Cuenca', countryCode: 'ES', type: 'locality' },
  language: 'es', profiles: [{ profile: 'adventure', enabled: true, targetWords: 1_000 }, { profile: 'student', enabled: true, targetWords: 1_800 }],
  depth: 'deep', round: 1, objectives: ['patrimonio'], focusedQueries: [],
  limits: { maxRounds: 2, maxFocusedQueriesPerRound: 4, maxSources: 8, maxCharactersPerSource: 100_000, maxProviderCalls: 8, maxInputTokens: 200_000, maxOutputTokens: 12_000, taskBudgetEur: 0.2, batchBudgetEur: 0.2, dailyBudgetEur: 0.2 }, createdAt: timestamp,
}
const dossier: RealResearchDossier = {
  requestId: mission.requestId, runId: mission.runId, taskId: mission.taskId, destinationId: mission.destination.canonicalId, rounds: [1], generatedAt: timestamp,
  sources: [{ id: 'source-1', round: 1, url: 'https://example.test/cuenca', normalizedUrl: 'https://example.test/cuenca', title: 'Fuente', capturedAt: timestamp, contentHash: 'a'.repeat(64), score: 0.9, content: 'Contenido durable.' }],
  evidence: [{ id: 'evidence-1', statement: 'Hecho sustentado.', sourceIds: ['source-1'], confidence: 0.9, contradiction: 'none', freshness: 'current' }],
}
function stages() {
  return {
    a: { claims: [{ id: 'claim-1', topic: 'heritage', statement: 'Cuenca tiene patrimonio.', evidenceIds: ['evidence-1'], confidence: 0.9, suitableProfiles: ['adventure', 'student'] }] },
    b: { contradictions: [{ text: 'Una fecha requiere contraste.', claimIds: ['claim-1'] }], gaps: [{ id: 'gap-1', topic: 'access', description: 'Falta frecuencia.', importance: 'high', requiredForProfiles: ['adventure'], resolvableWithResearch: true }] },
    c: { coverage: { score: 0.7, sufficient: false, topics: [{ topic: 'heritage', required: true, coverage: 0.9, evidenceIds: ['evidence-1'] }] }, profileCoverage: [
      { profile: 'adventure', score: 0.6, sufficient: false, requirements: { routes: 0.6, specific_places: 0.8, access: 0.2, duration: 0.7, costs: 0.5, season: 0.6, risks: 0.7 }, warnings: ['Falta acceso'] },
      { profile: 'student', score: 0.9, sufficient: true, requirements: { history: 0.9, dates: 0.8, population: 0.7, monuments: 0.9, culture: 0.9, daily_life: 0.7 }, warnings: [] },
    ] },
    d: { proposedQueries: [{ id: 'query-1', gapId: 'gap-1', query: 'Cuenca acceso actual', rationale: 'Completar acceso.' }], decision: { action: 'continue_focused' as const, nextRound: 2 as const, reason: 'Falta acceso.', queries: [{ id: 'query-1', gapId: 'gap-1', query: 'Cuenca acceso actual', rationale: 'Completar acceso.' }] } },
  }
}

describe('analysis DeepSeek multi-stage', () => {
  it('valida A/B/C/D y ensambla el mismo contrato canónico', () => {
    const value = stages()
    const output = assembleDeepSeekMultiStageAnalysis(mission, dossier, DeepSeekStageASchema.parse(value.a), DeepSeekStageBSchema.parse(value.b), DeepSeekStageCSchema.parse(value.c), DeepSeekStageDSchema.parse(value.d))
    expect(OpenAIRoundAnalysisOutputSchema.parse(output)).toEqual(output)
    expect(output.claims[0].evidenceIds).toEqual(['evidence-1'])
    expect(output.gaps[0].id).toBe('gap-1')
  })

  it('falla cerrado para required faltante, evidencia desconocida y contradicción sin claim', () => {
    const value = stages()
    expect(DeepSeekStageASchema.safeParse({ claims: [{ ...value.a.claims[0], evidenceIds: undefined }] }).success).toBe(false)
    expect(() => assembleDeepSeekMultiStageAnalysis(mission, dossier, DeepSeekStageASchema.parse({ claims: [{ ...value.a.claims[0], evidenceIds: ['unknown'] }] }), DeepSeekStageBSchema.parse(value.b), DeepSeekStageCSchema.parse(value.c), DeepSeekStageDSchema.parse(value.d))).toThrow('MULTI_STAGE_REFERENCE_INVALID')
    expect(() => assembleDeepSeekMultiStageAnalysis(mission, dossier, DeepSeekStageASchema.parse(value.a), DeepSeekStageBSchema.parse({ ...value.b, contradictions: [{ text: 'Sin claim', claimIds: ['missing'] }] }), DeepSeekStageCSchema.parse(value.c), DeepSeekStageDSchema.parse(value.d))).toThrow('MULTI_STAGE_REFERENCE_INVALID')
  })

  it('expone cuatro operaciones independientes y una reserva total explícita', () => {
    expect(DEEPSEEK_ANALYSIS_STAGE_IDS).toEqual(['stage_a', 'stage_b', 'stage_c', 'stage_d'])
    expect(deepSeekMultiStageTotalBudget()).toBe(0.044)
  })

  it('reanuda desde C reutilizando A/B, sin repetir sus llamadas ni esconder schemas', async () => {
    const value = stages()
    class Client implements OpenAIResponsesClient {
      readonly requests: OpenAIResponseRequest[] = []
      private readonly responses: OpenAIResponseEnvelope[] = [
        value.a, value.b, value.c, value.d,
      ].map((output, index) => ({ id: `stage-${index + 1}`, status: 'completed' as const, output_text: JSON.stringify(output), usage: { input_tokens: 100, output_tokens: 20 } }))
      async create(request: OpenAIResponseRequest): Promise<OpenAIResponseEnvelope> {
        this.requests.push(request)
        const response = this.responses.shift()
        if (!response) throw new Error('Respuesta fixture agotada')
        return response
      }
    }
    const client = new Client()
    const engine = new DeepSeekMultiStageAnalysisEngine(new OpenAIIntelligenceEngine(client, {
      providerId: 'deepseek', model: 'deepseek-v4-flash', telemetryModel: 'deepseek-flash', simulation: false,
      maxOutputTokens: 4_000, timeoutMs: 90_000, currency: 'EUR',
    }))
    const durable = new Map<string, { output: unknown; usage: { providerId: string; model: string; inputTokens: number; outputTokens: number; estimatedCost: number; currency: 'EUR' | 'USD' } }>()
    await expect(engine.analyzeMultiStage(mission, dossier, new AbortController().signal, async (stage, operation) => {
      if (stage === 'stage_c') throw new Error('STOP_STAGE_C')
      const result = await operation()
      durable.set(stage, result)
      return result
    })).rejects.toThrow('STOP_STAGE_C')
    const analysis = await engine.analyzeMultiStage(mission, dossier, new AbortController().signal, async (stage, operation) => {
      const existing = durable.get(stage)
      if (existing) return existing
      const result = await operation()
      durable.set(stage, result)
      return result
    })
    expect(client.requests).toHaveLength(4)
    expect(client.requests[0].text.format.schema).toMatchObject({ properties: { claims: { type: 'array' } }, additionalProperties: false })
    expect(client.requests[1].text.format.schema).toMatchObject({ properties: { contradictions: { type: 'array' }, gaps: { type: 'array' } }, additionalProperties: false })
    expect(analysis.usage.providerRequestIds).toEqual(['stage-1', 'stage-2', 'stage-3', 'stage-4'])
  })
})
