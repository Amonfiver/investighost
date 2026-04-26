/**
 * Investighost - Proveedores de IA
 * 
 * Propósito: Definir contratos e implementaciones para múltiples proveedores
 * Alcance: OpenAI (placeholder), Kimi (implementado), Local (placeholder)
 * Estado: Kimi implementado con API real, OpenAI preparado para futuro
 * 
 * NOTA: Kimi usa API compatible con OpenAI (baseURL: https://api.moonshot.ai/v1)
 */

import OpenAI from 'openai'
import type { AIProvider, AIProviderContract, SearchProvider } from '@shared/types'
import { getConfig } from '@services/config'

const KIMI_REQUEST_TIMEOUT_MS = 90_000
const KIMI_MINIMAL_TEST_TIMEOUT_MS = 20_000

// ============================================
// CONFIGURACIÓN DE PROVEEDORES
// ============================================

export interface ProviderConfig {
  apiKey?: string
  baseUrl?: string
  defaultModel: string
  maxTokens: number
  models: {
    search?: string      // Modelo para búsqueda/investigación
    chat?: string        // Modelo para conversación
    fast?: string        // Modelo rápido/económico
    quality?: string     // Modelo máxima calidad
  }
  rateLimits: {
    requestsPerMinute: number
    tokensPerMinute: number
  }
  pricing: {
    inputPer1kTokens: number   // USD
    outputPer1kTokens: number  // USD
  }
}

export interface MultiProviderConfig {
  providers: {
    openai?: ProviderConfig
    kimi?: ProviderConfig
    local?: ProviderConfig
  }
  defaults: {
    strategy: 'auto' | 'openai' | 'kimi' | 'fallback' | 'compare'
    searchProvider: SearchProvider
    aiProvider: 'openai' | 'kimi' | 'local'
  }
  fallbackOrder: AIProvider[]  // Orden de intento en modo fallback
}

// ============================================
// ESTADO DE DISPONIBILIDAD
// ============================================

export interface ProviderHealth {
  provider: AIProvider
  isAvailable: boolean
  lastCheckedAt: Date
  errorMessage?: string
  remainingBalance?: number    // Si el proveedor lo reporta
  currentLatencyMs?: number
}

// ============================================
// IMPLEMENTACIÓN BASE ABSTRACTA
// ============================================

export abstract class BaseAIProvider implements AIProviderContract {
  abstract readonly name: AIProvider
  
  constructor(protected config: ProviderConfig) {}
  
  get isAvailable(): boolean {
    return !!this.config.apiKey && this.config.apiKey.length > 0
  }
  
  abstract supportsSearch: boolean
  abstract supportsChat: boolean
  abstract supportsStructured: boolean
  
  abstract generateText(prompt: string, options?: unknown): Promise<string>
  abstract generateStructured<T>(prompt: string, schema: unknown): Promise<T>
  abstract searchAndSummarize(query: string): Promise<string>
  
  estimateCost(tokensInput: number, tokensOutput: number): number {
    const inputCost = (tokensInput / 1000) * this.config.pricing.inputPer1kTokens
    const outputCost = (tokensOutput / 1000) * this.config.pricing.outputPer1kTokens
    return inputCost + outputCost
  }
}

// ============================================
// IMPLEMENTACIÓN REAL: KIMI (Moonshot AI)
// ============================================

/**
 * Proveedor Kimi (Moonshot AI)
 * Estado: IMPLEMENTADO - usa API real compatible con OpenAI
 */
export class KimiProvider extends BaseAIProvider {
  readonly name: AIProvider = 'kimi'
  supportsSearch = true
  supportsChat = true
  supportsStructured = true
  
  private client: OpenAI | null = null
  
