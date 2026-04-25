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

  console.log('[Research] Starting research for:', requestId)
  console.log('[Research] AI available:', isAIResearchAvailable())

  try {
    // 1. researching
    await updateStatus(requestId, 'researching')
    
    if (isAIResearchAvailable()) {
      // Investigar con IA real (Kimi)
      console.log('[Research] Using Kimi for real research...')
      
      const { result, draft, logId, cost } = await researchWithAI(requestId, request.input)
      
      // Guardar resultado
      await store.saveResult(result)
      await updateStatus(requestId, 'structured')
      console.log('[Research] Result from Kimi:', result.id, `(cost: $${cost?.toFixed(4) || 'unknown'})`)
      
      // Guardar borrador
      await store.saveDraft(draft)
      await updateStatus(requestId, 'drafted')
      console.log('[Research] Draft generated:', draft.id, 'log:', logId)
      
    } else {
      // Simulación temporal (cuando no hay Kimi configurado)
      console.log('[Research] No AI configured, using MOCK simulation')
      
      await sleep(1500)
      
      const result = generateMockResult(requestId, request.input)
      await store.saveResult(result)
      await updateStatus(requestId, 'structured')
      console.log('[Research] MOCK Result generated:', result.id)
      
      await sleep(1000)
      const draft = generateMockDraft(result)
      await store.saveDraft(draft)
      await updateStatus(requestId, 'drafted')
      console.log('[Research] MOCK Draft generated:', draft.id)
    }

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[Research] Error during research:', message)
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
console.log('[Research Module] AI configured:', isAIResearchAvailable() ? '✅ YES (Kimi ready)' : '❌ NO (using mock)')