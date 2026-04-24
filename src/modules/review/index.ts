/**
 * Investighost - Módulo Review
 * 
 * Propósito: Interfaz de revisión humana de borradores
 * Alcance: Presentar borradores, recoger feedback, aprobaciones
 * Estado: Placeholder - se implementará en bloque posterior
 */

import type { EditorialDraft } from '@shared/types'

export interface ReviewModule {
  getPendingDrafts(): Promise<EditorialDraft[]>
  submitReview(
    draftId: string, 
    decision: 'approve' | 'reject' | 'request_changes', 
    notes?: string
  ): Promise<void>
  getReviewHistory(limit?: number): Promise<EditorialDraft[]>
}

// Placeholder
export const reviewModule: ReviewModule = {
  getPendingDrafts: async () => [],
  submitReview: async () => {
    throw new Error('Review module not implemented in skeleton phase')
  },
  getReviewHistory: async () => [],
}

console.log('[Review Module] Placeholder loaded - implementation pending')