  constructor(config: ProviderConfig) {
    super(config)
    if (config.apiKey) {
      console.log('[KimiProvider] baseURL:', config.baseUrl || 'https://api.moonshot.ai/v1')
      console.log('[KimiProvider] model:', config.defaultModel)
      this.client = new OpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseUrl || 'https://api.moonshot.ai/v1',
      })
    }
  }
  
  async generateText(prompt: string, options?: { model?: string; temperature?: number }): Promise<string> {
    if (!this.client || !this.isAvailable) {
      throw new Error('Kimi not configured - set KIMI_API_KEY in .env file')
    }
    
    const model = options?.model || this.config.defaultModel
    const temperature = resolveKimiTemperature(model, options?.temperature ?? 0.7)
    const maxTokens = resolveKimiMaxTokens(this.config.maxTokens)
    console.log('[KimiProvider] model:', model)
    console.log('[KimiProvider] temperature:', temperature)
    console.log('[KimiProvider] max_tokens:', maxTokens)
    console.log('[KimiProvider] request started')
    
    try {
      const response = await runKimiRequest(
        signal => this.client!.chat.completions.create(
          {
            model,
            messages: [{ role: 'user', content: prompt }],
            temperature,
            max_tokens: maxTokens,
          },
          { signal }
        ),
        KIMI_REQUEST_TIMEOUT_MS
      )
      
      const content = response.choices[0]?.message?.content
      if (!content) {
        throw new Error('Kimi returned empty response')
      }
      
      return content
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw new Error(`Kimi API error: ${message}`)
    }
  }
  
  async generateStructured<T>(
    prompt: string, 
    schema: unknown, 
    options?: { model?: string; temperature?: number }
  ): Promise<T> {
    if (!this.client || !this.isAvailable) {
      throw new Error('Kimi not configured - set KIMI_API_KEY in .env file')
    }
    
    const model = options?.model || this.config.defaultModel
    const temperature = resolveKimiTemperature(model, options?.temperature ?? 0.3)
    const maxTokens = resolveKimiMaxTokens(this.config.maxTokens)
    console.log('[KimiProvider] model:', model)
    console.log('[KimiProvider] temperature:', temperature)
    console.log('[KimiProvider] max_tokens:', maxTokens)
    console.log('[KimiProvider] request started')
    
    // Construir prompt que fuerza JSON válido
    const structuredPrompt = `${prompt}

IMPORTANT: You must respond with ONLY valid JSON, no markdown formatting, no code blocks, no additional text.

Expected JSON structure:
${JSON.stringify(schema, null, 2)}`

    try {
      const response = await runKimiRequest(
        signal => this.client!.chat.completions.create(
          {
            model,
            messages: [{ role: 'user', content: structuredPrompt }],
            temperature,
            max_tokens: maxTokens,
          },
          { signal }
        ),
        KIMI_REQUEST_TIMEOUT_MS
      )
      
      const content = response.choices[0]?.message?.content
      if (!content) {
        throw new Error('Kimi returned empty response')
      }
      
      // Limpiar posible formato markdown
      const cleanContent = content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim()
      
      try {
        return JSON.parse(cleanContent) as T
      } catch (parseError) {
        throw new Error(`Kimi returned invalid JSON: ${cleanContent.substring(0, 200)}...`)
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('invalid JSON')) {
        throw error
      }
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw new Error(`Kimi API error: ${message}`)
    }
  }
  
  async searchAndSummarize(query: string, options?: { model?: string }): Promise<string> {
    // Kimi no tiene búsqueda web nativa en la API básica
    // Se simula con un prompt que pide al modelo usar su conocimiento
    const searchPrompt = `Investiga sobre el siguiente tema y proporciona un resumen útil para un viajero:

"${query}"

Por favor, proporciona:
1. Información general relevante
2. Lugares o experiencias destacadas
3. Consejos prácticos si aplica

Responde en español de forma natural y útil.`

    return this.generateText(searchPrompt, { ...options, temperature: 0.7 })
  }

  async testMinimalCall(): Promise<void> {
    if (!this.client || !this.isAvailable) {
      throw new Error('Kimi not configured - set KIMI_API_KEY in .env file')
    }

    const model = this.config.defaultModel
    const temperature = resolveKimiTemperature(model, 1)
    console.log('[KimiProvider] minimal test started')
    console.log('[KimiProvider] model:', model)
    console.log('[KimiProvider] temperature:', temperature)

    try {
      const response = await runKimiRequest(
        signal => this.client!.chat.completions.create(
          {
            model,
            messages: [{ role: 'user', content: 'Responde solo con OK' }],
            temperature,
            max_tokens: 8,
          },
          { signal }
        ),
        KIMI_MINIMAL_TEST_TIMEOUT_MS
      )

      const content = response.choices[0]?.message?.content?.trim()
      if (!content) {
        throw new Error('Kimi returned empty response')
      }

      console.log('[KimiProvider] minimal test success')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      console.error('[KimiProvider] minimal test failed:', message)
      throw new Error(`Kimi minimal test failed: ${message}`)
    }
  }
}

