import { app } from 'electron'
import { execFile as execFileCallback } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import dotenv from 'dotenv'
import { zodTextFormat } from 'openai/helpers/zod'
import { pricingEntryAt } from '../src/shared/provider-pricing-catalog'
import { DeepSeekResponsesClient, deepSeekSdkClientFactory } from '../src/modules/real-pipeline/deepseek-responses-client'
import { DEEPSEEK_ANALYSIS_ENVELOPE_INSTRUCTION, DeepSeekRoundAnalysisEnvelopeSchema, canonicalAnalysisFromDeepSeekEnvelope } from '../src/modules/real-pipeline/deepseek-analysis-envelope'
import { DurableProbeCapture } from '../src/modules/real-pipeline/durable-probe-capture'
import { issueLiveProviderNetworkPermit } from '../src/modules/real-pipeline/live-provider-access'
import { OpenAIIntelligenceEngine } from '../src/modules/real-pipeline/openai-intelligence-engine'
import { REAL_EXECUTION_FEATURE_TOKEN } from '../src/modules/real-pipeline/real-pilot-gate'
import { getProviderCenterRuntime } from '../src/main/provider-center-runtime'

app.setName('Investighost')
dotenv.config({ path: '.env' })

const execFile = promisify(execFileCallback)
const pilotId = 'a8e4d6ad-ce09-46bd-81d9-bc316ae620a9'
const runId = 'ceb14fcc-8d70-43e1-af7e-619013ff324b'
const timeoutMs = 90_000
const maxOutputTokens = 12_000
const sourceCharacters = 24_000
type RecordValue = Record<string, unknown>

async function main(): Promise<void> {
  const capture = new DurableProbeCapture(captureFile())
  const [mission, source] = await readProbeInputs()
  const dossier = makeDossier(mission, source)
  const request = requestMeasurement(mission, dossier)
  await capture.begin('deepseek-analysis-envelope-v1', {
    status: 'preflight',
    cuenca: { pilotId, runId, sourceReadOnly: true, truncatedSourceCharacters: source.content.length },
    request,
  })
  const startedAt = Date.now()
  const raw: { response?: RecordValue } = {}
  try {
    const center = await getProviderCenterRuntime()
    const snapshot = center.snapshot()
    const deepseek = snapshot.providers.find(provider => provider.id === 'deepseek')
    const openai = snapshot.providers.find(provider => provider.id === 'openai')
    const tavily = snapshot.providers.find(provider => provider.id === 'tavily')
    await center.withCredential('deepseek', async () => undefined)
    if (!deepseek?.active || openai?.active || !tavily?.configured || !tavily?.active) {
      await capture.complete('failed', Date.now() - startedAt, {
        precheck: { deepseekActive: Boolean(deepseek?.active), openaiActive: Boolean(openai?.active), tavilyConfigured: Boolean(tavily?.configured), tavilyActive: Boolean(tavily?.active) },
        error: { code: 'PRECHECK_FAILED', message: 'La sonda exige DeepSeek activo, OpenAI inactivo y proveedores seguros disponibles.' },
      })
      return
    }
    const permit = issueLiveProviderNetworkPermit({
      featureToken: REAL_EXECUTION_FEATURE_TOKEN,
      providerCenter: snapshot,
      preflightStatus: 'ready_for_live_connectivity_check',
      taskAuthorized: true,
      budgetReserved: true,
      globalGuardAcquired: true,
      intelligenceProviderIds: ['deepseek'],
    })
    const analysis = await center.withCredential('deepseek', async credential => {
      const sdk = deepSeekSdkClientFactory(credential)
      const client = new DeepSeekResponsesClient(credential, permit, {
        clientFactory: () => ({ responses: { create: async (request: never, options: never) => {
          const received = await sdk.responses.create(request, options)
          raw.response = responseSummary(received as unknown as RecordValue)
          return received
        } } }),
      })
      const engine = new OpenAIIntelligenceEngine(client, {
        providerId: 'deepseek', model: 'deepseek-v4-flash', telemetryModel: 'deepseek-flash',
        maxOutputTokens, timeoutMs, currency: 'EUR', simulation: false,
        costForUsage: usage => costEur(usage.inputTokens, usage.cachedInputTokens, usage.outputTokens) ?? 0,
        analysisResponseSchema: DeepSeekRoundAnalysisEnvelopeSchema,
        analysisResponseTransformer: canonicalAnalysisFromDeepSeekEnvelope,
        analysisInstruction: DEEPSEEK_ANALYSIS_ENVELOPE_INSTRUCTION,
      })
      return engine.analyze(mission as never, dossier as never, new AbortController().signal)
    })
    await capture.complete('completed', Date.now() - startedAt, {
      request,
      response: {
        status: 'completed', remoteId: analysis.usage.providerRequestIds?.[0] ?? null,
        incompleteDetails: null, usage: analysis.usage, costEur: analysis.usage.estimatedCost,
        reasoningTokens: reasoningTokens(raw.response),
        analysisShape: {
          claims: analysis.masterKnowledge.claims.length,
          contradictions: analysis.masterKnowledge.contradictions.length,
          coverageTopics: analysis.coverage.topics.length,
          gaps: analysis.gaps.length,
          proposedQueries: analysis.proposedQueries.length,
          decision: analysis.decision.action,
        },
        schemaValidation: 'canonical_zod_pass',
      },
      rawResponse: raw.response,
    })
  } catch (error) {
    const summary = errorSummary(error)
    const code = String(summary.code ?? '')
    const status = code === 'INCOMPLETE' ? 'incomplete' : code === 'TIMEOUT' ? 'timeout' : 'failed'
    await capture.complete(status, Date.now() - startedAt, {
      request,
      error: summary,
      remoteId: stringValue(raw.response?.remoteId),
      providerUsage: failureUsage(error) ?? responseUsage(raw.response),
      costEur: responseCost(raw.response),
      rawResponse: raw.response,
      reasoningTokens: reasoningTokens(raw.response),
    })
  }
}

