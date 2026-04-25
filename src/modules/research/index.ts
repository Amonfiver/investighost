/**
 * Investighost - Módulo Research (Integración Real con Kimi)
 * 
 * Propósito: Gestión del flujo de investigación con soporte para IA real
 * Alcance: Crear solicitudes, investigar con Kimi o simular, generar resultados
 * Estado: INTEGRADO CON KIMI - usa investigación real cuando hay API key
 * 
 * NOTA: Si no hay Kimi configurado, mantiene simulación con mensaje claro
 */

import type { ResearchRequest, ResearchResult, EditorialDraft } from '@shared/types'
import { validateResearchInput } from '@utils/validation'
import { generateId, sleep } from '@utils/helpers'
import * as store from '@modules/persistence/memory-store'
import { generateMockResult } from './mock-data'
import { researchWithAI, isAIResearchAvailable } from '@services/ai/research'
import { getProviderFactory } from '@services/ai/providers'

// Re-exportar el mock para uso externo si es necesario
export { generateMockResult } from './mock-data'
export { isAIResearchAvailable } from '@services/ai/research'

export interface ResearchModule {
  createRequest(input: unknown): Promise<ResearchRequest>
  startResearch(requestId: string): Promise<void>
  getRequest(requestId: string): Promise<ResearchRequest | null>
  getAllRequests(): Promise<ResearchRequest[]>
  getResult(requestId: string): Promise<ResearchResult | null>
  cancelResearch(requestId: string): Promise<void>
  isAIConfigured(): boolean
}

// ============================================
// Implementación con soporte IA real
// ============================================

/**
 * Crea una nueva solicitud de investigación
 */
async function createRequest(input: unknown): Promise<ResearchRequest> {
  // Validar input
  const validation = validateResearchInput(input)
  if (!validation.success) {
    throw new Error(`Invalid input: ${validation.errors.join(', ')}`)
  }

  const now = new Date()
  const request: ResearchRequest = {
    id: generateId(),
    input: validation.data,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  }

  // Guardar en persistencia temporal
  await store.saveRequest(request)
  console.log('[Research] Request created:', request.id)

  return request
}

/**
 * Inicia el proceso de investigación
 * Usa Kimi si está configurado, simulación si no
 */
async function startResearch(requestId: string): Promise<void> {
  const request = await store.getRequest(requestId)
  if (!request) {
    throw new Error(`Request not found: ${requestId}`)
  }

  if (request.status !== 'pending') {
    throw new Error(`Cannot start research from status: ${request.status}`)
  }

  console.log('🔍 [Research] Starting research for:', requestId)
  console.log('🔍 [Research] Input:', JSON.stringify(request.input))
  
  // Verificación detallada de disponibilidad de IA
  const aiAvailable = isAIResearchAvailable()
  console.log('🔍 [Research] isAIResearchAvailable():', aiAvailable)
  
  // Verificar estado de provider factory directamente
  try {
    const factory = getProviderFactory()
    const availableProviders = factory.getAvailableProviders()
    console.log('🔍 [Research] Available providers:', availableProviders)
    console.log('🔍 [Research] Factory health:', factory.getHealthStatus())
  } catch (e) {
    console.error('🔍 [Research] Error checking provider factory:', e)
  }

  try {
    // 1. researching
    await updateStatus(requestId, 'researching')
    
    if (aiAvailable) {
      // Investigar con IA real (Kimi)
      console.log('✅ [Research] USING REAL KIMI - Generating honest research...')

      try {
        const { result, draft, logId, cost } = await researchWithAI(requestId, request.input)
        
        console.log('✅ [Research] Kimi result confidence:', result.confidence)
        console.log('✅ [Research] Kimi result places count:', result.places.length)
        console.log('✅ [Research] Kimi result sources:', result.sources.map(s => s.title))
        
        // Guardar resultado
        await store.saveResult(result)
        await updateStatus(requestId, 'structured')
        console.log('✅ [Research] Result from Kimi saved:', result.id, `(cost: $${cost?.toFixed(4) || 'unknown'})`)
        
        // Guardar borrador
        await store.saveDraft(draft)
        await updateStatus(requestId, 'drafted')
        console.log('✅ [Research] Honest draft saved:', draft.id, 'log:', logId)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        console.error('❌ [Research] failed:', message)
        throw error
      }
      
    } else {
      // Simulación temporal (cuando no hay Kimi configurado)
      console.log('⚠️ [Research] KIMI_API_KEY not configured - using explicit MOCK simulation')
      await runMockFallback(requestId, request.input, 'No AI provider configured')
    }

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('❌ [Research] Error during research:', message)
    await updateStatus(requestId, 'error', message)
    throw error
  }
}

