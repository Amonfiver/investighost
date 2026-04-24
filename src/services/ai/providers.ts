/**
 * Investighost - Proveedores de IA
 * 
 * Propósito: Definir contratos e implementaciones base para múltiples proveedores
 * Alcance: OpenAI, Kimi, y futuros proveedores
 * Estado: Arquitectura preparada, implementaciones placeholder
 * 
 * NOTA: Este módulo implementa el patrón Strategy para múltiples proveedores
 * permitiendo: selección manual, auto-selección, fallback y comparación.
 */

import type { AIProvider, AIProviderContract, ProviderStrategy } from '@shared/types'

// ============================================
// CONFIGURACIÓN DE PROVEEDORES
// ============================================

export interface ProviderConfig {
  apiKey?: string
  baseUrl?: string
  defaultModel: string
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
    strategy: ProviderStrategy
    searchProvider: 'openai' | 'kimi' | 'web' | 'local'
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
// IMPLEMENTACIONES PLACEHOLDER
// Se activarán cuando se configuren las API keys
// ============================================

/**
 * Proveedor OpenAI
 * Estado: Placeholder - requiere API key para activar
 */
export class OpenAIProvider extends BaseAIProvider {
  readonly name: AIProvider = 'openai'
  supportsSearch = true   // GPT-4 con browsing
  supportsChat = true
  supportsStructured = true
  
  async generateText(_prompt: string, _options?: unknown): Promise<string> {
    if (!this.isAvailable) {
      throw new Error('OpenAI not configured - set OPENAI_API_KEY')
    }
    // TODO: Implementar integración real con OpenAI
    throw new Error('OpenAI integration not yet implemented')
  }
  
  async generateStructured<T>(_prompt: string, _schema: unknown): Promise<T> {
    if (!this.isAvailable) {
      throw new Error('OpenAI not configured - set OPENAI_API_KEY')
    }
    // TODO: Implementar con response_format: { type: "json_object" }
    throw new Error('OpenAI structured generation not yet implemented')
  }
  
  async searchAndSummarize(_query: string): Promise<string> {
    if (!this.isAvailable) {
      throw new Error('OpenAI not configured - set OPENAI_API_KEY')
    }
    // TODO: Implementar con function calling o browsing
    throw new Error('OpenAI search not yet implemented')
  }
}

/**
 * Proveedor Kimi (Moonshot AI)
 * Estado: Placeholder - requiere API key para activar
 */
export class KimiProvider extends BaseAIProvider {
  readonly name: AIProvider = 'kimi'
  supportsSearch = true   // Kimi soporta búsqueda web
  supportsChat = true
  supportsStructured = true
  
  async generateText(_prompt: string, _options?: unknown): Promise<string> {
    if (!this.isAvailable) {
      throw new Error('Kimi not configured - set KIMI_API_KEY')
    }
    // TODO: Implementar integración real con Kimi API
    throw new Error('Kimi integration not yet implemented')
  }
  
  async generateStructured<T>(_prompt: string, _schema: unknown): Promise<T> {
    if (!this.isAvailable) {
      throw new Error('Kimi not configured - set KIMI_API_KEY')
    }
    // TODO: Implementar con mode JSON de Kimi
    throw new Error('Kimi structured generation not yet implemented')
  }
  
  async searchAndSummarize(_query: string): Promise<string> {
    if (!this.isAvailable) {
      throw new Error('Kimi not configured - set KIMI_API_KEY')
    }
    // TODO: Implementar con capacidad de búsqueda de Kimi
    throw new Error('Kimi search not yet implemented')
  }
}

/**
 * Proveedor Local (Ollama, LM Studio, etc.)
 * Estado: Placeholder - para uso sin dependencia de APIs externas
 */
export class LocalProvider extends BaseAIProvider {
  readonly name: AIProvider = 'local'
  supportsSearch = false  // Búsqueda local no implementada
  supportsChat = true
  supportsStructured = true
  
  async generateText(_prompt: string, _options?: unknown): Promise<string> {
    if (!this.isAvailable) {
      throw new Error('Local provider not configured - set LOCAL_API_URL')
    }
    // TODO: Implementar con Ollama o LM Studio API local
    throw new Error('Local provider not yet implemented')
  }
  
  async generateStructured<T>(_prompt: string, _schema: unknown): Promise<T> {
    if (!this.isAvailable) {
      throw new Error('Local provider not configured - set LOCAL_API_URL')
    }
    // TODO: Implementar con prompting para JSON
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
    if (this.config.providers.openai) {
      this.providers.set('openai', new OpenAIProvider(this.config.providers.openai))
    }
    
    // Inicializar Kimi si hay configuración
    if (this.config.providers.kimi) {
      this.providers.set('kimi', new KimiProvider(this.config.providers.kimi))
    }
    
    // Inicializar Local si hay configuración
    if (this.config.providers.local) {
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

export const defaultProviderConfig: MultiProviderConfig = {
  providers: {
    openai: {
      defaultModel: 'gpt-4o',
      models: {
        search: 'gpt-4o',
        chat: 'gpt-4o',
        fast: 'gpt-4o-mini',
        quality: 'gpt-4o'
      },
      rateLimits: {
        requestsPerMinute: 100,
        tokensPerMinute: 100000
      },
      pricing: {
        inputPer1kTokens: 0.005,
        outputPer1kTokens: 0.015
      }
    },
    kimi: {
      defaultModel: 'kimi-k1',
      models: {
        search: 'kimi-k1',
        chat: 'kimi-k1',
        fast: 'kimi-k1',
        quality: 'kimi-k1.5'
      },
      rateLimits: {
        requestsPerMinute: 60,
        tokensPerMinute: 60000
      },
      pricing: {
        inputPer1kTokens: 0.003,
        outputPer1kTokens: 0.009
      }
    },
    local: {
      defaultModel: 'llama3.1',
      models: {
        chat: 'llama3.1',
        fast: 'llama3.1',
        quality: 'llama3.1:70b'
      },
      rateLimits: {
        requestsPerMinute: 1000,
        tokensPerMinute: 1000000
      },
      pricing: {
        inputPer1kTokens: 0,
        outputPer1kTokens: 0
      }
    }
  },
  defaults: {
    strategy: 'auto',
    searchProvider: 'openai',
    aiProvider: 'openai'
  },
  fallbackOrder: ['openai', 'kimi', 'local']
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
    // Inicializar con config por defecto (sin API keys = todos unavailable)
    providerFactory = new ProviderFactory(defaultProviderConfig)
  }
  return providerFactory
}

export function resetProviderFactory(): void {
  providerFactory = null
}