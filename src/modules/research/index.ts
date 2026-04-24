/**
 * Investighost - Módulo Research
 * 
 * Propósito: Investigación de destinos y recopilación de información
 * Alcance: Core de investigación - NO implementado en esqueleto
 * Estado: Placeholder - se implementará en bloque posterior
 */

import type { ResearchRequest, ResearchResult } from '@shared/types'

export interface ResearchModule {
  createRequest(input: unknown): Promise<ResearchRequest>
  startResearch(requestId: string): Promise<void>
  getStatus(requestId: string): Promise<ResearchRequest['status']>
  getResult(requestId: string): Promise<ResearchResult | null>
  cancelResearch(requestId: string): Promise<void>
}

// Placeholder para futura implementación
export const researchModule: ResearchModule = {
  createRequest: async () => {
    throw new Error('Research module not implemented in skeleton phase')
  },
  startResearch: async () => {
    throw new Error('Research module not implemented in skeleton phase')
  },
  getStatus: async () => {
    throw new Error('Research module not implemented in skeleton phase')
  },
  getResult: async () => {
    throw new Error('Research module not implemented in skeleton phase')
  },
  cancelResearch: async () => {
    throw new Error('Research module not implemented in skeleton phase')
  },
}

console.log('[Research Module] Placeholder loaded - implementation pending')