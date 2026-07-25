import { z } from 'zod'
import { ProviderCenterSnapshotSchema } from '@shared/provider-center-contracts'
import { resolveRealExecutionFeatureFlag } from './real-pilot-gate'

const permitBrand = Symbol('investighost-live-provider-permit')
const issuedPermits = new WeakSet<object>()

export interface LiveProviderNetworkPermit {
  readonly [permitBrand]: true
}

export const LiveProviderAccessInputSchema = z.object({
  featureToken: z.string(),
  providerCenter: ProviderCenterSnapshotSchema,
  preflightStatus: z.literal('ready_for_live_connectivity_check'),
  taskAuthorized: z.boolean(),
  budgetReserved: z.boolean(),
  globalGuardAcquired: z.boolean(),
})

export type LiveProviderAccessErrorCode =
  | 'REAL_FEATURE_DISABLED'
  | 'PROVIDER_NOT_CONFIGURED'
  | 'PROVIDER_INACTIVE'
  | 'PREFLIGHT_REQUIRED'
  | 'TASK_AUTHORIZATION_REQUIRED'
  | 'BUDGET_RESERVATION_REQUIRED'
  | 'GLOBAL_GUARD_REQUIRED'
  | 'INVALID_NETWORK_PERMIT'

export class LiveProviderAccessError extends Error {
  readonly retryable = false

  constructor(readonly code: LiveProviderAccessErrorCode, message: string) {
    super(message)
    this.name = 'LiveProviderAccessError'
  }
}

export function issueLiveProviderNetworkPermit(candidate: unknown): LiveProviderNetworkPermit {
  const parsed = LiveProviderAccessInputSchema.safeParse(candidate)
  if (!parsed.success) {
    throw new LiveProviderAccessError('PREFLIGHT_REQUIRED', 'El preflight real no autoriza acceso a proveedores')
  }
  const input = parsed.data
  if (!resolveRealExecutionFeatureFlag(input.featureToken)) {
    throw new LiveProviderAccessError('REAL_FEATURE_DISABLED', 'La feature flag real permanece desactivada')
  }
  if (!input.providerCenter.secureStorageAvailable) {
    throw new LiveProviderAccessError(
      'PROVIDER_NOT_CONFIGURED',
      'El almacenamiento seguro de proveedores no está disponible',
    )
  }
  for (const providerId of ['tavily', 'openai'] as const) {
    const provider = input.providerCenter.providers.find(entry => entry.id === providerId)
    if (!provider?.configured) {
      throw new LiveProviderAccessError('PROVIDER_NOT_CONFIGURED', 'Falta una credencial de proveedor')
    }
    if (!provider.active) {
      throw new LiveProviderAccessError('PROVIDER_INACTIVE', 'Falta activar un proveedor requerido')
    }
    if (
      provider.tariffStatus !== 'current'
      || !provider.selectedModel
      || !provider.availableModels.includes(provider.selectedModel)
    ) {
      throw new LiveProviderAccessError('PREFLIGHT_REQUIRED', 'El modelo o la tarifa no están vigentes')
    }
  }
  if (!input.taskAuthorized) {
    throw new LiveProviderAccessError('TASK_AUTHORIZATION_REQUIRED', 'La tarea no tiene autorización humana')
  }
  if (!input.budgetReserved) {
    throw new LiveProviderAccessError('BUDGET_RESERVATION_REQUIRED', 'La llamada carece de reserva económica')
  }
  if (!input.globalGuardAcquired) {
    throw new LiveProviderAccessError('GLOBAL_GUARD_REQUIRED', 'La ejecución no posee la guarda global')
  }

  const permit = { [permitBrand]: true } as LiveProviderNetworkPermit
  issuedPermits.add(permit)
  return permit
}

export function assertLiveProviderNetworkPermit(
  permit: LiveProviderNetworkPermit | undefined,
): asserts permit is LiveProviderNetworkPermit {
  if (!permit || !issuedPermits.has(permit)) {
    throw new LiveProviderAccessError(
      'INVALID_NETWORK_PERMIT',
      'El cliente real no dispone de un permiso de red válido',
    )
  }
}
