/**
 * Investighost - Configuración Drizzle Kit
 * 
 * Propósito: Configuración del CLI de Drizzle para migraciones
 * Alcance: Generación y gestión de esquemas SQLite
 */

import type { Config } from 'drizzle-kit'

export default {
  schema: './src/services/db/schema.ts',
  out: './drizzle/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: './database/investighost.db',
  },
} satisfies Config
