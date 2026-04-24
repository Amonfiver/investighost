/**
 * Investighost - Servicio AI Multi-Proveedor
 * 
 * Propósito: Orquestar múltiples proveedores de IA con estrategias configurables
 * Alcance: OpenAI, Kimi, Local - con soporte para auto, fallback, compare
 * Estado: Arquitectura preparada, implementaciones placeholder
 * 
 * ARQUITECTURA:
 * - Delega en providers.ts para implementaciones específicas
 * - Implementa estrategias: auto, openai, kimi, fallback, compare
 * - Registra auditoría de uso para análisis de coste/calidad
 */

import type { 
  AIProvider, 
  ProviderStrategy, 
  ProviderUsageLog
} from '@shared/types'
import { 
  ProviderFactory, 
  BaseAIProvider,
  getProviderFactory,
  initializeProviderFactory,
  defaultProviderConfig,
  type MultiProviderConfig 
} from './providers'

// Re-exportar tipos y clases necesarios
export { initializeProviderFactory, getProviderFactory, defaultProviderConfig }
export type { MultiProviderConfig, BaseAIProvider }

// ============================================
// STORE DE AUDITORÍA (temporal en memoria)
// Se migrará a SQLite en el futuro
// ============================================

const usageLogs: ProviderUsageLog[] = []

// ============================================
// SERVICIO ORQUESTADOR MULTI-PROVEEDOR
// ============================================

export interface AIOrchestratorOptions {
  strategy?: ProviderStrategy
  preferredProvider?: AIProvider
  fallbackEnabled?: boolean
  compareMode?: boolean
  trackUsage?: boolean
}

/**
 * Genera texto usando la estrategia configurada
 */
