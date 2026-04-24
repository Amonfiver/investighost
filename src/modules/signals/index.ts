/**
 * Investighost - Módulo Signals
 * 
 * Propósito: Recopilación y análisis de señales útiles
 * Alcance: Detección de menciones, reviews, contenido relevante
 * Estado: Placeholder - se implementará en bloque posterior
 */

import type { Signal, Source } from '@shared/types'

export interface SignalsModule {
  collectSignals(query: string): Promise<Signal[]>
  verifySignal(signalId: string): Promise<boolean>
  scoreSource(source: Source): number
}

// Placeholder
export const signalsModule: SignalsModule = {
  collectSignals: async () => {
    throw new Error('Signals module not implemented in skeleton phase')
  },
  verifySignal: async () => {
    throw new Error('Signals module not implemented in skeleton phase')
  },
  scoreSource: () => 0,
}

console.log('[Signals Module] Placeholder loaded - implementation pending')