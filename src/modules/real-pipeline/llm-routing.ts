import { z } from 'zod'

export const IntelligenceProviderIdSchema = z.enum(['openai', 'deepseek'])
export type IntelligenceProviderId = z.infer<typeof IntelligenceProviderIdSchema>

export const IntelligenceRoutingStageSchema = z.enum([
  'analysis',
  'draft_adventure',
  'draft_student',
  'review',
])
export type IntelligenceRoutingStage = z.infer<typeof IntelligenceRoutingStageSchema>

const OptionalNumberSchema = z.number().finite().optional()

export const IntelligenceRouteOverrideSchema = z.object({
  providerId: IntelligenceProviderIdSchema.optional(),
  model: z.string().trim().min(1).max(160).optional(),
  reasoningEffort: z.enum(['none', 'low', 'high', 'max']).optional(),
  temperature: OptionalNumberSchema.refine(value => value === undefined || (value >= 0 && value <= 2)),
  topP: OptionalNumberSchema.refine(value => value === undefined || (value > 0 && value <= 1)),
  maxOutputTokens: z.number().int().min(1).max(50_000).optional(),
  timeoutMs: z.number().int().min(1_000).max(120_000).optional(),
}).strict()

export interface ResolvedIntelligenceRoute {
  providerId: IntelligenceProviderId
  /** Identificador lógico que se conserva en configuración y telemetría. */
  model: string
  /** Identificador que se envía al endpoint del proveedor. */
  apiModel: string
  reasoningEffort?: 'none' | 'low' | 'high' | 'max'
  temperature?: number
  topP?: number
  maxOutputTokens?: number
  timeoutMs?: number
}

export interface RealLlmRouting {
  default: ResolvedIntelligenceRoute
  routes: Record<IntelligenceRoutingStage, ResolvedIntelligenceRoute>
}

const DEFAULT_ROUTE = {
  providerId: 'deepseek',
  model: 'deepseek-flash',
} as const

const ENV_KEYS: Record<IntelligenceRoutingStage | 'default', string> = {
  default: 'INVESTIGHOST_LLM_DEFAULT',
  analysis: 'INVESTIGHOST_LLM_ANALYSIS',
  draft_adventure: 'INVESTIGHOST_LLM_DRAFT_ADVENTURE',
  draft_student: 'INVESTIGHOST_LLM_DRAFT_STUDENT',
  review: 'INVESTIGHOST_LLM_REVIEW',
}

/**
 * Resuelve únicamente configuración no secreta. Las credenciales siguen en el
 * Centro de proveedores y nunca se leen desde estas variables.
 */
export function readRealLlmRouting(
  environment: NodeJS.ProcessEnv = process.env,
): RealLlmRouting {
  const fallback = resolveRoute(DEFAULT_ROUTE, undefined)
  const defaultRoute = resolveRoute(fallback, readOverride(environment, 'default'))
  return {
    default: defaultRoute,
    routes: {
      analysis: resolveRoute(defaultRoute, readOverride(environment, 'analysis')),
      draft_adventure: resolveRoute(defaultRoute, readOverride(environment, 'draft_adventure')),
      draft_student: resolveRoute(defaultRoute, readOverride(environment, 'draft_student')),
      review: resolveRoute(defaultRoute, readOverride(environment, 'review')),
    },
  }
}

export function routeForOperation(
  routing: RealLlmRouting,
  operation: IntelligenceRoutingStage,
): ResolvedIntelligenceRoute {
  return routing.routes[operation]
}

export function apiModelFor(
  providerId: IntelligenceProviderId,
  model: string,
): string {
  // `deepseek-flash` es nuestro id lógico estable. DeepSeek documenta
  // actualmente `deepseek-v4-flash` como id de la API Responses.
  if (providerId === 'deepseek' && model === 'deepseek-flash') return 'deepseek-v4-flash'
  return model
}

function readOverride(
  environment: NodeJS.ProcessEnv,
  stage: IntelligenceRoutingStage | 'default',
): z.infer<typeof IntelligenceRouteOverrideSchema> | undefined {
  const prefix = ENV_KEYS[stage]
  const candidate = {
    providerId: environment[`${prefix}_PROVIDER`],
    model: environment[`${prefix}_MODEL`],
    reasoningEffort: environment[`${prefix}_REASONING_EFFORT`],
    temperature: numberEnvironment(environment[`${prefix}_TEMPERATURE`]),
    topP: numberEnvironment(environment[`${prefix}_TOP_P`]),
    maxOutputTokens: integerEnvironment(environment[`${prefix}_MAX_OUTPUT_TOKENS`]),
    timeoutMs: integerEnvironment(environment[`${prefix}_TIMEOUT_MS`]),
  }
  const supplied = Object.values(candidate).some(value => value !== undefined)
  return supplied ? IntelligenceRouteOverrideSchema.parse(candidate) : undefined
}

function resolveRoute(
  base: Pick<ResolvedIntelligenceRoute, 'providerId' | 'model'>,
  override: z.infer<typeof IntelligenceRouteOverrideSchema> | undefined,
): ResolvedIntelligenceRoute {
  const providerId = override?.providerId ?? base.providerId
  const model = override?.model ?? base.model
  return {
    providerId,
    model,
    apiModel: apiModelFor(providerId, model),
    reasoningEffort: override?.reasoningEffort,
    temperature: override?.temperature,
    topP: override?.topP,
    maxOutputTokens: override?.maxOutputTokens,
    timeoutMs: override?.timeoutMs,
  }
}

function numberEnvironment(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new Error('La configuración LLM numérica no es válida')
  return parsed
}

function integerEnvironment(value: string | undefined): number | undefined {
  const parsed = numberEnvironment(value)
  if (parsed !== undefined && !Number.isInteger(parsed)) {
    throw new Error('La configuración LLM entera no es válida')
  }
  return parsed
}