function resolveKimiTemperature(model: string, requestedTemperature: number): number {
  if (model === 'kimi-k2.6') {
    return 1
  }

  return requestedTemperature
}

function resolveKimiMaxTokens(maxTokens: number): number {
  return Math.max(1, Math.min(maxTokens, 4000))
}

export async function testKimiMinimalCall(): Promise<void> {
  const provider = getProviderFactory().getProvider('kimi')

  if (!(provider instanceof KimiProvider)) {
    throw new Error('Kimi provider not available')
  }

  await provider.testMinimalCall()
}

async function runKimiRequest<T>(
  requestFactory: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number
): Promise<T> {
  const controller = new AbortController()
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort()
        console.warn(`[KimiProvider] request timeout after ${timeoutMs} ms`)
        reject(new Error('La llamada a Kimi superó el tiempo máximo de espera'))
      }, timeoutMs)
    })

    return await Promise.race([
      requestFactory(controller.signal),
      timeoutPromise,
    ])
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  }
}

// ============================================
// IMPLEMENTACIONES PLACEHOLDER (para futuro)
// ============================================

/**
 * Proveedor OpenAI
 * Estado: Placeholder - requiere API key para activar
 */
export class OpenAIProvider extends BaseAIProvider {
  readonly name: AIProvider = 'openai'
  supportsSearch = true
  supportsChat = true
  supportsStructured = true
  
  async generateText(_prompt: string, _options?: unknown): Promise<string> {
    if (!this.isAvailable) {
      throw new Error('OpenAI not configured - set OPENAI_API_KEY')
    }
    // TODO: Implementar integración real con OpenAI cuando sea necesario
    throw new Error('OpenAI integration not yet implemented - use Kimi for now')
  }
  
  async generateStructured<T>(_prompt: string, _schema: unknown): Promise<T> {
    if (!this.isAvailable) {
      throw new Error('OpenAI not configured - set OPENAI_API_KEY')
    }
    throw new Error('OpenAI structured generation not yet implemented')
  }
  
  async searchAndSummarize(_query: string): Promise<string> {
    if (!this.isAvailable) {
      throw new Error('OpenAI not configured - set OPENAI_API_KEY')
    }
    throw new Error('OpenAI search not yet implemented')
  }
}

/**
 * Proveedor Local (Ollama, LM Studio, etc.)
 * Estado: Placeholder - para uso sin dependencia de APIs externas
 */
export class LocalProvider extends BaseAIProvider {
  readonly name: AIProvider = 'local'
  supportsSearch = false
  supportsChat = true
  supportsStructured = true
  
  async generateText(_prompt: string, _options?: unknown): Promise<string> {
    if (!this.isAvailable) {
      throw new Error('Local provider not configured - set LOCAL_API_URL')
    }
    throw new Error('Local provider not yet implemented')
  }
  
  async generateStructured<T>(_prompt: string, _schema: unknown): Promise<T> {
    if (!this.isAvailable) {
      throw new Error('Local provider not configured - set LOCAL_API_URL')
    }
    throw new Error('Local structured generation not yet implemented')
  }
  
  async searchAndSummarize(_query: string): Promise<string> {
    throw new Error('Local provider does not support web search')
  }
}

// ============================================
// FÁBRICA DE PROVEEDORES
// ============================================

export class ProviderFactory {
  private providers: Map<AIProvider, BaseAIProvider> = new Map()
  
  constructor(private config: MultiProviderConfig) {
    this.initializeProviders()
  }
  
