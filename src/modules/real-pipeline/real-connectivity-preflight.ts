import { z } from 'zod'
import {
  ProviderCenterSnapshotSchema,
  type ProviderCenterSnapshot,
} from '@shared/provider-center-contracts'
import {
  REAL_CONNECTIVITY_FX_POLICY,
  REAL_CONNECTIVITY_POLICY,
} from '@shared/real-connectivity-contracts'
import { MORELLA_REAL_PILOT_POLICY } from './real-pilot-gate'

export const RealConnectivityPreflightStatusSchema = z.enum([
  'ready_for_live_connectivity_check',
  'missing_credentials',
  'missing_tariff',
  'unsafe_storage',
  'real_feature_disabled',
  'budget_invalid',
  'provider_inactive',
  'blocked',
])

export const RealConnectivityPreflightInputSchema = z.object({
  featureEnabled: z.boolean(),
  providerCenter: ProviderCenterSnapshotSchema,
  destination: z.string().trim().min(1).max(200),
  limits: z.object({
    taskBudgetEur: z.number().nonnegative(),
    batchBudgetEur: z.number().nonnegative(),
    dailyBudgetEur: z.number().nonnegative(),
    warningBudgetEur: z.number().nonnegative(),
    manualExtensionBudgetEur: z.number().nonnegative(),
    absoluteBudgetEur: z.number().nonnegative(),
    maxRounds: z.number().int().positive(),
    maxProviderCalls: z.number().int().positive(),
    maxInputTokens: z.number().int().positive(),
    maxOutputTokens: z.number().int().positive(),
  }),
  infrastructure: z.object({
    supabaseLocalAvailable: z.boolean(),
    ledgerAvailable: z.boolean(),
    globalGuardFree: z.boolean(),
    activeRealExecutions: z.number().int().nonnegative(),
    providerCalls: z.number().int().nonnegative(),
    reservations: z.number().int().nonnegative(),
    pendingReservations: z.number().int().nonnegative(),
    reservedEur: z.number().nonnegative(),
    spentEur: z.number().nonnegative(),
  }),
  boundaries: z.object({
    regenerationBlocked: z.boolean(),
    publicationBlocked: z.boolean(),
    trawelConnected: z.boolean(),
    automaticEnabled: z.boolean(),
  }),
})

export type RealConnectivityPreflightStatus = z.infer<
  typeof RealConnectivityPreflightStatusSchema
>
export type RealConnectivityPreflightInput = z.infer<
  typeof RealConnectivityPreflightInputSchema
>

export interface RealConnectivityPreflightCheck {
  code: string
  label: string
  status: 'pass' | 'warning' | 'block'
  detail: string
}

export interface RealConnectivityPreflight {
  status: RealConnectivityPreflightStatus
  checks: RealConnectivityPreflightCheck[]
  policy: typeof MORELLA_REAL_PILOT_POLICY
  connectivityPolicy: typeof REAL_CONNECTIVITY_POLICY
  conversionPolicy: typeof REAL_CONNECTIVITY_FX_POLICY
  providerCenter: ProviderCenterSnapshot
  networkCallsPerformed: 0
  researchExecutionAllowed: false
  connectivityActionEnabled: boolean
}

