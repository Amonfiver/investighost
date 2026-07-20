import { checkLocalSupabase, createLocalSupabaseClientFromEnv } from '@services/supabase'
import type { ManualPersistenceStatus } from '@shared/manual-contracts'
import { GeographicResolver } from './geography'
import { ManualResearchService } from './manual-workflow'
import { SupabaseGeographyCatalogRepository } from './supabase-geography-repository'
import { SupabaseEditorialResearchRepository } from './supabase-repository'

export const MANUAL_LOCAL_ACTOR_ID = '6fda5d08-9cd0-4d9d-98c1-7ccbfd56ad11'
export const MANUAL_CATALOG_VERSION = 'geonames-2026-07-20'

let runtimePromise: Promise<ManualResearchService> | null = null
let status: ManualPersistenceStatus = {
  connected: false,
  target: 'Supabase local',
  simulation: true,
  catalogVersion: MANUAL_CATALOG_VERSION,
  error: 'Supabase local todavía no se ha comprobado para el flujo Manual.',
}

async function initialize(): Promise<ManualResearchService> {
  const { client, config } = createLocalSupabaseClientFromEnv()
  const connection = await checkLocalSupabase(client, config.url)
  status = { ...connection, simulation: true, catalogVersion: MANUAL_CATALOG_VERSION }
  if (!connection.connected) throw new Error(connection.error)
  const repository = new SupabaseEditorialResearchRepository(client)
  const geography = new SupabaseGeographyCatalogRepository(client)
  return new ManualResearchService(repository, new GeographicResolver(geography, MANUAL_CATALOG_VERSION))
}

export async function getManualResearchRuntime(): Promise<ManualResearchService> {
  runtimePromise ??= initialize().catch(error => {
    status = {
      connected: false,
      target: 'Supabase local',
      simulation: true,
      catalogVersion: MANUAL_CATALOG_VERSION,
      error: error instanceof Error ? error.message : String(error),
    }
    runtimePromise = null
    throw new Error(`SUPABASE_LOCAL_UNAVAILABLE: ${status.error}`)
  })
  return runtimePromise
}

export async function getManualPersistenceStatus(): Promise<ManualPersistenceStatus> {
  try { await getManualResearchRuntime() } catch { /* status conserva el fallo controlado */ }
  return status
}
