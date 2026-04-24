/**
 * Investighost - Módulo Editorial
 * 
 * Propósito: Generación de borradores naturales y agradables
 * Alcance: Transformar datos estructurados en texto editorial
 * Estado: Placeholder - se implementará en bloque posterior
 */

import type { StructuredData, EditorialDraft } from '@shared/types'

export interface EditorialModule {
  generateDraft(data: StructuredData, tone?: string): Promise<EditorialDraft>
  improveDraft(draftId: string, feedback: string): Promise<EditorialDraft>
  estimateReadingTime(content: string): number
}

// Placeholder
export const editorialModule: EditorialModule = {
  generateDraft: async () => {
    throw new Error('Editorial module not implemented in skeleton phase')
  },
  improveDraft: async () => {
    throw new Error('Editorial module not implemented in skeleton phase')
  },
  estimateReadingTime: () => 0,
}

console.log('[Editorial Module] Placeholder loaded - implementation pending')