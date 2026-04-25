/**
 * Investighost - Módulo de Configuración
 * 
 * Propósito: Cargar y validar configuración desde variables de entorno
 * Alcance: API keys, preferencias de proveedores, modo debug
 * Estado: Implementación mínima para Kimi
 * 
 * NOTA: En Electron, las variables de entorno se cargan desde el proceso main
 * y se validan al inicio. No se almacenan en código ni en base de datos.
 */

import { z } from 'zod'
import type { SearchProvider } from '@shared/types'

// ============================================
// Esquema de validación de configuración
// ============================================

const configSchema = z.object({
  // Proveedores de IA
  kimi: z.object({
    apiKey: z.string().min(10).optional(),
    baseUrl: z.string().url().default('https://api.moonshot.ai/v1'),
    defaultModel: z.string().default('kimi-k2.6'),
  }).default({}),
  
  openai: z.object({
    apiKey: z.string().min(10).optional(),
    baseUrl: z.string().url().default('https://api.openai.com/v1'),
    defaultModel: z.string().default('gpt-4o'),
  }).default({}),

  search: z.object({
    provider: z.enum(['mock', 'brave']).default('mock'),
    braveApiKey: z.string().min(10).optional(),
  }).default({}),
  
  // Configuración general
  debug: z.boolean().default(false),
})

type Config = z.infer<typeof configSchema>

// ============================================
// Estado interno
// ============================================

let cachedConfig: Config | null = null

// ============================================
// Funciones de carga
// ============================================

/**
 * Carga la configuración desde variables de entorno
 * Esta función debe llamarse desde el proceso main de Electron
 */
export function loadConfig(): Config {
  // Si ya está cargada, devolver caché
  if (cachedConfig) {
    return cachedConfig
  }

  // En Electron, process.env está disponible en main process
  const rawConfig = {
    kimi: {
      apiKey: process.env.KIMI_API_KEY,
      baseUrl: process.env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1',
      defaultModel: process.env.KIMI_MODEL || process.env.KIMI_DEFAULT_MODEL || 'kimi-k2.6',
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      defaultModel: process.env.OPENAI_DEFAULT_MODEL || 'gpt-4o',
    },
    search: {
      provider: parseSearchProvider(process.env.SEARCH_PROVIDER),
      braveApiKey: process.env.BRAVE_SEARCH_API_KEY,
    },
    debug: process.env.DEBUG === 'true',
  }

  // Validar con Zod
  const result = configSchema.safeParse(rawConfig)
  
  if (!result.success) {
    console.error('[Config] Validation errors:', result.error.errors)
    // En caso de error, usar defaults básicos
    cachedConfig = configSchema.parse({})
    return cachedConfig
  }

  cachedConfig = result.data
  
  // Log de estado (sin mostrar claves)
  console.log('[Config] Loaded successfully')
  console.log('[Config] Kimi configured:', !!cachedConfig.kimi.apiKey)
  console.log('[Config] Kimi baseURL:', cachedConfig.kimi.baseUrl)
  console.log('[Config] Kimi model:', cachedConfig.kimi.defaultModel)
  console.log('[Config] OpenAI configured:', !!cachedConfig.openai.apiKey)
  console.log('[Config] Search provider:', cachedConfig.search.provider)
  console.log('[Config] Brave Search configured:', !!cachedConfig.search.braveApiKey)
  
  return cachedConfig
}

function parseSearchProvider(value: string | undefined): SearchProvider {
  return value === 'brave' ? 'brave' : 'mock'
}

/**
 * Obtiene la configuración cargada
 * Lanza error si no se ha cargado previamente
 */
export function getConfig(): Config {
  if (!cachedConfig) {
    throw new Error('Configuration not loaded. Call loadConfig() first from main process.')
  }
  return cachedConfig
}

/**
 * Verifica si Kimi está configurado y disponible
 */
export function isKimiConfigured(): boolean {
  const config = getConfig()
  return !!config.kimi.apiKey && config.kimi.apiKey.length > 10
}

/**
 * Verifica si OpenAI está configurado y disponible
 */
export function isOpenAIConfigured(): boolean {
  const config = getConfig()
  return !!config.openai.apiKey && config.openai.apiKey.length > 10
}

/**
 * Obtiene el estado de configuración de todos los proveedores
 */
export function getProviderConfigStatus(): {
  kimi: { configured: boolean; hasKey: boolean }
  openai: { configured: boolean; hasKey: boolean }
  debug: boolean
} {
  const config = getConfig()
  
  return {
    kimi: {
      configured: isKimiConfigured(),
      hasKey: !!config.kimi.apiKey,
    },
    openai: {
      configured: isOpenAIConfigured(),
      hasKey: !!config.openai.apiKey,
    },
    debug: config.debug,
  }
}

/**
 * Reinicia la caché de configuración (útil para tests)
 */
export function resetConfig(): void {
  cachedConfig = null
}

// ============================================
// Export de tipos
// ============================================

export type { Config }
