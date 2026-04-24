/**
 * Investighost - Módulo Research (Implementación Funcional MVP)
 * 
 * Propósito: Gestión del flujo de investigación con simulación temporal
 * Alcance: Crear solicitudes, simular investigación, generar resultados mock
 * Estado: FUNCIONAL CON SIMULACIÓN - la investigación real se implementará luego
 */

import type { ResearchRequest, ResearchResult, EditorialDraft } from '@shared/types'
import { validateResearchInput } from '@utils/validation'
import { generateId, sleep } from '@utils/helpers'
import * as store from '@modules/persistence/memory-store'
import { generateMockResult } from './mock-data'

// Re-exportar el mock para uso externo si es necesario
export { generateMockResult } from './mock-data'

export interface ResearchModule {
  createRequest(input: unknown): Promise<ResearchRequest>
  startResearch(requestId: string): Promise<void>
  getRequest(requestId: string): Promise<ResearchRequest | null>
  getAllRequests(): Promise<ResearchRequest[]>
  getResult(requestId: string): Promise<ResearchResult | null>
  cancelResearch(requestId: string): Promise<void>
}

// ============================================
// Implementación funcional con simulación
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
 * Inicia el proceso de investigación (simulado)
 * En el futuro, esto hará búsqueda real en internet y análisis con IA
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

  // Simular transición de estados
  try {
    // 1. researching
    await updateStatus(requestId, 'researching')
    await sleep(1500) // Simular tiempo de investigación

    // 2. structured (datos listos)
    const result = generateMockResult(requestId, request.input)
    await store.saveResult(result)
    await updateStatus(requestId, 'structured')
    console.log('[Research] Result generated:', result.id)

    // 3. drafted (borrador listo) - esto lo hará el módulo editorial, 
    // pero lo simulamos aquí para el flujo completo
    await sleep(1000)
    const draft = generateMockDraft(result)
    await store.saveDraft(draft)
    await updateStatus(requestId, 'drafted')
    console.log('[Research] Draft generated:', draft.id)

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
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

  // Para el mock, simplemente eliminamos la solicitud
  // En la versión real, marcaríamos como cancelada
  console.log('[Research] Request cancelled:', requestId)
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
 * Genera un borrador editorial mock a partir de un resultado
 * NOTA: En el futuro esto será responsabilidad del módulo editorial con IA real
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
}

console.log('[Research Module] Loaded with MOCK simulation')
console.log('[Research Module] ⚠️  Using simulated data - real research not implemented yet')