/**
 * Obtiene una solicitud por ID
 */
async function getRequest(requestId: string): Promise<ResearchRequest | null> {
  return store.getRequest(requestId)
}

/**
 * Lista todas las solicitudes ordenadas por fecha
 */
async function getAllRequests(): Promise<ResearchRequest[]> {
  return store.getAllRequests()
}

/**
 * Obtiene el resultado de una investigación
 */
async function getResult(requestId: string): Promise<ResearchResult | null> {
  return store.getResultByResearchId(requestId)
}

/**
 * Cancela una investigación pendiente
 */
async function cancelResearch(requestId: string): Promise<void> {
  const request = await store.getRequest(requestId)
  if (!request) {
    throw new Error(`Request not found: ${requestId}`)
  }

  if (request.status !== 'pending') {
    throw new Error(`Cannot cancel research with status: ${request.status}`)
  }

  console.log('[Research] Request cancelled:', requestId)
}

/**
 * Verifica si la IA está configurada
 */
function isAIConfigured(): boolean {
  return isAIResearchAvailable()
}

// ============================================
// Helpers internos
// ============================================

async function updateStatus(
  requestId: string, 
  status: ResearchRequest['status'],
  errorMessage?: string
): Promise<void> {
  await store.updateRequestStatus(requestId, status, errorMessage)
}

async function runMockFallback(
  requestId: string,
  input: ResearchRequest['input'],
  reason: string
): Promise<void> {
  console.log('⚠️ [Research] MOCK fallback reason:', reason)
  
  await sleep(1500)
  
  const result = generateMockResult(requestId, input)
  result.sources = [{
    id: generateId(),
    url: 'internal://mock-fallback',
    title: `SIMULACION/FALLBACK - ${reason}`,
    type: 'other',
    reliability: 0.2,
    accessedAt: new Date(),
  }]
  result.confidence = Math.min(result.confidence, 0.6)
  console.log('⚠️ [Research] MOCK result generated with confidence:', result.confidence)
  console.log('⚠️ [Research] MOCK sources:', result.sources.map(s => s.title))
  
  await store.saveResult(result)
  await updateStatus(requestId, 'structured')
  console.log('⚠️ [Research] MOCK Result saved:', result.id)
  
  await sleep(1000)
  const draft = generateMockDraft(result)
  await store.saveDraft(draft)
  await updateStatus(requestId, 'drafted')
  console.log('⚠️ [Research] MOCK Draft saved:', draft.id)
}

/**
 * Genera un borrador editorial mock (para modo simulación)
 */
function generateMockDraft(result: ResearchResult): EditorialDraft {
  const { destination, summary, places, activities, tips } = result
  
  const sections = [
    {
      id: generateId(),
      heading: 'Descubre el lugar',
      content: result.destination.description,
      order: 0,
    },
    {
      id: generateId(),
      heading: 'Lugares imprescindibles',
      content: places.map(p => `**${p.name}**: ${p.description} ${p.whyVisit}`).join('\n\n'),
      order: 1,
    },
    {
      id: generateId(),
      heading: 'Experiencias recomendadas',
      content: activities.map(a => `**${a.name}** (${a.duration}): ${a.description}`).join('\n\n'),
      order: 2,
    },
    {
      id: generateId(),
      heading: 'Consejos prácticos',
      content: tips.map(t => `• ${t}`).join('\n'),
      order: 3,
    },
  ]

  const wordCount = sections.reduce((acc, s) => acc + s.content.split(/\s+/).length, 0)

  return {
    id: generateId(),
    researchResultId: result.id,
    title: `Guía de viaje: ${destination.region}, ${destination.country}`,
    introduction: summary,
    sections,
    tone: 'friendly',
    language: 'es',
    status: 'ready',
    wordCount,
    generatedAt: new Date(),
  }
}

// ============================================
// Export del módulo
// ============================================

export const researchModule: ResearchModule = {
  createRequest,
  startResearch,
  getRequest,
  getAllRequests,
  getResult,
  cancelResearch,
  isAIConfigured,
}

console.log('[Research Module] Loaded')
