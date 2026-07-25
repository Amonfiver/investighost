export const LEGACY_PROVIDER_RUNTIME_ENABLED = false as const

export class LegacyProviderRuntimeDisabledError extends Error {
  readonly code = 'LEGACY_PROVIDER_RUNTIME_DISABLED'
  readonly retryable = false

  constructor(entryPoint: string) {
    super(`Ruta legacy de proveedores desactivada: ${entryPoint}`)
    this.name = 'LegacyProviderRuntimeDisabledError'
  }
}

export function assertLegacyProviderRuntimeDisabled(entryPoint: string): void {
  throw new LegacyProviderRuntimeDisabledError(entryPoint)
}
