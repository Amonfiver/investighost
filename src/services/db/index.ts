/**
 * Investighost - Servicio Database
 * 
 * Propósito: Capa de acceso a datos con Drizzle ORM
 * Alcance: Gestión de conexión SQLite y operaciones CRUD
 * Estado: Preparado pero no activo - requiere build tools nativas
 */

import type { SQL } from 'drizzle-orm'

// Esquemas de Drizzle (preparados para cuando se active SQLite)
// Por ahora solo definiciones, sin instanciar better-sqlite3

export interface DatabaseService {
  isConnected(): boolean
  connect(dbPath: string): Promise<void>
  disconnect(): Promise<void>
  query<T>(sql: SQL): Promise<T[]>
}

// Placeholder - better-sqlite3 requiere Visual Studio Build Tools en Windows
export const dbService: DatabaseService = {
  isConnected: () => false,
  connect: async () => {
    console.error('[DB] Cannot connect: better-sqlite3 requires native build tools')
    console.error('[DB] Install: Visual Studio Build Tools with "Desktop development with C++" workload')
    throw new Error('Database connection failed - native dependencies missing')
  },
  disconnect: async () => {
    // No-op
  },
  query: async () => {
    throw new Error('Database not connected')
  },
}

// Exportar esquemas preparados (sin instanciar aún)
export * as schema from './schema'

console.log('[DB Service] Drizzle ORM prepared - SQLite activation pending build tools')