  private initializeProviders(): void {
    // Inicializar OpenAI si hay configuración
    if (this.config.providers.openai?.apiKey) {
      this.providers.set('openai', new OpenAIProvider(this.config.providers.openai))
    }
    
    // Inicializar Kimi si hay configuración
    if (this.config.providers.kimi?.apiKey) {
      this.providers.set('kimi', new KimiProvider(this.config.providers.kimi))
    }
    
    // Inicializar Local si hay configuración
    if (this.config.providers.local?.apiKey) {
      this.providers.set('local', new LocalProvider(this.config.providers.local))
    }
  }
  
  getProvider(name: AIProvider): BaseAIProvider | undefined {
    return this.providers.get(name)
  }
  
  getAvailableProviders(): AIProvider[] {
    return Array.from(this.providers.entries())
      .filter(([_, provider]) => provider.isAvailable)
      .map(([name, _]) => name)
  }
  
  getHealthStatus(): ProviderHealth[] {
    return Array.from(this.providers.entries()).map(([name, provider]) => ({
      provider: name,
      isAvailable: provider.isAvailable,
      lastCheckedAt: new Date(),
      errorMessage: provider.isAvailable ? undefined : `${name} not configured`
    }))
  }
}

// ============================================
// CONFIGURACIÓN POR DEFECTO
// ============================================

/**
 * Crea configuración de proveedores desde el módulo de config
 */
export function createProviderConfigFromEnv(): MultiProviderConfig {
  try {
    const config = getConfig()
    
    return {
      providers: {
        kimi: config.kimi.apiKey ? {
          apiKey: config.kimi.apiKey,
          baseUrl: config.kimi.baseUrl,
          defaultModel: config.kimi.defaultModel,
          maxTokens: config.kimi.maxTokens,
          models: {
            search: config.kimi.defaultModel,
            chat: config.kimi.defaultModel,
            fast: config.kimi.defaultModel,
            quality: config.kimi.defaultModel,
          },
          rateLimits: {
            requestsPerMinute: 60,
            tokensPerMinute: 60000,
          },
          pricing: {
            inputPer1kTokens: 0.003,
            outputPer1kTokens: 0.009,
          }
        } : undefined,
        
        openai: config.openai.apiKey ? {
          apiKey: config.openai.apiKey,
          baseUrl: config.openai.baseUrl,
          defaultModel: config.openai.defaultModel,
          maxTokens: 1200,
          models: {
            search: config.openai.defaultModel,
            chat: config.openai.defaultModel,
            fast: 'gpt-4o-mini',
            quality: config.openai.defaultModel,
          },
          rateLimits: {
            requestsPerMinute: 100,
            tokensPerMinute: 100000,
          },
          pricing: {
            inputPer1kTokens: 0.005,
            outputPer1kTokens: 0.015,
          }
        } : undefined,
        
        local: undefined, // Siempre placeholder por ahora
      },
      defaults: {
        strategy: 'auto',
        searchProvider: 'mock',
        aiProvider: 'kimi'
      },
      fallbackOrder: ['kimi', 'openai', 'local']
    }
  } catch (error) {
    // Si no hay config cargada, devolver config vacía
    console.warn('[ProviderFactory] Config not loaded, returning empty config')
    return {
      providers: {},
      defaults: {
        strategy: 'auto',
        searchProvider: 'mock',
        aiProvider: 'kimi'
      },
      fallbackOrder: ['kimi', 'openai', 'local']
    }
  }
}

export const defaultProviderConfig: MultiProviderConfig = {
  providers: {},
  defaults: {
    strategy: 'auto',
    searchProvider: 'mock',
    aiProvider: 'kimi'
  },
  fallbackOrder: ['kimi', 'openai', 'local']
}

// ============================================
// INSTANCIA GLOBAL (se inicializará con config real)
// ============================================

let providerFactory: ProviderFactory | null = null

export function initializeProviderFactory(config: MultiProviderConfig): void {
  providerFactory = new ProviderFactory(config)
}

export function getProviderFactory(): ProviderFactory {
  if (!providerFactory) {
    // Intentar inicializar desde config
    const envConfig = createProviderConfigFromEnv()
    providerFactory = new ProviderFactory(envConfig)
  }
  return providerFactory
}

export function resetProviderFactory(): void {
  providerFactory = null
}
