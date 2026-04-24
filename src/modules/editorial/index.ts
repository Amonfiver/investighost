/**
 * Investighost - Módulo Editorial
 * 
 * Propósito: Generación de borradores naturales y agradables
 * Alcance: Transformar ResearchResult en EditorialDraft
 * Estado: Placeholder - se implementará en bloque posterior
 */

import type { ResearchResult, EditorialDraft, Tone } from '@shared/types'

export interface EditorialModule {
  generateDraft(result: ResearchResult, tone?: Tone): Promise<EditorialDraft>
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