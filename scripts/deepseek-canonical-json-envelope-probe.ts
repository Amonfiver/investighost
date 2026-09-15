import { app } from 'electron'
import path from 'node:path'
import dotenv from 'dotenv'
import { zodTextFormat } from 'openai/helpers/zod'
import { z } from 'zod'
import { DeepSeekResponsesClient, deepSeekSdkClientFactory } from '../src/modules/real-pipeline/deepseek-responses-client'
import { DeepSeekRoundAnalysisEnvelopeSchema, parseDeepSeekCanonicalJson } from '../src/modules/real-pipeline/deepseek-analysis-envelope'
import { DurableProbeCapture } from '../src/modules/real-pipeline/durable-probe-capture'
import { issueLiveProviderNetworkPermit } from '../src/modules/real-pipeline/live-provider-access'
import { REAL_EXECUTION_FEATURE_TOKEN } from '../src/modules/real-pipeline/real-pilot-gate'
import { pricingEntryAt } from '../src/shared/provider-pricing-catalog'
import { getProviderCenterRuntime } from '../src/main/provider-center-runtime'

app.setName('Investighost')
dotenv.config({ path: '.env' })

const timeoutMs = 30_000
const maxOutputTokens = 256
const InnerProbeSchema = z.object({
  name: z.string(),
  score: z.number().int(),
  tags: z.array(z.string()),
}).strict()
type RecordValue = Record<string, unknown>

