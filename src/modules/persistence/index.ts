/**
 * Investighost - Módulo Persistence
 * 
 * Propósito: Abstracción de la capa de persistencia
 * Alcance: Gestión de datos entre memoria, SQLite y futuros servicios
 * Estado: Placeholder - SQLite requiere build tools nativas en Windows
 */

export interface PersistenceModule {
  isConnected(): boolean
  connect(): Promise<void>
  disconnect(): Promise<void>
  healthCheck(): Promise<{ ok: boolean; details: string }>
}

// Placeholder - SQLite requiere configuración adicional de build tools
export const persistenceModule: PersistenceModule = {
  isConnected: () => false,
  connect: async () => {
    console.log('[Persistence] SQLite connection requires native build tools')
    console.log('[Persistence] Install Visual Studio Build Tools with "Desktop development with C++" workload')
    throw new Error('SQLite not available in skeleton phase')
  },
  disconnect: async () => {
    // No-op
  },
  healthCheck: async () => ({
    ok: false,
    details: 'SQLite not connected - native build tools required for better-sqlite3',
  }),
}

console.log('[Persistence Module] Placeholder loaded - SQLite pending build tools setup')