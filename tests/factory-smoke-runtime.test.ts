import { describe, expect, it } from 'vitest'
import { canUseFactorySmokeRuntime, FACTORY_SMOKE_MODE_ENV, isFactorySmokeMode } from '@modules/factory-batches'

describe('factory smoke runtime guard', () => {
  it('is off by default and never turns on in a non-development process', () => {
    expect(isFactorySmokeMode({}, true)).toBe(false)
    expect(isFactorySmokeMode({ [FACTORY_SMOKE_MODE_ENV]: 'true' }, false)).toBe(false)
  })

  it('requires both the explicit mode and a durable smoke marker', () => {
    const environment = { [FACTORY_SMOKE_MODE_ENV]: 'true' }
    expect(canUseFactorySmokeRuntime({ smokeFixture: true }, environment, true)).toBe(true)
    expect(canUseFactorySmokeRuntime({ smokeFixture: false }, environment, true)).toBe(false)
    expect(canUseFactorySmokeRuntime({ smokeFixture: true }, environment, false)).toBe(false)
  })
})
