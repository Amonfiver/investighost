import { z } from 'zod'
import {
  ProviderCenterSnapshotSchema,
  type ProviderCenterSnapshot,
} from '@shared/provider-center-contracts'

export const MORELLA_REAL_PILOT_POLICY = {
  destination: 'Morella',
  destinationKey: 'morella',
  maxTasks: 1,
  maxConcurrency: 1,
  initialBudgetEur: 0.20,
  warningBudgetEur: 0.16,
  manualExtensionBudgetEur: 0.25,
  absoluteBudgetEur: 0.50,
  maxRounds: 2,
  maxRegenerations: 0,
  maxPublications: 0,
  providers: {
    research: 'tavily',
    intelligence: 'openai',
  },
} as const

export const REAL_EXECUTION_FEATURE_TOKEN = 'morella-one-shot-authorized'

export function resolveRealExecutionFeatureFlag(value?: string): boolean {
  return value === REAL_EXECUTION_FEATURE_TOKEN
}

const ProbeStateSchema = z.enum(['ok', 'failed', 'not_checked'])
const BalanceStateSchema = z.enum(['sufficient', 'insufficient', 'not_consultable'])

export const MorellaPilotPreflightInputSchema = z.object({
  featureEnabled: z.boolean().default(false),
  destination: z.string().trim().min(1).max(200),
  requestedTasks: z.number().int().positive(),
  requestedConcurrency: z.number().int().positive(),
  requestedBudgetEur: z.number().positive(),
  manualBudgetExtensionApproved: z.boolean().default(false),
  requestedRounds: z.number().int().positive(),
  requestedRegenerations: z.number().int().nonnegative(),
  requestedPublications: z.number().int().nonnegative(),
  providerCenter: ProviderCenterSnapshotSchema,
  realConnections: z.object({
    tavily: ProbeStateSchema,
    openai: ProbeStateSchema,
  }),
  tariffsReady: z.object({
    tavily: z.boolean(),
    openai: z.boolean(),
  }),
  budgetPersisted: z.boolean(),
  balances: z.object({
    tavily: BalanceStateSchema,
    openai: BalanceStateSchema,
  }),
  supabase: ProbeStateSchema,
  ledger: ProbeStateSchema,
  globalGuard: z.enum(['available', 'busy', 'not_checked']),
  activeRealTasks: z.union([z.number().int().nonnegative(), z.literal('not_checked')]),
})

export type MorellaPilotPreflightInput = z.infer<typeof MorellaPilotPreflightInputSchema>
export type PilotGateStatus = 'pass' | 'warning' | 'block'

export interface PilotGateCheck {
  code: string
  label: string
  status: PilotGateStatus
  detail: string
}

export interface MorellaPilotPreflight {
  ready: boolean
  featureEnabled: boolean
  policy: typeof MORELLA_REAL_PILOT_POLICY
  checks: PilotGateCheck[]
}

