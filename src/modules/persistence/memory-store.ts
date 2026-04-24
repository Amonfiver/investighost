/**
 * Investighost - Persistencia Temporal en Memoria
 * 
 * Propósito: Almacenamiento temporal mientras SQLite no está operativo
 * Alcance: Solo para desarrollo/demo interna, se sustituirá por SQLite real
 * Estado: TEMPORAL - documentado para reemplazo futuro
 * 
 * NOTA IMPORTANTE: Esta es una solución temporal. Cuando SQLite esté disponible,
 * se reemplazará por la implementación real usando Drizzle ORM.
 */

import type { ResearchRequest, ResearchResult, EditorialDraft } from '@shared/types'

// ============================================
// Store en memoria (se pierde al cerrar la app)
// ============================================

interface MemoryStore {
  requests: Map<string, ResearchRequest>
  results: Map<string, ResearchResult>
  drafts: Map<string, EditorialDraft>
}

const store: MemoryStore = {
  requests: new Map(),
  results: new Map(),
  drafts: new Map(),
}

// ============================================
// Research Requests
// ============================================

export async function saveRequest(request: ResearchRequest): Promise<void> {
  store.requests.set(request.id, { ...request })
}

export async function getRequest(id: string): Promise<ResearchRequest | null> {
  const request = store.requests.get(id)
  return request ? { ...request } : null
}

export async function getAllRequests(): Promise<ResearchRequest[]> {
  return Array.from(store.requests.values())
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
}

export async function updateRequestStatus(
  id: string, 
  status: ResearchRequest['status'],
  errorMessage?: string
): Promise<void> {
  const request = store.requests.get(id)
  if (request) {
    request.status = status
    request.updatedAt = new Date()
    if (errorMessage) request.errorMessage = errorMessage
  }
}

// ============================================
// Research Results
// ============================================

export async function saveResult(result: ResearchResult): Promise<void> {
  store.results.set(result.id, { ...result })
}

export async function getResultByResearchId(researchId: string): Promise<ResearchResult | null> {
  const result = Array.from(store.results.values()).find(r => r.researchId === researchId)
  return result ? { ...result } : null
}

export async function getResult(id: string): Promise<ResearchResult | null> {
  const result = store.results.get(id)
  return result ? { ...result } : null
}

// ============================================
// Editorial Drafts
// ============================================

export async function saveDraft(draft: EditorialDraft): Promise<void> {
  store.drafts.set(draft.id, { ...draft })
}

export async function getDraftByResultId(resultId: string): Promise<EditorialDraft | null> {
  const draft = Array.from(store.drafts.values()).find(d => d.researchResultId === resultId)
  return draft ? { ...draft } : null
}

export async function getDraft(id: string): Promise<EditorialDraft | null> {
  const draft = store.drafts.get(id)
  return draft ? { ...draft } : null
}

export async function updateDraftStatus(
  id: string,
  status: EditorialDraft['status'],
  notes?: string
): Promise<void> {
  const draft = store.drafts.get(id)
  if (draft) {
    draft.status = status
    if (notes) draft.reviewNotes = notes
    if (status === 'approved' || status === 'rejected') {
      draft.reviewedAt = new Date()
    }
  }
}

// ============================================
// Utilidades de depuración
// ============================================

export function clearStore(): void {
  store.requests.clear()
  store.results.clear()
  store.drafts.clear()
  console.log('[MemoryStore] All data cleared')
}

export function getStoreStats(): { requests: number; results: number; drafts: number } {
  return {
    requests: store.requests.size,
    results: store.results.size,
    drafts: store.drafts.size,
  }
}