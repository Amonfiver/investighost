import { z } from 'zod'
import { ProviderCenterSnapshotSchema } from '@shared/provider-center-contracts'
import {
  REAL_EDITORIAL_PILOT_POLICY,
  RealEditorialPilotRecordSchema,
  RealEditorialPreflightSchema,
  type RealEditorialPreflight,
} from '@shared/real-editorial-pilot-contracts'

export const RealEditorialPreflightInputSchema = z.object({
  featureEnabled: z.boolean(),
  providerCenter: ProviderCenterSnapshotSchema,
  repositoryAvailable: z.boolean(),
  budgetValid: z.boolean(),
  connectivityValidated: z.boolean(),
  guardFree: z.boolean(),
  activeExecutions: z.number().int().nonnegative(),
  pendingReservations: z.number().int().nonnegative(),
  humanRequiredCalls: z.number().int().nonnegative(),
  openAIResponsesCapability: z.object({
    sdkVersion: z.string().trim().min(1).max(80),
    status: z.enum([
      'available',
      'sdk_incompatible',
      'client_construction_failed',
      'client_invalid',
      'responses_missing',
      'responses_create_missing',
    ]),
    available: z.boolean(),
  }).refine(
    value => value.available === (value.status === 'available'),
    'La disponibilidad debe coincidir con el estado del SDK',
  ),
  duplicateResolution: z.enum([
    'manual_only_coexists',
    'no_conflict',
    'current_pilot',
    'identical_real_pilot_exists',
    'variant_authorized',
  ]),
  pilot: RealEditorialPilotRecordSchema.optional(),
  boundaries: z.object({
    regenerationBlocked: z.boolean(),
    publicationBlocked: z.boolean(),
    trawelConnected: z.boolean(),
    automaticEnabled: z.boolean(),
  }),
})

export function evaluateRealEditorialPreflight(candidate: unknown): RealEditorialPreflight {
  const input = RealEditorialPreflightInputSchema.parse(candidate)
  const checks: RealEditorialPreflight['checks'] = []
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
    'safeStorage no ofrece un backend seguro.',
  )

  for (const providerId of ['tavily', 'openai'] as const) {
    const provider = input.providerCenter.providers.find(entry => entry.id === providerId)
    const label = providerId === 'tavily' ? 'Tavily' : 'OpenAI'
    add(
      `${providerId}_credential`,
      `${label}: credencial`,
      Boolean(provider?.configured),
      'Credencial cifrada configurada; su valor no se expone.',
      'Falta la credencial cifrada.',
    )
    add(
      `${providerId}_active`,
      `${label}: proveedor activo`,
      Boolean(provider?.active),
      'Proveedor activo en su categoría.',
      'El proveedor está inactivo.',
    )
    add(
      `${providerId}_tariff`,
      `${label}: tarifa vigente`,
      provider?.tariffStatus === 'current',
      provider?.tariffSummary ?? 'Tarifa vigente.',
      'La tarifa no está vigente.',
    )
  }

  const openAI = input.providerCenter.providers.find(entry => entry.id === 'openai')
  add(
    'openai_model',
    'Modelo OpenAI',
    openAI?.selectedModel === REAL_EDITORIAL_PILOT_POLICY.providers.model,
    'gpt-5.6-luna seleccionado.',
    'El piloto exige exactamente gpt-5.6-luna.',
  )
  add(
    'openai_responses_sdk',
    'OpenAI Responses',
    input.openAIResponsesCapability.available
      && input.openAIResponsesCapability.status === 'available',
    `SDK ${input.openAIResponsesCapability.sdkVersion}: responses.create disponible localmente.`,
    openAICapabilityBlockDetail(input.openAIResponsesCapability),
  )
  add(
    'connectivity_validated',
    'Conectividad previa',
    input.connectivityValidated,
    'La prueba 10D conserva una llamada Tavily y una OpenAI conciliadas.',
    'No existe evidencia durable de conectividad para ambos proveedores.',
  )
  add(
    'conversion',
    'Conversión presupuestaria',
    REAL_EDITORIAL_PILOT_POLICY.usdToEur === 1,
    `${REAL_EDITORIAL_PILOT_POLICY.fxPolicyVersion}: 1 USD = 1 EUR.`,
    'La conversión editorial no coincide con la política autorizada.',
  )
  add(
    'repository',
    'Repositorio durable',
    input.repositoryAvailable,
    'Repositorio, checkpoints, artefactos y eventos disponibles.',
    'La persistencia editorial real no está disponible.',
  )
  add(
    'budget',
    'Presupuesto propio Morella',
    input.budgetValid,
    'Presupuesto de tarea, lote y día confirmado en 0,20 EUR.',
    'El piloto todavía no tiene un presupuesto durable confirmado y válido.',
  )
  add(
    'guard',
    'Guarda editorial',
    input.guardFree,
    'La guarda editorial independiente está libre.',
    'La guarda editorial está ocupada.',
  )
  add(
    'active_executions',
    'Ejecuciones editoriales activas',
    input.activeExecutions === 0,
    'No hay otra ejecución editorial real activa.',
    `Hay ${input.activeExecutions} ejecución(es) editorial(es) activa(s).`,
  )
  add(
    'pending_reservations',
    'Reservas pendientes',
    input.pendingReservations === 0,
    'No hay reservas editoriales pendientes.',
    `Hay ${input.pendingReservations} reserva(s) pendiente(s).`,
  )
  add(
    'human_required_calls',
    'Decisiones remotas pendientes',
    input.humanRequiredCalls === 0,
    'No hay llamadas remotas que requieran resolución humana.',
    `Hay ${input.humanRequiredCalls} llamada(s) bloqueada(s) por consumo ambiguo.`,
  )

  const duplicateResolved = input.duplicateResolution !== 'identical_real_pilot_exists'
  add(
    'duplicate',
    'Coexistencia y duplicados',
    duplicateResolved,
    duplicateDetail(input.duplicateResolution),
    'Ya existe otro piloto real con la misma identidad; no se sobrescribirá.',
  )
  add(
    'destination',
    'Whitelist Morella',
    input.pilot
      ? input.pilot.normalizedDestination === REAL_EDITORIAL_PILOT_POLICY.normalizedDestination
        && input.pilot.countryCode === REAL_EDITORIAL_PILOT_POLICY.countryCode
        && input.pilot.destinationType === REAL_EDITORIAL_PILOT_POLICY.destinationType
      : true,
    'Destino canónico Morella, ES, localidad.',
    'La identidad territorial no coincide con la whitelist.',
  )
  add(
    'rounds',
    'Máximo dos rondas',
    REAL_EDITORIAL_PILOT_POLICY.maxRounds === 2,
    'La política no permite una tercera ronda.',
    'El máximo de rondas no es seguro.',
  )
  add(
    'regeneration',
    'Regeneración automática',
    input.boundaries.regenerationBlocked,
    'Regeneraciones automáticas deshabilitadas.',
    'La regeneración automática no está bloqueada.',
  )
  add(
    'publication',
    'Publicación',
    input.boundaries.publicationBlocked,
    'Publicación bloqueada.',
    'La publicación no está bloqueada.',
  )
  add(
    'trawel',
    'Trawel',
    !input.boundaries.trawelConnected,
    'Trawel desconectado.',
    'Trawel está conectado.',
  )
  add(
    'automatic',
    'Automatic',
    !input.boundaries.automaticEnabled,
    'Automatic desconectado.',
    'Automatic está activo.',
  )
  add(
    'feature_flag',
    'Feature flag editorial',
    input.featureEnabled,
    'Feature flag exclusiva del piloto habilitada.',
    'Desactivada; la preparación es visible, pero iniciar sigue bloqueado.',
  )

  const status = resolveEditorialStatus(checks)
  const ready = status === 'ready_for_real_editorial_pilot'
  return RealEditorialPreflightSchema.parse({
    status,
    checks,
    policy: REAL_EDITORIAL_PILOT_POLICY,
    pilot: input.pilot,
    repositoryAvailable: input.repositoryAvailable,
    duplicateResolution: input.duplicateResolution,
    researchExecutionAllowed: ready,
    startActionEnabled: ready,
    networkCallsPerformed: 0,
  })
}