async function main(): Promise<void> {
  const capture = new DurableProbeCapture(captureFile())
  const structured = zodTextFormat(DeepSeekRoundAnalysisEnvelopeSchema, 'canonical_json_envelope')
  const request = {
    model: 'deepseek-v4-flash',
    input: [
      { role: 'system' as const, content: 'Devuelve exclusivamente JSON conforme al schema.' },
      { role: 'user' as const, content: 'En canonicalJson devuelve el JSON serializado {"name":"Destino de prueba","score":7,"tags":["probe"]}. No añadas campos.' },
    ],
    text: { format: { type: 'json_schema' as const, name: structured.name, strict: true as const, schema: structured.schema as Record<string, unknown> } },
    max_output_tokens: maxOutputTokens,
    store: false as const,
  }
  await capture.begin('deepseek-canonical-json-envelope-v1', {
    request: {
      provider: 'deepseek', logicalModel: 'deepseek-flash', apiModel: request.model,
      timeoutMs, maxOutputTokens, reasoning: 'omitted', temperature: 'omitted', topP: 'omitted',
      textFormat: 'json_schema', strict: true, store: false, tools: [], sdkRetries: 0,
      schema: structured.schema,
      inputChars: request.input.reduce((total, item) => total + item.content.length, 0),
    },
  })
  const startedAt = Date.now()
  const raw: { response?: RecordValue } = {}
  try {
    const center = await getProviderCenterRuntime()
    const snapshot = center.snapshot()
    const deepseek = snapshot.providers.find(provider => provider.id === 'deepseek')
    const openai = snapshot.providers.find(provider => provider.id === 'openai')
    await center.withCredential('deepseek', async () => undefined)
    if (!deepseek?.active || openai?.active) {
      await capture.complete('failed', Date.now() - startedAt, {
        error: { code: 'PRECHECK_FAILED', message: 'DeepSeek debe estar activo y OpenAI inactivo.' },
      })
      return
    }
    const permit = issueLiveProviderNetworkPermit({
      featureToken: REAL_EXECUTION_FEATURE_TOKEN, providerCenter: snapshot,
      preflightStatus: 'ready_for_live_connectivity_check', taskAuthorized: true,
      budgetReserved: true, globalGuardAcquired: true, intelligenceProviderIds: ['deepseek'],
    })
    const response = await center.withCredential('deepseek', async credential => {
      const sdk = deepSeekSdkClientFactory(credential)
      const client = new DeepSeekResponsesClient(credential, permit, {
        clientFactory: () => ({ responses: { create: async (payload: never, options: never) => {
          const received = await sdk.responses.create(payload, options)
          raw.response = summarizeResponse(received as unknown as RecordValue)
          return received
        } } }),
      })
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try { return await client.create(request, controller.signal) } finally { clearTimeout(timer) }
    })
    if (response.status === 'incomplete') {
      await capture.complete('incomplete', Date.now() - startedAt, responsePayload(response, raw.response, {
        incompleteReason: response.incomplete_details?.reason ?? 'unknown',
      }))
      return
    }
    const outerJson = tryJson(response.output_text)
    const envelope = DeepSeekRoundAnalysisEnvelopeSchema.safeParse(outerJson.value)
    const inner = parseDeepSeekCanonicalJson(outerJson.value, InnerProbeSchema)
    const passed = outerJson.valid && envelope.success && inner.success
    await capture.complete(passed ? 'completed' : 'failed', Date.now() - startedAt, responsePayload(response, raw.response, {
      envelopeValidation: envelope.success ? 'pass' : 'fail',
      innerJsonValidation: inner.success ? 'pass' : 'fail',
      outputText: sanitize(response.output_text),
      innerValue: inner.success ? inner.data : undefined,
      error: passed ? undefined : { code: envelope.success ? 'INNER_SCHEMA_INVALID' : 'ENVELOPE_INVALID' },
    }))
  } catch (error) {
    const code = codeOf(error)
    await capture.complete(code === 'TIMEOUT' ? 'timeout' : 'failed', Date.now() - startedAt, {
      error: errorSummary(error), rawResponse: raw.response, costEur: costFromRaw(raw.response),
      usage: rawUsage(raw.response), reasoningTokens: reasoningTokens(raw.response),
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

function responsePayload(response: { id: string; usage: { input_tokens: number; output_tokens: number; input_tokens_details?: { cached_tokens: number } }; output_text?: string }, raw: RecordValue | undefined, extra: RecordValue): RecordValue {
  const cached = response.usage.input_tokens_details?.cached_tokens ?? 0
  return {
    status: 'completed', remoteId: response.id, incompleteReason: null,
    usage: { inputTokens: response.usage.input_tokens, cachedInputTokens: cached, outputTokens: response.usage.output_tokens },
    reasoningTokens: reasoningTokens(raw), costEur: costEur(response.usage.input_tokens, cached, response.usage.output_tokens), rawResponse: raw,
    ...extra,
  }
}

function summarizeResponse(response: RecordValue): RecordValue {
  return {
    remoteId: stringValue(response.id), status: stringValue(response.status),
    incompleteDetails: isRecord(response.incomplete_details) ? response.incomplete_details : null,
    outputText: sanitize(stringValue(response.output_text)),
    usage: isRecord(response.usage) ? response.usage : null,
  }
}

function rawUsage(raw: RecordValue | undefined): RecordValue | undefined {
  return raw && isRecord(raw.usage) ? raw.usage : undefined
}
function reasoningTokens(raw: RecordValue | undefined): number | undefined {
  const usage = rawUsage(raw)
  const details = usage && isRecord(usage.output_tokens_details) ? usage.output_tokens_details : undefined
  return details && typeof details.reasoning_tokens === 'number' ? details.reasoning_tokens : undefined
}
function costFromRaw(raw: RecordValue | undefined): number | undefined {
  const usage = rawUsage(raw)
  if (!usage) return undefined
  const input = numberValue(usage.input_tokens); const output = numberValue(usage.output_tokens)
  if (input === undefined || output === undefined) return undefined
  const cached = isRecord(usage.input_tokens_details) ? numberValue(usage.input_tokens_details.cached_tokens) ?? 0 : 0
  return costEur(input, cached, output)
}
function costEur(input: number, cached: number, output: number): number | undefined {
  const tariff = pricingEntryAt('deepseek', 'deepseek-flash', new Date())
  if (!tariff) return undefined
  const reusable = Math.min(input, cached)
  return (input - reusable) * (tariff.inputPerMillion ?? 0) / 1_000_000
    + reusable * (tariff.cachedInputPerMillion ?? 0) / 1_000_000
    + output * (tariff.outputPerMillion ?? 0) / 1_000_000
}
function tryJson(value: string | undefined): { valid: boolean; value: unknown } {
  try { return { valid: true, value: JSON.parse(value ?? '') } } catch { return { valid: false, value: undefined } }
}
function errorSummary(error: unknown): RecordValue {
  const value = isRecord(error) ? error : {}; const remote = isRecord(value.remoteError) ? value.remoteError : {}
  return { name: error instanceof Error ? error.name : undefined, code: stringValue(value.code), type: stringValue(remote.type), status: numberValue(remote.status), remoteCode: stringValue(remote.code), param: stringValue(remote.param), message: sanitize(stringValue(remote.message) ?? (error instanceof Error ? error.message : undefined)) }
}
function codeOf(error: unknown): string | undefined { return isRecord(error) ? stringValue(error.code) : undefined }
function sanitize(value: string | undefined): string | undefined { return value?.replace(/\b(?:sk|tvly)-[A-Za-z0-9_-]+\b/gi, '[redacted]').slice(0, 8_000) }
function stringValue(value: unknown): string | undefined { return typeof value === 'string' ? value : undefined }
function numberValue(value: unknown): number | undefined { return typeof value === 'number' ? value : undefined }
function isRecord(value: unknown): value is RecordValue { return Boolean(value) && typeof value === 'object' && !Array.isArray(value) }

app.whenReady().then(main).catch(error => {
  process.stderr.write(`DEEPSEEK_CANONICAL_JSON_ENVELOPE_PROBE_FATAL=${error instanceof Error ? error.message : 'unknown'}\n`)
}).finally(() => app.quit())
