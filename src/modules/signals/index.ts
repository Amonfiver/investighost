/**
 * Investighost - Módulo Signals
 * 
 * Propósito: Recopilación y análisis de señales útiles (fuentes, menciones)
 * Alcance: Detección de información relevante de fuentes externas
 * Estado: Placeholder - se implementará en bloque posterior
 */

import type { Source } from '@shared/types'

export interface SignalsModule {
  collectFromQuery(query: string): Promise<Source[]>
  verifySource(sourceId: string): Promise<boolean>
  scoreReliability(source: Source): number
}

// Placeholder
export const signalsModule: SignalsModule = {
  collectFromQuery: async () => {
    throw new Error('Signals module not implemented in skeleton phase')
  },
  verifySource: async () => {
    throw new Error('Signals module not implemented in skeleton phase')
  },
  scoreReliability: () => 0.5,
}

console.log('[Signals Module] Placeholder loaded - implementation pending')