export function evaluateMorellaPilotPreflight(candidate: unknown): MorellaPilotPreflight {
  const input = MorellaPilotPreflightInputSchema.parse(candidate)
  const checks: PilotGateCheck[] = []
  const add = (code: string, label: string, status: PilotGateStatus, detail: string) => {
    checks.push({ code, label, status, detail })
  }
  const passOrBlock = (
    condition: boolean,
    code: string,
    label: string,
    passDetail: string,
    blockDetail: string,
  ) => add(code, label, condition ? 'pass' : 'block', condition ? passDetail : blockDetail)

  passOrBlock(
    input.featureEnabled,
    'feature_flag',
    'Feature flag real',
    'Habilitada con el token explícito de un solo piloto.',
    'Desactivada por defecto; no se puede ejecutar ninguna llamada real.',
  )
  passOrBlock(
    normalizeDestination(input.destination) === MORELLA_REAL_PILOT_POLICY.destinationKey,
    'destination_whitelist',
    'Whitelist de destino',
    'Morella es el único destino admitido.',
    'Solo Morella está autorizada para este piloto.',
  )
  passOrBlock(
    input.requestedTasks === MORELLA_REAL_PILOT_POLICY.maxTasks,
    'single_task',
    'Una sola tarea',
    'La ejecución contiene exactamente una tarea.',
    'El piloto admite exactamente una tarea.',
  )
  passOrBlock(
    input.requestedConcurrency === MORELLA_REAL_PILOT_POLICY.maxConcurrency,
    'concurrency',
    'Concurrencia 1',
    'No habrá llamadas concurrentes.',
    'La concurrencia debe ser exactamente 1.',
  )

  const withinAbsoluteLimit = input.requestedBudgetEur <= MORELLA_REAL_PILOT_POLICY.absoluteBudgetEur
  const withinPilotLimit = input.requestedBudgetEur <= MORELLA_REAL_PILOT_POLICY.initialBudgetEur
    || (
      input.manualBudgetExtensionApproved
      && input.requestedBudgetEur <= MORELLA_REAL_PILOT_POLICY.manualExtensionBudgetEur
    )
  passOrBlock(
    withinAbsoluteLimit && withinPilotLimit,
    'budget',
    'Presupuesto',
    `${input.requestedBudgetEur.toFixed(2)} EUR dentro del límite autorizado.`,
    input.requestedBudgetEur > MORELLA_REAL_PILOT_POLICY.absoluteBudgetEur
      ? 'Supera el límite absoluto de 0,50 EUR.'
      : 'Supera 0,20 EUR sin ampliación humana válida, o excede el máximo ampliado de 0,25 EUR.',
  )
  add(
    'budget_warning',
    'Umbral de aviso',
    input.requestedBudgetEur >= MORELLA_REAL_PILOT_POLICY.warningBudgetEur ? 'warning' : 'pass',
    input.requestedBudgetEur >= MORELLA_REAL_PILOT_POLICY.warningBudgetEur
      ? 'El presupuesto alcanza el aviso preventivo de 0,16 EUR.'
      : 'El presupuesto queda por debajo del aviso preventivo.',
  )
  passOrBlock(
    input.requestedRounds === MORELLA_REAL_PILOT_POLICY.maxRounds,
    'rounds',
    'Máximo de rondas',
    'El flujo queda limitado a dos rondas.',
    'El piloto exige un máximo literal de dos rondas.',
  )
  passOrBlock(
    input.requestedRegenerations === MORELLA_REAL_PILOT_POLICY.maxRegenerations,
    'regeneration',
    'Regeneración',
    'Regeneraciones desactivadas.',
    'El piloto no admite regeneración.',
  )
  passOrBlock(
    input.requestedPublications === MORELLA_REAL_PILOT_POLICY.maxPublications,
    'publication',
    'Publicación',
    'Publicación desactivada.',
    'El piloto no admite publicación.',
  )

  addProviderChecks(input, checks, 'tavily', 'Tavily')
  addProviderChecks(input, checks, 'openai', 'OpenAI')
  passOrBlock(
    input.tariffsReady.tavily && input.tariffsReady.openai,
    'tariffs',
    'Tarifas',
    'Tarifas versionadas verificadas para ambos proveedores.',
    'Falta verificar al menos una tarifa versionada.',
  )
  passOrBlock(
    input.budgetPersisted,
    'budget_persisted',
    'Presupuesto durable',
    'El presupuesto está persistido antes de ejecutar.',
    'El presupuesto todavía no está persistido.',
  )

  for (const provider of ['tavily', 'openai'] as const) {
    const balance = input.balances[provider]
    add(
      `${provider}_balance`,
      `Saldo ${provider === 'tavily' ? 'Tavily' : 'OpenAI'}`,
      balance === 'insufficient' ? 'block' : balance === 'not_consultable' ? 'warning' : 'pass',
      balance === 'sufficient'
        ? 'Saldo suficiente confirmado.'
        : balance === 'insufficient'
          ? 'Saldo insuficiente; la ejecución queda bloqueada.'
          : 'El proveedor no permite consultar saldo automáticamente; requiere comprobación humana.',
    )
  }

  addProbe(checks, 'supabase', 'Supabase', input.supabase)
  addProbe(checks, 'ledger', 'Ledger durable', input.ledger)
  add(
    'global_guard',
    'Guarda global',
    input.globalGuard === 'available' ? 'pass' : 'block',
    input.globalGuard === 'available'
      ? 'La guarda global está disponible.'
      : input.globalGuard === 'busy'
        ? 'La guarda global está ocupada.'
        : 'La guarda global no se ha comprobado.',
  )
  passOrBlock(
    input.activeRealTasks === 0,
    'zero_active_tasks',
    'Tareas reales activas',
    'No existe ninguna tarea real activa.',
    input.activeRealTasks === 'not_checked'
      ? 'No se ha comprobado si existen tareas reales activas.'
      : `Hay ${input.activeRealTasks} tarea(s) real(es) activa(s).`,
  )

  return {
    ready: checks.every(check => check.status !== 'block'),
    featureEnabled: input.featureEnabled,
    policy: MORELLA_REAL_PILOT_POLICY,
    checks,
  }
}

