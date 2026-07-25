import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { researchModule } from '@modules/research'
import { generateText } from '@services/ai'
import {
  KimiProvider,
  ProviderFactory,
  defaultProviderConfig,
  getProviderFactory,
} from '@services/ai/providers'
import {
  isAIResearchAvailable,
  researchWithAI,
} from '@services/ai/research'
import { loadConfig } from '@services/config'
import {
  LegacyProviderRuntimeDisabledError,
  assertLegacyProviderRuntimeDisabled,
} from '@services/legacy-provider-guard'
import {
  BraveSearchProvider,
  collectWebResearchBundle,
} from '@services/search'

const syntheticProviderConfig = {
  apiKey: 'synthetic-legacy-key',
  baseUrl: 'https://invalid.example',
  defaultModel: 'synthetic-model',
  maxTokens: 100,
  models: {},
  rateLimits: { requestsPerMinute: 1, tokensPerMinute: 100 },
  pricing: { inputPer1kTokens: 0, outputPer1kTokens: 0 },
}
const researchInput = {
  country: 'España',
  region: 'Morella',
  focus: 'synthetic-sensitive-input',
  outputLanguage: 'es',
}

describe('aislamiento fail-closed de proveedores legacy', () => {
  it('expone un error estable, sanitizado y no reintentable', () => {
    let error: unknown
    try {
      assertLegacyProviderRuntimeDisabled('test.entrypoint')
    } catch (reason) {
      error = reason
    }

    expect(error).toBeInstanceOf(LegacyProviderRuntimeDisabledError)
    expect(error).toMatchObject({
      code: 'LEGACY_PROVIDER_RUNTIME_DISABLED',
      retryable: false,
      message: 'Ruta legacy de proveedores desactivada: test.entrypoint',
    })
    expect(JSON.stringify(error)).not.toContain('synthetic-legacy-key')
  })

  it('bloquea la configuración legacy antes de cualquier lectura de process.env', () => {
    const source = readFileSync(resolve('src/services/config/index.ts'), 'utf8')
    expect(source.indexOf("assertLegacyProviderRuntimeDisabled('config.loadConfig')"))
      .toBeLessThan(source.indexOf('process.env.KIMI_API_KEY'))
    expect(() => loadConfig()).toThrowError(LegacyProviderRuntimeDisabledError)
  })

  it('impide crear la fábrica o el cliente Kimi históricos', () => {
    expect(() => getProviderFactory()).toThrowError(LegacyProviderRuntimeDisabledError)
    expect(() => new ProviderFactory(defaultProviderConfig)).toThrowError(
      LegacyProviderRuntimeDisabledError,
    )
    expect(() => new KimiProvider(syntheticProviderConfig)).toThrowError(
      LegacyProviderRuntimeDisabledError,
    )
  })

  it('impide Brave antes de fetch y bloquea el agregador web histórico', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const provider = new BraveSearchProvider({ apiKey: 'synthetic-legacy-key' })
    await expect(provider.search({
      id: 'legacy-query',
      destination: { country: 'España', region: 'Morella' },
      query: 'Morella',
      createdAt: new Date('2026-07-25T00:00:00Z'),
    })).rejects.toThrowError(LegacyProviderRuntimeDisabledError)
    await expect(collectWebResearchBundle(researchInput)).rejects.toThrowError(
      LegacyProviderRuntimeDisabledError,
    )
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('bloquea orquestación e investigación antes de registrar inputs o previews', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    await expect(generateText('synthetic-sensitive-prompt')).rejects.toThrowError(
      LegacyProviderRuntimeDisabledError,
    )
    await expect(researchWithAI('legacy-research', researchInput)).rejects.toThrowError(
      LegacyProviderRuntimeDisabledError,
    )
    await expect(researchModule.startResearch('legacy-request')).rejects.toThrowError(
      LegacyProviderRuntimeDisabledError,
    )
    expect(logSpy.mock.calls.flat().join(' ')).not.toMatch(/synthetic-sensitive/i)
    logSpy.mockRestore()
    expect(isAIResearchAvailable()).toBe(false)
    expect(researchModule.isAIConfigured()).toBe(false)
  })

  it('mantiene main y el pipeline nuevo sin imports de rutas legacy', () => {
    const sources = [
      resolve('src/main/index.ts'),
      ...readdirSync(resolve('src/modules/real-pipeline'))
        .filter(file => file.endsWith('.ts'))
        .map(file => resolve('src/modules/real-pipeline', file)),
    ].map(file => readFileSync(file, 'utf8')).join('\n')

    expect(sources).not.toMatch(/@modules\/research/)
    expect(sources).not.toMatch(/@services\/ai(?:\/|')/)
    expect(sources).not.toMatch(/@services\/search/)
    expect(sources).not.toMatch(/@services\/config/)
  })
})