export async function generateText(
  prompt: string,
  options: AIOrchestratorOptions = {}
): Promise<{ 
  result: string
  provider: AIProvider
  cost?: number
  logId?: string
}> {
  const { 
    strategy = 'auto',
    trackUsage = true 
  } = options
  
  const factory = getProviderFactory()
  const operationId = `gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  
  // Ejecutar según estrategia
  let result: string
  let provider: AIProvider
  let cost: number | undefined
  
  switch (strategy) {
    case 'openai':
      ({ result, provider, cost } = await executeWithProvider('openai', prompt, factory))
      break
      
    case 'kimi':
      ({ result, provider, cost } = await executeWithProvider('kimi', prompt, factory))
      break
      
    case 'fallback':
      ({ result, provider, cost } = await executeWithFallback(prompt, factory))
      break
      
    case 'compare':
      ({ result, provider, cost } = await executeWithCompare(prompt, factory))
      break
      
    case 'auto':
    default:
      ({ result, provider, cost } = await executeWithAutoSelection(prompt, factory))
      break
  }
  
  // Registrar uso si está habilitado
  let logId: string | undefined
  if (trackUsage) {
    logId = await logProviderUsage({
      operationId,
      operationType: 'draft_generation',
      strategy,
      aiProvider: provider,
      aiCostEstimated: cost
    })
  }
  
  return { result, provider, cost, logId }
}

/**
 * Ejecuta con un proveedor específico
 */
async function executeWithProvider(
  providerName: AIProvider,
  prompt: string,
  factory: ProviderFactory
): Promise<{ result: string; provider: AIProvider; cost?: number }> {
  const provider = factory.getProvider(providerName)
  
  if (!provider || !provider.isAvailable) {
    throw new Error(`Provider ${providerName} not available`)
  }
  
  const startTime = Date.now()
  const result = await provider.generateText(prompt)
  const latency = Date.now() - startTime
  
  // Estimar coste (asumiendo ~1 token por 4 caracteres aproximadamente)
  const estimatedInputTokens = Math.ceil(prompt.length / 4)
  const estimatedOutputTokens = Math.ceil(result.length / 4)
  const cost = provider.estimateCost(estimatedInputTokens, estimatedOutputTokens)
  
  console.log(`[AI Service] Generated with ${providerName} in ${latency}ms, est. cost: $${cost.toFixed(4)}`)
  
  return { result, provider: providerName, cost }
}

/**
 * Ejecuta con fallback automático
 */
async function executeWithFallback(
  prompt: string,
  factory: ProviderFactory
): Promise<{ result: string; provider: AIProvider; cost?: number }> {
  const fallbackOrder: AIProvider[] = ['openai', 'kimi', 'local']
  
  for (const providerName of fallbackOrder) {
    try {
      return await executeWithProvider(providerName, prompt, factory)
    } catch (error) {
      console.warn(`[AI Service] Fallback: ${providerName} failed, trying next...`)
    }
  }
  
  throw new Error('All providers failed in fallback chain')
}

/**
 * Selección automática del mejor proveedor disponible
 */
async function executeWithAutoSelection(
  prompt: string,
  factory: ProviderFactory
): Promise<{ result: string; provider: AIProvider; cost?: number }> {
  const available = factory.getAvailableProviders()
  
  if (available.length === 0) {
    throw new Error('No AI providers available - configure API keys')
  }
  
  // Preferencia: OpenAI > Kimi > Local
  const preferenceOrder: AIProvider[] = ['openai', 'kimi', 'local']
  const selected = preferenceOrder.find(p => available.includes(p)) || available[0]
  
  return executeWithProvider(selected, prompt, factory)
}

/**
 * Ejecuta con múltiples proveedores para comparar
 */
async function executeWithCompare(
  prompt: string,
  factory: ProviderFactory
): Promise<{ result: string; provider: AIProvider; cost?: number }> {
  const available = factory.getAvailableProviders()
  
  if (available.length < 2) {
    console.warn('[AI Service] Compare mode needs 2+ providers, falling back to auto')
    return executeWithAutoSelection(prompt, factory)
  }
  
  const results: Array<{
    provider: AIProvider
    result: string
    cost: number
    latency: number
  }> = []
  
  // Ejecutar con los primeros 2 proveedores disponibles
  for (const providerName of available.slice(0, 2)) {
    try {
      const startTime = Date.now()
      const provider = factory.getProvider(providerName)!
      const result = await provider.generateText(prompt)
      const latency = Date.now() - startTime
      
      const estimatedInputTokens = Math.ceil(prompt.length / 4)
      const estimatedOutputTokens = Math.ceil(result.length / 4)
      const cost = provider.estimateCost(estimatedInputTokens, estimatedOutputTokens)
      
      results.push({ provider: providerName, result, cost, latency })
    } catch (error) {
      console.warn(`[AI Service] Compare: ${providerName} failed`)
    }
  }
  
  if (results.length === 0) {
    throw new Error('All providers failed in compare mode')
  }
  
  // Por ahora, seleccionar el más barato
  // En el futuro, esto podría ser más sofisticado
  const best = results.reduce((prev, curr) => 
    curr.cost < prev.cost ? curr : prev
  )
  
  // Guardar resultado de comparación para referencia (se puede loguear o almacenar)
  console.log('[AI Service] Compare mode results:', {
    selected: best.provider,
    options: results.map(r => ({ provider: r.provider, cost: r.cost }))
  })
  
  // Devolver el resultado seleccionado
  return { 
    result: best.result, 
    provider: best.provider, 
    cost: best.cost 
  }
}

// ============================================
// AUDITORÍA Y LOGGING
// ============================================

/**
 * Registra uso de proveedor para auditoría de coste/calidad
 */
export async function logProviderUsage(
  log: Omit<ProviderUsageLog, 'id' | 'usedAt'>
): Promise<string> {
  const fullLog: ProviderUsageLog = {
    ...log,
    id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    usedAt: new Date()
  }
  
  usageLogs.push(fullLog)
  
  // Limitar tamaño del log en memoria (mantener últimos 1000)
  if (usageLogs.length > 1000) {
    usageLogs.shift()
  }
  
  return fullLog.id
}

/**
 * Obtiene logs de uso para análisis
 */
export async function getUsageLogs(options?: {
  operationType?: ProviderUsageLog['operationType']
  provider?: AIProvider
  limit?: number
}): Promise<ProviderUsageLog[]> {
  let filtered = usageLogs
  
  if (options?.operationType) {
    filtered = filtered.filter(l => l.operationType === options.operationType)
  }
  
  if (options?.provider) {
    filtered = filtered.filter(l => l.aiProvider === options.provider)
  }
  
  const limit = options?.limit ?? 100
  return filtered.slice(-limit)
}

/**
 * Obtiene estadísticas de uso por proveedor
 */
export async function getProviderStats(): Promise<{
  provider: AIProvider
  totalOperations: number
  totalCostEstimated: number
  averageQualityRating?: number
}[]> {
  const stats = new Map<AIProvider, {
    operations: number
    cost: number
    qualitySum: number
    qualityCount: number
  }>()
  
  usageLogs.forEach(log => {
    if (!log.aiProvider) return
    
    const current = stats.get(log.aiProvider) || {
      operations: 0,
      cost: 0,
      qualitySum: 0,
      qualityCount: 0
    }
    
    current.operations++
    current.cost += log.aiCostEstimated ?? 0
    
    if (log.qualityRating) {
      current.qualitySum += log.qualityRating
      current.qualityCount++
    }
    
    stats.set(log.aiProvider, current)
  })
  
  return Array.from(stats.entries()).map(([provider, data]) => ({
    provider,
    totalOperations: data.operations,
    totalCostEstimated: data.cost,
    averageQualityRating: data.qualityCount > 0 
      ? data.qualitySum / data.qualityCount 
      : undefined
  }))
}

/**
 * Añade evaluación de calidad a un log existente
 */
export async function rateProviderResult(
  logId: string,
  rating: number,
  notes?: string
): Promise<boolean> {
  const log = usageLogs.find(l => l.id === logId)
  if (!log) return false
  
  log.qualityRating = rating
  log.qualityNotes = notes
  log.wasUseful = rating >= 3
  
  return true
}

// ============================================
// ESTADO DEL SERVICIO
// ============================================

export interface AIServiceStatus {
  availableProviders: AIProvider[]
  defaultStrategy: ProviderStrategy
  totalLogsRecorded: number
  estimatedTotalCost: number
}

export function getAIServiceStatus(): AIServiceStatus {
  const factory = getProviderFactory()
  const available = factory.getAvailableProviders()
  
  const totalCost = usageLogs.reduce((sum, log) => sum + (log.aiCostEstimated ?? 0), 0)
  
  return {
    availableProviders: available,
    defaultStrategy: 'auto',
    totalLogsRecorded: usageLogs.length,
    estimatedTotalCost: totalCost
  }
}

// ============================================
// COMPATIBILIDAD CON API ANTIGUA (placeholder)
// ============================================

export interface AIService {
  isAvailable(): boolean
  generateText(prompt: string, options?: unknown): Promise<string>
  improveText(text: string, instructions: string): Promise<string>
}

/**
 * Servicio legacy para compatibilidad
 * @deprecated Usar generateText() con opciones de estrategia
 */
export const aiService: AIService = {
  isAvailable: () => {
    const factory = getProviderFactory()
    return factory.getAvailableProviders().length > 0
  },
  
  generateText: async (prompt: string) => {
    const { result } = await generateText(prompt, { strategy: 'auto' })
    return result
  },
  
  improveText: async (text: string, instructions: string) => {
    const prompt = `Improve the following text based on these instructions: ${instructions}\n\nText: ${text}`
    const { result } = await generateText(prompt, { strategy: 'auto' })
    return result
  }
}

console.log('[AI Service] Multi-provider orchestrator loaded')
console.log('[AI Service] Available providers:', getAIServiceStatus().availableProviders)