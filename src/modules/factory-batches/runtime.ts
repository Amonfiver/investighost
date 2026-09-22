import { GeographicResolver } from '@modules/editorial-pipeline/geography'
import { SupabaseGeographyCatalogRepository } from '@modules/editorial-pipeline/supabase-geography-repository'
import { checkLocalSupabase, createLocalSupabaseClientFromEnv, type SupabaseLocalStatus } from '@services/supabase'
import { DestinationBatchService } from './service'
import { SupabaseDestinationBatchRepository } from './supabase-repository'

export const FACTORY_BATCH_CATALOG_VERSION = 'geonames-2026-07-20'

let runtimePromise: Promise<DestinationBatchService> | null = null
let status: SupabaseLocalStatus = { connected: false, target: 'Supabase local', error: 'Supabase local todavía no se ha comprobado para Factory batches.' }

async function initialize(): Promise<DestinationBatchService> {
  const { client, config } = createLocalSupabaseClientFromEnv()
  status = await checkLocalSupabase(client, config.url)
  if (!status.connected) throw new Error(status.error)
  return new DestinationBatchService(
    new SupabaseDestinationBatchRepository(client),
    new GeographicResolver(new SupabaseGeographyCatalogRepository(client), FACTORY_BATCH_CATALOG_VERSION),
  )
}

export async function getDestinationBatchRuntime(): Promise<DestinationBatchService> {
  runtimePromise ??= initialize().catch(error => {
    status = { connected: false, target: 'Supabase local', error: error instanceof Error ? error.message : String(error) }
    runtimePromise = null
    throw new Error(`SUPABASE_LOCAL_UNAVAILABLE: ${status.error}`)
  })
  return runtimePromise
}

export async function getDestinationBatchPersistenceStatus(): Promise<SupabaseLocalStatus> {
  try { await getDestinationBatchRuntime() } catch { /* status conserva el error controlado */ }
  return status
}
