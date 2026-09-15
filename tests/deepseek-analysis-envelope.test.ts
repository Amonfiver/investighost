import { describe, expect, it } from 'vitest'
import { zodTextFormat } from 'openai/helpers/zod'
import { z } from 'zod'
import {
  DEEPSEEK_ANALYSIS_ENVELOPE_INSTRUCTION,
  DeepSeekRoundAnalysisEnvelopeSchema,
  canonicalAnalysisFromDeepSeekEnvelope,
  parseDeepSeekCanonicalJson,
} from '@modules/real-pipeline/deepseek-analysis-envelope'
import {
  OpenAIIntelligenceEngine,
  type OpenAIResponseEnvelope,
  type OpenAIResponseRequest,
  type OpenAIResponsesClient,
} from '@modules/real-pipeline/openai-intelligence-engine'
import { inspectOpenAIResponseRequest } from '@modules/real-pipeline/openai-responses-payload'
import { OpenAIRoundAnalysisOutputSchema } from '@shared/openai-intelligence-contracts'
import type { RealResearchDossier, RealResearchMission } from '@shared/real-pipeline-contracts'

const timestamp = '2026-09-15T15:00:00.000Z'
const hash = 'a'.repeat(64)

function analysis(): Record<string, unknown> {
  return {
    claims: [{
      id: 'claim-walls', topic: 'heritage', statement: 'Morella conserva murallas.',
      evidenceIds: ['evidence-walls'], confidence: 0.9, suitableProfiles: ['adventure', 'student'],
    }],
    contradictions: ['Una fecha secundaria requiere contraste.'],
    coverage: { score: 0.72, sufficient: false, topics: [{ topic: 'access', required: true, coverage: 0.3, evidenceIds: [] }] },
    profileCoverage: [
      { profile: 'adventure', score: 0.5, sufficient: false, requirements: { routes: 1, specific_places: 1, access: 0.3, duration: 0.5, costs: 0.4, season: 0.5, risks: 0.5 }, warnings: ['Falta acceso'] },
      { profile: 'student', score: 0.9, sufficient: true, requirements: { history: 1, dates: 0.9, population: 0.8, monuments: 1, culture: 0.9, daily_life: 0.8 }, warnings: [] },
    ],
    gaps: [{ id: 'gap-access', topic: 'access', description: 'Falta frecuencia.', importance: 'high', requiredForProfiles: ['adventure'], resolvableWithResearch: true }],
    proposedQueries: [{ id: 'query-access', gapId: 'gap-access', query: 'Morella autobús frecuencia actual', rationale: 'Completar acceso.' }],
    decision: { action: 'continue_focused', nextRound: 2, reason: 'Falta acceso.', queries: [{ id: 'query-access', gapId: 'gap-access', query: 'Morella autobús frecuencia actual', rationale: 'Completar acceso.' }] },
  }
}

function mission(): RealResearchMission {
  return {
    requestId: 'request-morella', runId: 'run-morella', taskId: 'task-morella',
    destination: { canonicalId: 'destination-morella', name: 'Morella', countryCode: 'ES', type: 'locality' },
    language: 'es', profiles: [{ profile: 'adventure', enabled: true, targetWords: 1_000 }], depth: 'standard', round: 1,
    objectives: ['historia'], focusedQueries: [],
    limits: { maxRounds: 2, maxFocusedQueriesPerRound: 4, maxSources: 10, maxCharactersPerSource: 100_000, maxProviderCalls: 8, maxInputTokens: 40_000, maxOutputTokens: 12_000, taskBudgetEur: 1, batchBudgetEur: 2, dailyBudgetEur: 3 },
    createdAt: timestamp,
  }
}

function dossier(): RealResearchDossier {
  return {
    requestId: 'request-morella', runId: 'run-morella', taskId: 'task-morella', destinationId: 'destination-morella', rounds: [1],
    sources: [{ id: 'source-official', round: 1, url: 'https://example.test/morella', normalizedUrl: 'https://example.test/morella', title: 'Fuente', capturedAt: timestamp, contentHash: hash, score: 0.9, content: 'Murallas.' }],
    evidence: [{ id: 'evidence-walls', statement: 'Murallas.', sourceIds: ['source-official'], confidence: 0.9, contradiction: 'none', freshness: 'current' }], generatedAt: timestamp,
  }
}

class FakeResponsesClient implements OpenAIResponsesClient {
  readonly requests: OpenAIResponseRequest[] = []
  constructor(private readonly response: OpenAIResponseEnvelope) {}
  async create(request: OpenAIResponseRequest): Promise<OpenAIResponseEnvelope> {
    this.requests.push(request)
    return this.response
  }
}

function deepSeekEngine(client: OpenAIResponsesClient): OpenAIIntelligenceEngine {
  return new OpenAIIntelligenceEngine(client, {
    providerId: 'deepseek', model: 'deepseek-v4-flash', telemetryModel: 'deepseek-flash', simulation: false,
    maxOutputTokens: 12_000, timeoutMs: 90_000, currency: 'EUR',
    analysisResponseSchema: DeepSeekRoundAnalysisEnvelopeSchema,
    analysisResponseTransformer: canonicalAnalysisFromDeepSeekEnvelope,
    analysisInstruction: DEEPSEEK_ANALYSIS_ENVELOPE_INSTRUCTION,
  })
}

