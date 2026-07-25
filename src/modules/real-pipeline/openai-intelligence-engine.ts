import { zodTextFormat } from 'openai/helpers/zod'
import type { ZodTypeAny } from 'zod'
import {
  OpenAIDraftOutputSchema,
  OpenAIReviewOutputSchema,
  OpenAIRoundAnalysisOutputSchema,
} from '@shared/openai-intelligence-contracts'
import {
  RealMasterKnowledgeSchema,
  RealResearchDossierSchema,
  RealResearchMissionSchema,
  type RealMasterKnowledge,
  type RealResearchDossier,
  type RealResearchMission,
} from '@shared/real-pipeline-contracts'
import type {
  IntelligenceDraft,
  IntelligenceEngine,
  IntelligenceReview,
  IntelligenceRoundAnalysis,
} from './ports'

export interface OpenAIResponseRequest {
  model: string
  input: Array<{
    role: 'system' | 'user'
    content: string
  }>
  text: {
    format: {
      type: 'json_schema'
      name: string
      strict: true
      schema: Record<string, unknown>
    }
  }
  max_output_tokens: number
  store: false
}

export interface OpenAIResponseEnvelope {
  id: string
  status: 'completed' | 'incomplete'
  output_text?: string
  refusal?: string
  incomplete_details?: { reason: string }
  usage: {
    input_tokens: number
    output_tokens: number
    input_tokens_details?: {
      cached_tokens: number
    }
  }
}

export interface OpenAIResponsesClient {
  create(request: OpenAIResponseRequest, signal: AbortSignal): Promise<OpenAIResponseEnvelope>
}

export interface OpenAIIntelligenceConfiguration {
  model: string
  promptVersion: string
  schemaVersion: string
  maxOutputTokens: number
  timeoutMs: number
  inputCostPerMillion: number
  cachedInputCostPerMillion: number
  outputCostPerMillion: number
  currency: 'EUR' | 'USD'
  simulation: boolean
}

const defaultConfiguration: OpenAIIntelligenceConfiguration = {
  model: 'structured-responses',
  promptVersion: 'real-editorial-v1',
  schemaVersion: 'real-intelligence-v1',
  maxOutputTokens: 12_000,
  timeoutMs: 30_000,
  inputCostPerMillion: 0,
  cachedInputCostPerMillion: 0,
  outputCostPerMillion: 0,
  currency: 'EUR',
  simulation: true,
}

export type OpenAIIntelligenceErrorCode =
  | 'REFUSAL'
  | 'INCOMPLETE'
  | 'INVALID_RESPONSE'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'PROVIDER_ERROR'

export class OpenAIIntelligenceError extends Error {
  constructor(readonly code: OpenAIIntelligenceErrorCode, message: string) {
    super(message)
    this.name = 'OpenAIIntelligenceError'
  }
}

export class OpenAIIntelligenceEngine implements IntelligenceEngine {
  readonly id = 'openai'
  readonly simulation: boolean
  readonly model: string
  private readonly configuration: OpenAIIntelligenceConfiguration

  constructor(
    private readonly client: OpenAIResponsesClient,
    configuration: Partial<OpenAIIntelligenceConfiguration> = {},
  ) {
    this.configuration = { ...defaultConfiguration, ...configuration }
    this.model = this.configuration.model
    this.simulation = this.configuration.simulation
  }