function captureFile(): string {
  const value = process.argv.find(argument => argument.startsWith('--capture-file='))?.slice('--capture-file='.length)
  if (!value) throw new Error('CAPTURE_FILE_REQUIRED')
  const root = path.resolve(process.cwd(), '.deepseek-probes')
  const resolved = path.resolve(process.cwd(), value)
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error('CAPTURE_FILE_OUTSIDE_PROBE_DIRECTORY')
  return resolved
}

async function readProbeInputs(): Promise<[RecordValue, RecordValue]> {
  const query = `select json_build_object('mission',(select payload from public.real_editorial_artifacts where pilot_id='${pilotId}' and run_id='${runId}' and artifact_kind='mission' and artifact_key='initial'),'source',(select payload from public.real_editorial_artifacts where pilot_id='${pilotId}' and run_id='${runId}' and artifact_kind='source_accepted' order by octet_length(payload::text) desc limit 1))::text`
  const { stdout } = await execFile('docker', ['exec', 'supabase_db_investighost', 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-c', query], { windowsHide: true, maxBuffer: 2_000_000 })
  const parsed = JSON.parse(stdout.trim()) as { mission: RecordValue; source: RecordValue }
  return [parsed.mission, { ...parsed.source, content: String(parsed.source.content).slice(0, sourceCharacters) }]
}

function makeDossier(mission: RecordValue, source: RecordValue): RecordValue {
  const destination = mission.destination as RecordValue
  return { requestId: mission.requestId, runId: mission.runId, taskId: mission.taskId, destinationId: destination.canonicalId, rounds: [1], sources: [source], evidence: [], generatedAt: mission.createdAt }
}

function requestMeasurement(mission: RecordValue, dossier: RecordValue): RecordValue {
  const instruction = 'Analiza únicamente el expediente recibido. No navegues ni presupongas fuentes externas. No propongas más investigación para elevar solo el porcentaje de cobertura; una query debe resolver un gap material concreto y preservar una redacción prudente por perfil.'
  const system = ['Investighost · prompt real-editorial-v1.', 'Trabaja solo con el JSON proporcionado.', 'No uses navegación web, herramientas externas ni conocimientos no respaldados por el expediente.'].join(' ')
  const user = JSON.stringify({ operation: 'round_analysis', mission, dossier, instruction })
  const schema = zodTextFormat(DeepSeekRoundAnalysisEnvelopeSchema, 'round_analysis').schema
  return {
    provider: 'deepseek', logicalModel: 'deepseek-flash', apiModel: 'deepseek-v4-flash', timeoutMs, maxOutputTokens,
    reasoning: 'omitted', temperature: 'omitted', topP: 'omitted', textFormat: 'json_schema', strict: true, schemaMode: 'deepseek_analysis_envelope_v1', store: false, tools: [], sdkRetries: 0,
    systemChars: system.length, systemBytes: Buffer.byteLength(system), userChars: user.length, userBytes: Buffer.byteLength(user),
    totalInputChars: system.length + user.length, totalInputBytes: Buffer.byteLength(system) + Buffer.byteLength(user),
    estimatedTokensAt4Chars: Math.ceil((system.length + user.length) / 4), schemaBytes: Buffer.byteLength(JSON.stringify(schema)),
  }
}

function responseSummary(response: RecordValue): RecordValue {
  const output = Array.isArray(response.output) ? response.output.map(item => {
    const value = isRecord(item) ? item : {}
    return { type: stringValue(value.type), status: stringValue(value.status), contentTypes: Array.isArray(value.content) ? value.content.map(content => isRecord(content) ? stringValue(content.type) ?? 'unknown' : 'unknown') : [] }
  }) : []
  return {
    remoteId: stringValue(response.id),
    status: stringValue(response.status), incompleteDetails: isRecord(response.incomplete_details) ? response.incomplete_details : null,
    error: isRecord(response.error) ? sanitizeRecord(response.error) : null, output,
    outputText: sanitizeOutput(stringValue(response.output_text)),
    outputTextChars: stringValue(response.output_text)?.length ?? 0,
    outputJsonValid: isJson(stringValue(response.output_text)),
    usage: isRecord(response.usage) ? response.usage : null,
  }
}

function reasoningTokens(raw: RecordValue | undefined): number | undefined {
  const usage = raw && isRecord(raw.usage) ? raw.usage : undefined
  const details = usage && isRecord(usage.output_tokens_details) ? usage.output_tokens_details : undefined
  return details && typeof details.reasoning_tokens === 'number' ? details.reasoning_tokens : undefined
}

function failureUsage(error: unknown): RecordValue | undefined {
  return isRecord(error) && isRecord(error.providerUsage) ? error.providerUsage : undefined
}

function responseUsage(raw: RecordValue | undefined): RecordValue | undefined {
  const usage = raw && isRecord(raw.usage) ? raw.usage : undefined
  const remoteId = raw && stringValue(raw.remoteId)
  if (!usage) return undefined
  return {
    providerRequestIds: remoteId ? [remoteId] : [],
    inputTokens: numberValue(usage.input_tokens) ?? 0,
    outputTokens: numberValue(usage.output_tokens) ?? 0,
    cachedInputTokens: isRecord(usage.input_tokens_details)
      ? numberValue(usage.input_tokens_details.cached_tokens) ?? 0
      : 0,
  }
}

function responseCost(raw: RecordValue | undefined): number | undefined {
  const usage = raw && isRecord(raw.usage) ? raw.usage : undefined
  if (!usage) return undefined
  const input = numberValue(usage.input_tokens)
  const output = numberValue(usage.output_tokens)
  if (input === undefined || output === undefined) return undefined
  const cached = isRecord(usage.input_tokens_details)
    ? numberValue(usage.input_tokens_details.cached_tokens) ?? 0
    : 0
  return costEur(input, cached, output) ?? undefined
}

function errorSummary(error: unknown): RecordValue {
  const value = isRecord(error) ? error : {}
  const remote = isRecord(value.remoteError) ? value.remoteError : {}
  return {
    name: error instanceof Error ? error.name : undefined, code: stringValue(value.code), type: stringValue(remote.type) ?? stringValue(value.type),
    status: typeof remote.status === 'number' ? remote.status : typeof value.status === 'number' ? value.status : undefined,
    remoteCode: stringValue(remote.code), param: stringValue(remote.param) ?? stringValue(value.param),
    message: sanitize(stringValue(remote.message) ?? (error instanceof Error ? error.message : undefined)),
  }
}

function costEur(inputTokens: number, cachedInputTokens: number, outputTokens: number): number | null {
  const tariff = pricingEntryAt('deepseek', 'deepseek-flash', new Date())
  if (!tariff) return null
  const cached = Math.min(inputTokens, cachedInputTokens)
  return (inputTokens - cached) * (tariff.inputPerMillion ?? 0) / 1_000_000 + cached * (tariff.cachedInputPerMillion ?? 0) / 1_000_000 + outputTokens * (tariff.outputPerMillion ?? 0) / 1_000_000
}

function sanitizeRecord(value: RecordValue): RecordValue {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, typeof item === 'string' ? sanitize(item) : typeof item === 'number' || typeof item === 'boolean' ? item : undefined]))
}