export function evaluateRealConnectivityPreflight(candidate: unknown): RealConnectivityPreflight {
  const input = RealConnectivityPreflightInputSchema.parse(candidate)
  const checks: RealConnectivityPreflightCheck[] = []
  const add = (
    code: string,
    label: string,
    condition: boolean,
    passDetail: string,
    blockDetail: string,
  ) => checks.push({
    code,
    label,
    status: condition ? 'pass' : 'block',
    detail: condition ? passDetail : blockDetail,
  })

  add(
    'safe_storage',
    'Almacenamiento seguro',
    input.providerCenter.secureStorageAvailable,
    'safeStorage está disponible con un backend admitido.',
    'safeStorage no ofrece un backend seguro; las credenciales quedan bloqueadas.',
  )

  for (const providerId of ['tavily', 'openai'] as const) {
    const provider = input.providerCenter.providers.find(entry => entry.id === providerId)
    const name = providerId === 'tavily' ? 'Tavily' : 'OpenAI'
    add(
      `${providerId}_credential`,
      `${name}: credencial`,
      Boolean(provider?.configured),
      'Configurada y cifrada; el valor no se expone.',
      'Credencial ausente.',
    )
    add(
      `${providerId}_active`,
      `${name}: activo`,
      Boolean(provider?.active),
      'Activo como único proveedor de su categoría.',
      'Proveedor inactivo.',
    )
    add(
      `${providerId}_model`,
      `${name}: modelo permitido`,
      Boolean(
        provider?.selectedModel
        && provider.availableModels.includes(provider.selectedModel),
      ),
      `Modelo permitido: ${provider?.selectedModel ?? 'ninguno'}.`,
      'El modelo no pertenece al catálogo permitido.',
    )
    add(
      `${providerId}_tariff`,
      `${name}: tarifa`,
      provider?.tariffStatus === 'current',
      `${provider?.tariffSummary ?? 'Tarifa vigente'} · verificada ${provider?.tariffVerifiedAt ?? ''}.`,
      provider?.tariffStatus === 'stale'
        ? `La tarifa requiere revisión desde ${provider.tariffReviewAfter ?? 'fecha desconocida'}.`
        : 'No existe una tarifa oficial verificada para la selección.',
    )
  }
  const selectedOpenAI = input.providerCenter.providers
    .find(entry => entry.id === 'openai')
    ?.selectedModel
  add(
    'connectivity_model',
    'Modelo de conectividad',
    selectedOpenAI === REAL_CONNECTIVITY_POLICY.openai.model,
    'La única llamada OpenAI usará gpt-5.6-luna.',
    'La prueba exige seleccionar exactamente gpt-5.6-luna.',
  )

  const limits = input.limits
  const budgetsValid = limits.warningBudgetEur <= limits.taskBudgetEur
    && limits.taskBudgetEur <= limits.batchBudgetEur
    && limits.batchBudgetEur <= limits.dailyBudgetEur
    && limits.taskBudgetEur <= limits.manualExtensionBudgetEur
    && limits.manualExtensionBudgetEur <= limits.absoluteBudgetEur
  add(
    'budgets',
    'Presupuestos y límites',
    budgetsValid,
    `Tarea ${limits.taskBudgetEur.toFixed(2)} · lote ${limits.batchBudgetEur.toFixed(2)} · día ${limits.dailyBudgetEur.toFixed(2)} EUR.`,
    'La jerarquía de presupuestos o sus máximos no es válida.',
  )
  add(
    'provider_limits',
    'Límites de proveedor',
    limits.maxRounds === 2
      && limits.maxProviderCalls > 0
      && limits.maxInputTokens > 0
      && limits.maxOutputTokens > 0,
    `${limits.maxRounds} rondas; ${limits.maxProviderCalls} llamadas; ${limits.maxInputTokens}/${limits.maxOutputTokens} tokens entrada/salida.`,
    'Los límites de rondas, llamadas o tokens no están definidos de forma segura.',
  )
  add(
    'destination',
    'Whitelist Morella',
    normalize(input.destination) === MORELLA_REAL_PILOT_POLICY.destinationKey,
    'Morella es el único destino permitido.',
    'El destino está fuera de la whitelist.',
  )
  add(
    'supabase_local',
    'Supabase local',
    input.infrastructure.supabaseLocalAvailable,
    'La persistencia local responde.',
    'Supabase local no está disponible.',
  )
  add(
    'ledger',
    'Ledger durable',
    input.infrastructure.ledgerAvailable,
    'El ledger local está disponible.',
    'El ledger local no está disponible.',
  )
  add(
    'global_guard',
    'Guarda global',
    input.infrastructure.globalGuardFree,
    'La guarda está libre.',
    'La guarda global está ocupada.',
  )
  add(
    'zero_active_executions',
    'Cero ejecuciones reales',
    input.infrastructure.activeRealExecutions === 0,
    'No hay ejecuciones reales activas.',
    `Hay ${input.infrastructure.activeRealExecutions} ejecución(es) real(es) activa(s).`,
  )
  const pristineLedger = input.infrastructure.providerCalls === 0
    && input.infrastructure.reservations === 0
    && input.infrastructure.pendingReservations === 0
    && input.infrastructure.reservedEur === 0
    && input.infrastructure.spentEur === 0
  add(
    'connectivity_history',
    'Prueba única sin historial',
    pristineLedger,
    'Cero llamadas, reservas y gasto reales previos.',
    'Ya existe actividad real; una segunda prueba queda bloqueada.',
  )
  add(
    'connectivity_budget',
    'Presupuesto de conectividad',
    REAL_CONNECTIVITY_POLICY.tavily.reserveEur
      + REAL_CONNECTIVITY_POLICY.openai.reserveEur
      === REAL_CONNECTIVITY_POLICY.budgetEur
      && REAL_CONNECTIVITY_POLICY.maxProviderCalls === 2
      && REAL_CONNECTIVITY_POLICY.maxRetries === 0,
    'Máximo 2 llamadas, 0 reintentos y 0,02 EUR.',
    'La política de conectividad no respeta el límite autorizado.',
  )
  add(
    'conversion',
    'Conversión presupuestaria',
    REAL_CONNECTIVITY_FX_POLICY.usdToEur === 1,
    `1 USD = 1 EUR · ${REAL_CONNECTIVITY_FX_POLICY.version} · decisión conservadora, no bancaria.`,
    'No existe una conversión presupuestaria conservadora y versionada.',
  )
  add(
    'regeneration',
    'Regeneración bloqueada',
    input.boundaries.regenerationBlocked,
    'No se permite regenerar.',
    'La regeneración no está bloqueada.',
  )
  add(
    'publication',
    'Publicación bloqueada',
    input.boundaries.publicationBlocked,
    'No existe publicación real habilitada.',
    'La publicación no está bloqueada.',
  )
  add(
    'trawel',
    'Trawel desconectado',
    !input.boundaries.trawelConnected,
    'Trawel permanece desconectado.',
    'Trawel está conectado.',
  )
  add(
    'automatic',
    'Automatic desconectado',
    !input.boundaries.automaticEnabled,
    'Automatic permanece desconectado.',
    'Automatic está habilitado.',
  )
  add(
    'feature_flag',
    'Feature flag real',
    input.featureEnabled,
    'Feature flag habilitada para una comprobación humana posterior.',
    'Desactivada; no se permite acceder a clientes reales.',
  )

  const status = resolveStatus(checks)
  return {
    status,
    checks,
    policy: MORELLA_REAL_PILOT_POLICY,
    connectivityPolicy: REAL_CONNECTIVITY_POLICY,
    conversionPolicy: REAL_CONNECTIVITY_FX_POLICY,
    providerCenter: input.providerCenter,
    networkCallsPerformed: 0,
    researchExecutionAllowed: false,
    connectivityActionEnabled: status === 'ready_for_live_connectivity_check',
  }
}

function resolveStatus(checks: RealConnectivityPreflightCheck[]): RealConnectivityPreflightStatus {
  const blocked = (code: string) =>
    checks.some(check => check.code === code && check.status === 'block')
  if (blocked('safe_storage')) return 'unsafe_storage'
  if (blocked('tavily_credential') || blocked('openai_credential')) return 'missing_credentials'
  if (blocked('tavily_active') || blocked('openai_active')) return 'provider_inactive'
  if (
    blocked('tavily_tariff')
    || blocked('openai_tariff')
    || blocked('tavily_model')
    || blocked('openai_model')
  ) return 'missing_tariff'
  if (blocked('budgets') || blocked('provider_limits')) return 'budget_invalid'
  if (blocked('feature_flag')) return 'real_feature_disabled'
  if (checks.some(check => check.status === 'block')) return 'blocked'
  return 'ready_for_live_connectivity_check'
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase()
}