function resolveEditorialStatus(
  checks: RealEditorialPreflight['checks'],
): RealEditorialPreflight['status'] {
  const blocked = (code: string) =>
    checks.some(check => check.code === code && check.status === 'block')
  if (blocked('safe_storage')) return 'unsafe_storage'
  if (blocked('tavily_credential') || blocked('openai_credential')) return 'missing_credentials'
  if (blocked('tavily_active') || blocked('openai_active')) return 'provider_inactive'
  if (blocked('tavily_tariff') || blocked('openai_tariff') || blocked('openai_model')) {
    return 'missing_tariff'
  }
  if (blocked('repository')) return 'repository_unavailable'
  if (blocked('duplicate')) return 'duplicate_requires_resolution'
  if (blocked('budget') || blocked('conversion')) return 'budget_invalid'
  if (blocked('feature_flag')) return 'real_feature_disabled'
  if (checks.some(check => check.status === 'block')) return 'blocked'
  return 'ready_for_real_editorial_pilot'
}

function duplicateDetail(
  value: z.infer<typeof RealEditorialPreflightInputSchema>['duplicateResolution'],
): string {
  if (value === 'manual_only_coexists') {
    return 'Las solicitudes Manual históricas coexisten sin reutilizarse ni sobrescribirse.'
  }
  if (value === 'current_pilot') return 'El preflight corresponde al piloto preparado actual.'
  if (value === 'variant_authorized') return 'La variante tiene identidad humana autorizada distinta.'
  return 'No existe otro piloto real con la misma identidad.'
}

function openAICapabilityBlockDetail(
  value: z.infer<typeof RealEditorialPreflightInputSchema>['openAIResponsesCapability'],
): string {
  const prefix = `SDK ${value.sdkVersion}:`
  if (value.status === 'sdk_incompatible' || value.status === 'responses_missing') {
    return `${prefix} no expone el recurso Responses.`
  }
  if (value.status === 'responses_create_missing') {
    return `${prefix} Responses no expone el método create.`
  }
  if (value.status === 'client_construction_failed') {
    return `${prefix} el cliente no pudo construirse durante el preflight sin red.`
  }
  return `${prefix} el cliente tiene una estructura incompatible.`
}
