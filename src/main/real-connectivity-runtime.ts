import {
  LiveRealConnectivityNetwork,
  RealConnectivityCheckService,
  SupabaseConnectivityLedger,
} from '@modules/real-pipeline'
import type { RealConnectivityResult } from '@shared/real-connectivity-contracts'
import { createLocalSupabaseClientFromEnv } from '@services/supabase'
import { getProviderCenterRuntime } from './provider-center-runtime'
import { getRealConnectivityPreflightRuntime } from './real-connectivity-preflight-runtime'

export async function executeRealConnectivityCheck(
  authorization: unknown,
): Promise<RealConnectivityResult> {
  const preflight = await getRealConnectivityPreflightRuntime()
  if (
    preflight.status !== 'ready_for_live_connectivity_check'
    || !preflight.connectivityActionEnabled
  ) {
    throw new Error('El preflight no autoriza la prueba real de conectividad')
  }
  const featureToken = process.env.INVESTIGHOST_REAL_EXECUTION_TOKEN
  if (!featureToken) throw new Error('La feature flag real no está disponible')

  const { client } = createLocalSupabaseClientFromEnv()
  const providerCenter = await getProviderCenterRuntime()
  const service = new RealConnectivityCheckService(
    new SupabaseConnectivityLedger(client, dateInMadrid(new Date())),
    new LiveRealConnectivityNetwork(providerCenter, featureToken),
  )
  return service.execute(authorization)
}

function dateInMadrid(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(item => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}