describe('envelope reducido para analysis DeepSeek, sin red', () => {
  it('reduce el schema remoto y mantiene el contrato canónico final', () => {
    const reduced = zodTextFormat(DeepSeekRoundAnalysisEnvelopeSchema, 'round_analysis').schema
    const canonical = zodTextFormat(OpenAIRoundAnalysisOutputSchema, 'round_analysis').schema
    const request = {
      model: 'deepseek-v4-flash', input: [{ role: 'system' as const, content: 'fixture' }, { role: 'user' as const, content: '{}' }],
      text: { format: { type: 'json_schema' as const, name: 'round_analysis', strict: true as const, schema: reduced as Record<string, unknown> } },
      max_output_tokens: 12_000, store: false as const,
    }

    expect(inspectOpenAIResponseRequest(request)).toEqual({ valid: true, issues: [] })
    expect(reduced).toMatchObject({
      type: 'object',
      properties: { canonicalJson: { type: 'string' } },
      required: ['canonicalJson'],
      additionalProperties: false,
    })
    expect(Buffer.byteLength(JSON.stringify(reduced))).toBeLessThan(Buffer.byteLength(JSON.stringify(canonical)) / 10)
    const transformed = canonicalAnalysisFromDeepSeekEnvelope({ canonicalJson: JSON.stringify(analysis()) })
    expect(transformed.success).toBe(true)
    if (transformed.success) expect(OpenAIRoundAnalysisOutputSchema.parse(transformed.data)).toEqual(transformed.data)
  })

  it('preserva claims, evidencia, gaps y contradicciones sin defaults semánticos', () => {
    const transformed = canonicalAnalysisFromDeepSeekEnvelope({ canonicalJson: JSON.stringify(analysis()) })
    expect(transformed.success).toBe(true)
    if (!transformed.success) return
    expect(transformed.data.claims[0].evidenceIds).toEqual(['evidence-walls'])
    expect(transformed.data.contradictions).toEqual(['Una fecha secundaria requiere contraste.'])
    expect(transformed.data.gaps[0].id).toBe('gap-access')
    expect(transformed.data.proposedQueries[0].gapId).toBe('gap-access')
  })

  it('falla cerrado cuando falta un campo canónico requerido dentro de un bloque', () => {
    const candidate = analysis()
    const claims = candidate.claims as Array<Record<string, unknown>>
    delete claims[0].evidenceIds
    expect(DeepSeekRoundAnalysisEnvelopeSchema.safeParse({ canonicalJson: JSON.stringify(candidate) }).success).toBe(true)
    expect(canonicalAnalysisFromDeepSeekEnvelope({ canonicalJson: JSON.stringify(candidate) }).success).toBe(false)
  })

  it('falla cerrado cuando el envelope queda incompleto', () => {
    const candidate = analysis()
    delete candidate.decision
    expect(canonicalAnalysisFromDeepSeekEnvelope({ canonicalJson: JSON.stringify(candidate) }).success).toBe(false)
  })

  it('falla cerrado si el JSON interno no es parseable', () => {
    expect(canonicalAnalysisFromDeepSeekEnvelope({ canonicalJson: '{' }).success).toBe(false)
  })

  it('reutiliza el envelope final con un schema local pequeño', () => {
    const simple = z.object({ name: z.string(), score: z.number().int(), tags: z.array(z.string()) }).strict()
    expect(parseDeepSeekCanonicalJson({ canonicalJson: '{"name":"Probe","score":7,"tags":["test"]}' }, simple))
      .toMatchObject({ success: true, data: { name: 'Probe', score: 7, tags: ['test'] } })
    expect(parseDeepSeekCanonicalJson({ canonicalJson: '{"name":"Probe"}' }, simple).success).toBe(false)
  })

  it('rechaza JSON inválido antes de transformar', async () => {
    const client = new FakeResponsesClient({ id: 'ds-invalid-json', status: 'completed', output_text: '{', usage: { input_tokens: 1, output_tokens: 1 } })
    await expect(deepSeekEngine(client).analyze(mission(), dossier(), new AbortController().signal))
      .rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })

  it('usa una sola subllamada auditable y solo acepta el resultado canónico', async () => {
    const client = new FakeResponsesClient({ id: 'ds-envelope-1', status: 'completed', output_text: JSON.stringify({ canonicalJson: JSON.stringify(analysis()) }), usage: { input_tokens: 100, output_tokens: 50 } })
    const result = await deepSeekEngine(client).analyze(mission(), dossier(), new AbortController().signal)

    expect(client.requests).toHaveLength(1)
    expect(client.requests[0].text.format.schema).toEqual(zodTextFormat(DeepSeekRoundAnalysisEnvelopeSchema, 'round_analysis').schema)
    expect(client.requests[0].input[1].content).toContain('canonicalJson')
    expect(result.usage.providerRequestIds).toEqual(['ds-envelope-1'])
    expect(result.masterKnowledge.claims[0].evidenceIds).toEqual(['evidence-walls'])
  })
})