export function createClosedMorellaPilotPreflight(
  providerCenter: ProviderCenterSnapshot,
): MorellaPilotPreflight {
  return evaluateMorellaPilotPreflight({
    featureEnabled: resolveRealExecutionFeatureFlag(),
    destination: MORELLA_REAL_PILOT_POLICY.destination,
    requestedTasks: MORELLA_REAL_PILOT_POLICY.maxTasks,
    requestedConcurrency: MORELLA_REAL_PILOT_POLICY.maxConcurrency,
    requestedBudgetEur: MORELLA_REAL_PILOT_POLICY.initialBudgetEur,
    manualBudgetExtensionApproved: false,
    requestedRounds: MORELLA_REAL_PILOT_POLICY.maxRounds,
    requestedRegenerations: MORELLA_REAL_PILOT_POLICY.maxRegenerations,
    requestedPublications: MORELLA_REAL_PILOT_POLICY.maxPublications,
    providerCenter,
    realConnections: { tavily: 'not_checked', openai: 'not_checked' },
    tariffsReady: { tavily: false, openai: false },
    budgetPersisted: false,
    balances: { tavily: 'not_consultable', openai: 'not_consultable' },
    supabase: 'not_checked',
    ledger: 'not_checked',
    globalGuard: 'not_checked',
    activeRealTasks: 'not_checked',
  })
}

function addProviderChecks(
  input: MorellaPilotPreflightInput,
  checks: PilotGateCheck[],
  providerId: 'tavily' | 'openai',
  label: string,
): void {
  const provider = input.providerCenter.providers.find(item => item.id === providerId)
  const add = (code: string, checkLabel: string, condition: boolean, ok: string, failed: string) => {
    checks.push({
      code,
      label: checkLabel,
      status: condition ? 'pass' : 'block',
      detail: condition ? ok : failed,
    })
  }
  add(
    `${providerId}_configured`,
    `${label}: clave configurada`,
    Boolean(provider?.configured),
    'Credencial cifrada configurada; su valor no se expone.',
    'No consta una credencial cifrada configurada.',
  )
  add(
    `${providerId}_active`,
    `${label}: proveedor activo`,
    Boolean(provider?.active),
    'Proveedor seleccionado como activo en su categoría.',
    'El proveedor no está activo.',
  )
  add(
    `${providerId}_model`,
    `${label}: modelo`,
    Boolean(provider?.selectedModel && provider.availableModels.includes(provider.selectedModel)),
    `Modelo seleccionado: ${provider?.selectedModel ?? 'ninguno'}.`,
    'El modelo seleccionado no pertenece al catálogo.',
  )
  const connection = input.realConnections[providerId]
  checks.push({
    code: `${providerId}_connection`,
    label: `${label}: conexión real`,
    status: connection === 'ok' ? 'pass' : 'block',
    detail: connection === 'ok'
      ? 'Conexión real verificada por un preflight autorizado.'
      : connection === 'failed'
        ? 'La conexión real falló.'
        : 'No comprobada; una prueba simulada nunca satisface este control.',
  })
}

function addProbe(
  checks: PilotGateCheck[],
  code: string,
  label: string,
  state: 'ok' | 'failed' | 'not_checked',
): void {
  checks.push({
    code,
    label,
    status: state === 'ok' ? 'pass' : 'block',
    detail: state === 'ok'
      ? `${label} verificado.`
      : state === 'failed'
        ? `${label} no está disponible.`
        : `${label} no se ha comprobado.`,
  })
}

function normalizeDestination(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase()
}