  async analyze(
    missionCandidate: RealResearchMission,
    dossierCandidate: RealResearchDossier,
    signal: AbortSignal,
  ): Promise<IntelligenceRoundAnalysis> {
    const mission = RealResearchMissionSchema.parse(missionCandidate)
    const dossier = RealResearchDossierSchema.parse(dossierCandidate)
    const response = await this.call('round_analysis', {
      mission,
      dossier,
      instruction: 'Analiza únicamente el expediente recibido. No navegues ni presupongas fuentes externas.',
    }, OpenAIRoundAnalysisOutputSchema, signal)
    const output = parseStructuredOutput(response, OpenAIRoundAnalysisOutputSchema)
    if (mission.round === 2 && output.decision.action === 'continue_focused') {
      throw new OpenAIIntelligenceError('INVALID_RESPONSE', 'El motor intentó proponer una tercera investigación')
    }
    return {
      masterKnowledge: RealMasterKnowledgeSchema.parse({
        requestId: mission.requestId,
        destinationId: mission.destination.canonicalId,
        revision: mission.round,
        claims: output.claims,
        contradictions: output.contradictions,
        generatedAt: mission.createdAt,
      }),
      coverage: output.coverage,
      proposedQueries: output.proposedQueries,
      gaps: output.gaps,
      decision: output.decision,
      usage: this.usage(response),
    }
  }

  async draft(
    missionCandidate: RealResearchMission,
    knowledgeCandidate: RealMasterKnowledge,
    signal: AbortSignal,
  ): Promise<IntelligenceDraft[]> {
    const mission = RealResearchMissionSchema.parse(missionCandidate)
    const knowledge = RealMasterKnowledgeSchema.parse(knowledgeCandidate)
    const drafts: IntelligenceDraft[] = []
    for (const profile of mission.profiles.filter(item => item.enabled)) {
      const response = await this.call(`draft_${profile.profile}`, {
        profile: profile.profile,
        targetWords: profile.targetWords,
        mission: {
          destination: mission.destination,
          language: mission.language,
          depth: mission.depth,
        },
        masterKnowledge: knowledge,
        instruction: roleInstruction(profile.profile, profile.targetWords, profile.depth ?? mission.depth),
      }, OpenAIDraftOutputSchema, signal)
      const output = parseStructuredOutput(response, OpenAIDraftOutputSchema)
      if (output.profile !== profile.profile || output.coverage.profile !== profile.profile) {
        throw new OpenAIIntelligenceError('INVALID_RESPONSE', 'El borrador no corresponde al perfil solicitado')
      }
      drafts.push({
        profile: output.profile,
        title: output.title,
        content: output.content,
        approximateWordCount: output.approximateWordCount,
        promptVersion: this.configuration.promptVersion,
        schemaVersion: this.configuration.schemaVersion,
        usage: this.usage(response),
      })
    }
    return drafts
  }

  async review(
    missionCandidate: RealResearchMission,
    knowledgeCandidate: RealMasterKnowledge,
    drafts: IntelligenceDraft[],
    signal: AbortSignal,
  ): Promise<IntelligenceReview> {
    const mission = RealResearchMissionSchema.parse(missionCandidate)
    const knowledge = RealMasterKnowledgeSchema.parse(knowledgeCandidate)
    const response = await this.call('final_review', {
      profiles: mission.profiles.filter(item => item.enabled),
      masterKnowledge: knowledge,
      drafts: drafts.map(({ profile, title, content, approximateWordCount }) => ({
        profile,
        title,
        content,
        approximateWordCount,
      })),
      instruction: 'Revisa fidelidad al conocimiento maestro, diferenciación de roles y suficiencia.',
    }, OpenAIReviewOutputSchema, signal)
    const output = parseStructuredOutput(response, OpenAIReviewOutputSchema)
    return {
      outcome: output.outcome,
      issues: output.issues,
      promptVersion: this.configuration.promptVersion,
      schemaVersion: this.configuration.schemaVersion,
      usage: this.usage(response),
    }
  }

