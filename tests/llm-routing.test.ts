import { describe, expect, it } from 'vitest'
import {
  apiModelFor,
  readRealLlmRouting,
} from '@modules/real-pipeline/llm-routing'
import { INITIAL_PROVIDER_CATALOG } from '@modules/real-pipeline/provider-center'
import {
  deepSeekPricingBand,
  pricingEntryAt,
} from '@shared/provider-pricing-catalog'

describe('routing LLM configurable', () => {
  it('usa DeepSeek Flash como default lógico y el id Responses documentado', () => {
    const routing = readRealLlmRouting({})
    expect(routing.default).toMatchObject({
      providerId: 'deepseek', model: 'deepseek-flash', apiModel: 'deepseek-v4-flash',
    })
    expect(apiModelFor('deepseek', 'deepseek-flash')).toBe('deepseek-v4-flash')
  })

  it('registra DeepSeek en el Centro de proveedores con base URL oficial', () => {
    expect(INITIAL_PROVIDER_CATALOG).toContainEqual(expect.objectContaining({
      id: 'deepseek', category: 'intelligence_engine', baseUrl: 'https://api.deepseek.com',
      defaultModel: 'deepseek-flash',
    }))
  })

  it('permite DeepSeek solo para analysis y OpenAI para los borradores y review', () => {
    const routing = readRealLlmRouting({
      INVESTIGHOST_LLM_DEFAULT_PROVIDER: 'openai',
      INVESTIGHOST_LLM_DEFAULT_MODEL: 'gpt-5.6-luna',
      INVESTIGHOST_LLM_ANALYSIS_PROVIDER: 'deepseek',
      INVESTIGHOST_LLM_ANALYSIS_MODEL: 'deepseek-flash',
      INVESTIGHOST_LLM_DRAFT_ADVENTURE_PROVIDER: 'deepseek',
      INVESTIGHOST_LLM_DRAFT_ADVENTURE_MODEL: 'deepseek-flash',
    })
    expect(routing.routes.analysis.providerId).toBe('deepseek')
    expect(routing.routes.draft_adventure.providerId).toBe('deepseek')
    expect(routing.routes.draft_student).toMatchObject({ providerId: 'openai', model: 'gpt-5.6-luna' })
    expect(routing.routes.review).toMatchObject({ providerId: 'openai', model: 'gpt-5.6-luna' })
  })

  it('conserva los parámetros opcionales de una ruta para validación del adapter', () => {
    expect(() => readRealLlmRouting({
      INVESTIGHOST_LLM_DEFAULT_TEMPERATURE: '0.2',
      INVESTIGHOST_LLM_DEFAULT_TOP_P: '0.9',
    })).not.toThrow()
  })

  it('envía reasoning none únicamente cuando la ruta DeepSeek lo pide explícitamente', () => {
    const omitted = readRealLlmRouting({})
    const explicit = readRealLlmRouting({ INVESTIGHOST_LLM_ANALYSIS_REASONING_EFFORT: 'none' })

    expect(omitted.routes.analysis.reasoningEffort).toBeUndefined()
    expect(explicit.routes.analysis).toMatchObject({
      providerId: 'deepseek', model: 'deepseek-flash', reasoningEffort: 'none',
    })
    expect(explicit.routes.draft_student).toMatchObject({ providerId: 'deepseek', model: 'deepseek-flash' })
  })
})

describe('tarifa DeepSeek peak/off-peak', () => {
  it.each([
    ['lunes 01:00 UTC', '2026-09-14T01:00:00.000Z', 'peak', 0.30, 0.006, 1.20],
    ['lunes 04:00 UTC', '2026-09-14T04:00:00.000Z', 'off_peak', 0.15, 0.003, 0.60],
    ['sábado 06:00 UTC', '2026-09-19T06:00:00.000Z', 'off_peak', 0.15, 0.003, 0.60],
  ])('%s', (_label, timestamp, band, input, cached, output) => {
    const now = new Date(timestamp)
    expect(deepSeekPricingBand(now)).toBe(band)
    expect(pricingEntryAt('deepseek', 'deepseek-flash', now)).toMatchObject({
      timeBand: band, inputPerMillion: input, cachedInputPerMillion: cached, outputPerMillion: output,
    })
  })
})
