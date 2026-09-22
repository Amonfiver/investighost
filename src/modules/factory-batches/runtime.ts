import { GeographicResolver } from '@modules/editorial-pipeline/geography'
import { SupabaseGeographyCatalogRepository } from '@modules/editorial-pipeline/supabase-geography-repository'
import { checkLocalSupabase, createLocalSupabaseClientFromEnv, type SupabaseLocalStatus } from '@services/supabase'
import { DestinationBatchService } from './service'
import { SupabaseDestinationBatchRepository } from './supabase-repository'
import { EditorialBatchWorker } from './editorial-batch-worker'
import type { BatchEditorialPhasePort } from './editorial-phase-port'

export const FACTORY_BATCH_CATALOG_VERSION = 'geonames-2026-07-20'

let runtimePromise: Promise<DestinationBatchService> | null = null
let configuredPhasePort: BatchEditorialPhasePort | null = null
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

/**
 * Main-process composition hook. The real-pipeline runtime injects its existing
 * research/analysis/draft/review/visual delegates here; this module never
 * creates a second provider pipeline or substitutes simulated editorial work.
 */
export function configureDestinationBatchWorkerPhasePort(port: BatchEditorialPhasePort): void {
  configuredPhasePort = port
}

export async function getDestinationBatchWorkerRuntime(): Promise<EditorialBatchWorker> {
  if (!configuredPhasePort) {
    throw new Error('FACTORY_BATCH_WORKER_NOT_CONFIGURED: falta la composición autorizada de los servicios editoriales reales.')
  }
  await getDestinationBatchRuntime()
  // The repository is intentionally shared with import/retry; no parallel queue is introduced.
  const repository = new SupabaseDestinationBatchRepository(createLocalSupabaseClientFromEnv().client)
  return new EditorialBatchWorker(repository, configuredPhasePort)
}
