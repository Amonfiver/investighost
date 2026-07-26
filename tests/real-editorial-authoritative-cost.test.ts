import { describe, expect, it } from 'vitest'
import { realEditorialAuthoritativeSpentCost } from '../src/main/real-editorial-pilot-runtime'

describe('fuente económica autoritativa del piloto editorial', () => {
  it('muestra y decide con el ledger aunque la columna derivada conserve 0,048 EUR', () => {
    const derivedRunColumn = { accumulated_cost: 0.048 }
    const pilotBudgetLedger = { budget: { spentCost: 0.05 } }

    expect(realEditorialAuthoritativeSpentCost(pilotBudgetLedger)).toBe(0.05)
    expect(realEditorialAuthoritativeSpentCost(pilotBudgetLedger))
      .not.toBe(derivedRunColumn.accumulated_cost)
  })
})
