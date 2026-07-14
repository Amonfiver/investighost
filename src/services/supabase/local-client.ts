import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { parseLocalSupabaseConfig, type LocalSupabaseConfig } from './local-config'

export interface SupabaseLocalStatus { connected: boolean; target: 'Supabase local'; url?: string; error?: string }

export function createLocalSupabaseClient(config: LocalSupabaseConfig): SupabaseClient {
  return createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { 'x-investighost-environment': 'local-only' } },
  })
}

export function createLocalSupabaseClientFromEnv(environment: NodeJS.ProcessEnv = process.env): { client: SupabaseClient; config: LocalSupabaseConfig } {
  const config = parseLocalSupabaseConfig(environment)
  return { client: createLocalSupabaseClient(config), config }
}

export async function checkLocalSupabase(client: SupabaseClient, url?: string): Promise<SupabaseLocalStatus> {
  try {
    const { error } = await client.from('import_batches').select('id', { head: true, count: 'exact' }).limit(1)
    if (error) throw error
    return { connected: true, target: 'Supabase local', url }
  } catch (error) {
    return { connected: false, target: 'Supabase local', url, error: `Supabase local no está disponible: ${error instanceof Error ? error.message : String(error)}` }
  }
}