  private async call(
    operation: string,
    payload: Record<string, unknown>,
    outputSchema: ZodTypeAny,
    signal: AbortSignal,
  ): Promise<OpenAIResponseEnvelope> {
    const structuredFormat = zodTextFormat(outputSchema, operation)
    const request: OpenAIResponseRequest = {
      model: this.configuration.model,
      input: [
        {
          role: 'system',
          content: [
            `Investighost · prompt ${this.configuration.promptVersion}.`,
            'Trabaja solo con el JSON proporcionado.',
            'No uses navegación web, herramientas externas ni conocimientos no respaldados por el expediente.',
          ].join(' '),
        },
        { role: 'user', content: JSON.stringify({ operation, ...payload }) },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: structuredFormat.name,
          strict: true,
          schema: structuredFormat.schema as Record<string, unknown>,
        },
      },
      max_output_tokens: this.configuration.maxOutputTokens,
      store: false,
    }
    let response: OpenAIResponseEnvelope
    try {
      response = await withOpenAITimeout(
        operationSignal => this.client.create(request, operationSignal),
        this.configuration.timeoutMs,
        signal,
      )
    } catch (error) {
      if (error instanceof OpenAIIntelligenceError) throw error
      throw new OpenAIIntelligenceError('PROVIDER_ERROR', 'El motor de inteligencia devolvió un fallo')
    }
    if (response.refusal) {
      throw new OpenAIIntelligenceError('REFUSAL', 'El motor rechazó la salida estructurada')
    }
    if (response.status === 'incomplete') {
      throw new OpenAIIntelligenceError(
        'INCOMPLETE',
        `La respuesta quedó incompleta (${response.incomplete_details?.reason ?? 'sin razón'})`,
      )
    }
    if (!response.output_text) {
      throw new OpenAIIntelligenceError('INVALID_RESPONSE', 'La respuesta no contiene salida estructurada')
    }
    return response
  }

  private usage(response: OpenAIResponseEnvelope) {
    const inputTokens = response.usage.input_tokens
    const outputTokens = response.usage.output_tokens
    const cachedInputTokens = response.usage.input_tokens_details?.cached_tokens ?? 0
    const uncachedInputTokens = Math.max(0, inputTokens - cachedInputTokens)
    const estimatedCost = uncachedInputTokens * this.configuration.inputCostPerMillion / 1_000_000
      + cachedInputTokens * this.configuration.cachedInputCostPerMillion / 1_000_000
      + outputTokens * this.configuration.outputCostPerMillion / 1_000_000
    return { inputTokens, outputTokens, estimatedCost, currency: this.configuration.currency }
  }
}

function parseStructuredOutput<T>(
  response: OpenAIResponseEnvelope,
  schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } },
): T {
  let decoded: unknown
  try {
    decoded = JSON.parse(response.output_text ?? '')
  } catch {
    throw new OpenAIIntelligenceError('INVALID_RESPONSE', 'La salida estructurada no es JSON válido')
  }
  const parsed = schema.safeParse(decoded)
  if (!parsed.success) {
    throw new OpenAIIntelligenceError('INVALID_RESPONSE', 'La salida no cumple el esquema estricto')
  }
  return parsed.data
}

async function withOpenAITimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  parentSignal: AbortSignal,
): Promise<T> {
  if (parentSignal.aborted) throw new OpenAIIntelligenceError('CANCELLED', 'La operación fue cancelada')
  const controller = new AbortController()
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  let cancellationListener: (() => void) | undefined
  try {
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort()
        reject(new OpenAIIntelligenceError('TIMEOUT', `OpenAI superó ${timeoutMs} ms`))
      }, timeoutMs)
    })
    const cancellation = new Promise<never>((_, reject) => {
      cancellationListener = () => {
        controller.abort()
        reject(new OpenAIIntelligenceError('CANCELLED', 'La operación fue cancelada'))
      }
      parentSignal.addEventListener('abort', cancellationListener, { once: true })
    })
    return await Promise.race([operation(controller.signal), timeout, cancellation])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
    if (cancellationListener) parentSignal.removeEventListener('abort', cancellationListener)
  }
}

function roleInstruction(
  profile: 'adventure' | 'student',
  targetWords: number,
  depth: 'standard' | 'deep',
): string {
  const role = profile === 'adventure'
    ? 'Escribe como aventurero experimentado: rutas, lugares, accesos, duración, costes, temporada y riesgos.'
    : 'Escribe como profesor cercano: historia, fechas, población, monumentos, cultura y vida cotidiana.'
  return `${role} Objetivo aproximado: ${targetWords} palabras; profundidad ${depth}. No rellenes: si falta evidencia, adviértelo.`
}
