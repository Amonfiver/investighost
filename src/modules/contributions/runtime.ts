import { Sha256ContributionIntegrityService } from './integrity'
import { LocalContributionImportQueue } from './queue'
import { BoundedContributionRetryPolicy } from './retry-policy'
import { MockContributionRemoteSource } from './mock-remote'
import { ContributionImportService } from './import-service'
import { SupabaseContributionRepository } from './supabase-repository'
import { SupabaseContributionFileStore } from './supabase-file-store'
import { SupabaseDurabilityCheckpointService } from './supabase-backup'
import { checkLocalSupabase, createLocalSupabaseClientFromEnv, type SupabaseLocalStatus } from '@services/supabase'

let runtimePromise: Promise<ContributionImportService> | null = null
let status: SupabaseLocalStatus = { connected: false, target: 'Supabase local', error: 'Supabase local todavía no se ha comprobado.' }

async function initialize(): Promise<ContributionImportService> {
  const { client, config } = createLocalSupabaseClientFromEnv()
  status = await checkLocalSupabase(client, config.url)
  if (!status.connected) throw new Error(status.error)
  const repository = new SupabaseContributionRepository(client)
  const integrity = new Sha256ContributionIntegrityService()
  const files = new SupabaseContributionFileStore(client, integrity)
  const source = new MockContributionRemoteSource([
    { remoteId: 'mock-synthetic-suggestion', content: 'Synthetic accessibility information proposal.' },
    { remoteId: 'mock-synthetic-report', sourceType: 'report', content: 'Synthetic schedule verification report.' },
  ], integrity)
  return new ContributionImportService(source, repository, files, integrity,
    new LocalContributionImportQueue(repository), new BoundedContributionRetryPolicy(),
    new SupabaseDurabilityCheckpointService(repository))
}

export async function getContributionImportRuntime(): Promise<ContributionImportService> {
  runtimePromise ??= initialize().catch(error => {
    status = { connected: false, target: 'Supabase local', error: error instanceof Error ? error.message : String(error) }
    runtimePromise = null
    throw new Error(`SUPABASE_LOCAL_UNAVAILABLE: ${status.error}`)
  })
  return runtimePromise
}

export async function getContributionPersistenceStatus(): Promise<SupabaseLocalStatus> {
  try { await getContributionImportRuntime() } catch { /* status contiene el error controlado */ }
  return status
}