function sanitize(value: string | undefined): string | undefined {
  return value?.replace(/\b(?:sk|tvly)-[A-Za-z0-9_-]+\b/gi, '[redacted]').slice(0, 500)
}

function sanitizeOutput(value: string | undefined): string | undefined {
  if (!value) return undefined
  const sanitized = value.replace(/\b(?:sk|tvly)-[A-Za-z0-9_-]+\b/gi, '[redacted]')
  if (sanitized.length <= 48_000) return sanitized
  return `${sanitized.slice(0, 24_000)}\n...[truncated locally; original chars=${sanitized.length}]...\n${sanitized.slice(-24_000)}`
}
function isJson(value: string | undefined): boolean {
  if (!value) return false
  try { JSON.parse(value); return true } catch { return false }
}
function stringValue(value: unknown): string | undefined { return typeof value === 'string' ? value : undefined }
function numberValue(value: unknown): number | undefined { return typeof value === 'number' ? value : undefined }
function isRecord(value: unknown): value is RecordValue { return Boolean(value) && typeof value === 'object' && !Array.isArray(value) }

app.whenReady().then(main).catch(async error => {
  process.stderr.write(`DEEPSEEK_DURABLE_PROBE_FATAL=${error instanceof Error ? error.message : 'unknown'}\n`)
}).finally(() => app.quit())
