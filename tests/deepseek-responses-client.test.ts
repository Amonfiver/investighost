import { describe, expect, it } from 'vitest'
import { DeepSeekResponsesClient, DEEPSEEK_RESPONSES_BASE_URL } from '@modules/real-pipeline/deepseek-responses-client'
import { issueLiveProviderNetworkPermit } from '@modules/real-pipeline/live-provider-access'
import { REAL_EXECUTION_FEATURE_TOKEN } from '@modules/real-pipeline/real-pilot-gate'

const credential = 'synthetic-deepseek-secret'

function permit() {
  return issueLiveProviderNetworkPermit({
    featureToken: REAL_EXECUTION_FEATURE_TOKEN,
    preflightStatus: 'ready_for_live_connectivity_check',
    taskAuthorized: true,
    budgetReserved: true,
    globalGuardAcquired: true,
    providerCenter: {
      secureStorageAvailable: true, simulationOnly: true, realClientsAvailable: true,
      externalCallsAllowed: false, pricingCatalogVersion: '2026-09-14.2',
      providers: [
        { id: 'tavily', displayName: 'Tavily', category: 'research_tool', configured: true, active: true, selectedModel: 'search-and-extract', availableModels: ['search-and-extract'], tariffStatus: 'current', tariffSummary: 'fixture', connectionState: 'not_tested' },
        { id: 'openai', displayName: 'OpenAI', category: 'intelligence_engine', configured: true, active: true, selectedModel: 'gpt-5.6-luna', availableModels: ['gpt-5.6-luna'], tariffStatus: 'current', tariffSummary: 'fixture', connectionState: 'not_tested' },
      ],
    },
  })
}

describe('adapter DeepSeek Responses', () => {
  it('normaliza JSON Schema, cache usage y no revela la credencial', async () => {
    const calls: unknown[] = []
    const client = new DeepSeekResponsesClient(credential, permit(), {
      clientFactory: supplied => ({ responses: { create: async (request: unknown) => {
        expect(supplied).toBe(credential)
        calls.push(request)
        return { id: 'ds-response-1', status: 'completed', error: null, output: [], output_text: '{"ok":true}', usage: { input_tokens: 10, output_tokens: 2, input_tokens_details: { cached_tokens: 4 } } }
      } } }),
    })
    const result = await client.create({
      model: 'deepseek-v4-flash', input: [{ role: 'system', content: 'fixture' }, { role: 'user', content: '{}' }],
      text: { format: { type: 'json_schema', name: 'fixture', strict: true, schema: { type: 'object', properties: {}, required: [], additionalProperties: false } } },
      max_output_tokens: 32, store: false,
    }, new AbortController().signal)
    expect(DEEPSEEK_RESPONSES_BASE_URL).toBe('https://api.deepseek.com')
    expect(calls).toHaveLength(1)
    expect(result).toMatchObject({ id: 'ds-response-1', usage: { input_tokens: 10, output_tokens: 2, input_tokens_details: { cached_tokens: 4 } } })
    expect(JSON.stringify({ calls, result })).not.toContain(credential)
  })

  it('proyecta incomplete, el motivo, texto parcial y uso sin cambiarlo por un error local', async () => {
    const client = new DeepSeekResponsesClient(credential, permit(), {
      clientFactory: () => ({ responses: { create: async () => ({
        id: 'ds-incomplete-1',
        status: 'incomplete',
        error: null,
        incomplete_details: { reason: 'max_output_tokens' },
        output: [],
        output_text: '{"claims":[',
        usage: { input_tokens: 2_048, output_tokens: 12_000 },
      }) } }),
    })

    const result = await client.create({
      model: 'deepseek-v4-flash',
      input: [{ role: 'system', content: 'fixture' }, { role: 'user', content: '{}' }],
      text: { format: { type: 'json_schema', name: 'fixture', strict: true, schema: { type: 'object', properties: {}, required: [], additionalProperties: false } } },
      max_output_tokens: 12_000,
      store: false,
    }, new AbortController().signal)

    expect(result).toEqual({
      id: 'ds-incomplete-1',
      status: 'incomplete',
      output_text: '{"claims":[',
      incomplete_details: { reason: 'max_output_tokens' },
      usage: {
        input_tokens: 2_048,
        output_tokens: 12_000,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens_details: { reasoning_tokens: 0 },
      },
    })
  })
})
