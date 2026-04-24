/**
 * Investighost - Módulo Research
 * 
 * Propósito: Investigación de destinos y recopilación de información
 * Alcance: Core de investigación - NO implementado en esqueleto
 * Estado: Placeholder - se implementará en bloque posterior
 */

import type { ResearchInput, StructuredData } from '@shared/types'

export interface ResearchModule {
  startResearch(input: ResearchInput): Promise<string> // Returns researchId
  getStatus(researchId: string): Promise<'pending' | 'in_progress' | 'completed'>
  getResults(researchId: string): Promise<StructuredData[]>
  cancelResearch(researchId: string): Promise<void>
}

// Placeholder para futura implementación
export const researchModule: ResearchModule = {
  startResearch: async () => {
    throw new Error('Research module not implemented in skeleton phase')
  },
  getStatus: async () => {
    throw new Error('Research module not implemented in skeleton phase')
  },
  getResults: async () => {
    throw new Error('Research module not implemented in skeleton phase')
  },
  cancelResearch: async () => {
    throw new Error('Research module not implemented in skeleton phase')
  },
}

console.log('[Research Module] Placeholder loaded - implementation pending')