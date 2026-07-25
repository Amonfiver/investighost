import {
  evaluateRealConnectivityPreflight,
  MORELLA_REAL_PILOT_POLICY,
  resolveRealExecutionFeatureFlag,
  type RealConnectivityPreflight,
} from '@modules/real-pipeline'
import { checkLocalSupabase, createLocalSupabaseClientFromEnv } from '@services/supabase'
import { getProviderCenterRuntime } from './provider-center-runtime'

export async function getRealConnectivityPreflightRuntime(): Promise<RealConnectivityPreflight> {
  const providerCenter = (await getProviderCenterRuntime()).snapshot()
  const infrastructure = await inspectLocalInfrastructure()

  return evaluateRealConnectivityPreflight({
    featureEnabled: resolveRealExecutionFeatureFlag(
      process.env.INVESTIGHOST_REAL_EXECUTION_TOKEN,
    ),
    providerCenter,
    destination: MORELLA_REAL_PILOT_POLICY.destination,
    limits: {
      taskBudgetEur: MORELLA_REAL_PILOT_POLICY.initialBudgetEur,
      batchBudgetEur: MORELLA_REAL_PILOT_POLICY.manualExtensionBudgetEur,
      dailyBudgetEur: MORELLA_REAL_PILOT_POLICY.absoluteBudgetEur,
      warningBudgetEur: MORELLA_REAL_PILOT_POLICY.warningBudgetEur,
      manualExtensionBudgetEur: MORELLA_REAL_PILOT_POLICY.manualExtensionBudgetEur,
      absoluteBudgetEur: MORELLA_REAL_PILOT_POLICY.absoluteBudgetEur,
      maxRounds: MORELLA_REAL_PILOT_POLICY.maxRounds,
      maxProviderCalls: 10,
      maxInputTokens: 30_000,
      maxOutputTokens: 10_000,
    },
    infrastructure,
    boundaries: {
      regenerationBlocked: true,
      publicationBlocked: true,
      trawelConnected: false,
      automaticEnabled: false,
    },
  })
}

async function inspectLocalInfrastructure(): Promise<{
  supabaseLocalAvailable: boolean
  ledgerAvailable: boolean
  globalGuardFree: boolean
  activeRealExecutions: number
  providerCalls: number
  reservations: number
  pendingReservations: number
  reservedEur: number
  spentEur: number
}> {
  try {
    const { client, config } = createLocalSupabaseClientFromEnv()
    const localStatus = await checkLocalSupabase(client, config.url)
    if (!localStatus.connected) return unavailableInfrastructure()

    const [
      { error: ledgerError },
      { data: guard, error: guardError },
      { count: activeRealExecutions, error: reservationsError },
      { count: providerCalls, error: providerCallsError },
      { count: reservations, error: reservationCountError },
      { data: connectivityBudget, error: budgetError },
    ] = await Promise.all([
      client.from('provider_calls').select('id', { head: true, count: 'exact' }).limit(1),
      client
        .from('real_execution_guard')
        .select('owner_execution_id,expires_at')
        .eq('guard_name', 'global')
        .maybeSingle(),
      client
        .from('provider_call_reservations')
        .select('id', { head: true, count: 'exact' })
        .in('state', ['reserved', 'started', 'unknown']),
      client
        .from('provider_call_reservations')
        .select('id', { head: true, count: 'exact' }),
      client
        .from('provider_call_reservations')
        .select('id', { head: true, count: 'exact' }),
      client
        .from('real_task_budgets')
        .select('reserved_cost,spent_cost')
        .eq('task_id', 'connectivity-check-10d-task')
        .maybeSingle(),
    ])

    if (
      ledgerError
      || guardError
      || reservationsError
      || providerCallsError
      || reservationCountError
      || budgetError
    ) return {
      supabaseLocalAvailable: true,
      ledgerAvailable: false,
      globalGuardFree: false,
      activeRealExecutions: activeRealExecutions ?? 0,
      providerCalls: providerCalls ?? 0,
      reservations: reservations ?? 0,
      pendingReservations: activeRealExecutions ?? 0,
      reservedEur: Number(connectivityBudget?.reserved_cost ?? 0),
      spentEur: Number(connectivityBudget?.spent_cost ?? 0),
    }

    const guardExpired = guard?.expires_at
      ? new Date(guard.expires_at).getTime() <= Date.now()
      : false
    return {
      supabaseLocalAvailable: true,
      ledgerAvailable: true,
      globalGuardFree: !guard?.owner_execution_id || guardExpired,
      activeRealExecutions: activeRealExecutions ?? 0,
      providerCalls: providerCalls ?? 0,
      reservations: reservations ?? 0,
      pendingReservations: activeRealExecutions ?? 0,
      reservedEur: Number(connectivityBudget?.reserved_cost ?? 0),
      spentEur: Number(connectivityBudget?.spent_cost ?? 0),
    }
  } catch {
    return unavailableInfrastructure()
  }
}

function unavailableInfrastructure() {
  return {
    supabaseLocalAvailable: false,
    ledgerAvailable: false,
    globalGuardFree: false,
    activeRealExecutions: 0,
    providerCalls: 0,
    reservations: 0,
    pendingReservations: 0,
    reservedEur: 0,
    spentEur: 0,
  }
}
