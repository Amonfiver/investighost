import { describe, expect, it } from 'vitest'
import {
  availableGlobalSourceSlots,
  selectSourcesWithinGlobalLimit,
} from '@modules/real-pipeline/source-limit-recovery'
import type { RealResearchSource } from '@shared/real-pipeline-contracts'

const timestamp = '2026-07-30T12:00:00.000Z'

function source(round: 1 | 2, id: string, score: number): RealResearchSource {
  return {
    id,
    round,
    url: `https://example.test/${id}`,
    normalizedUrl: `https://example.test/${id}`,
    title: `Fuente ${id}`,
    capturedAt: timestamp,
    contentHash: 'a'.repeat(64),
    score,
    content: `Contenido sintético ${id}.`,
  }
}

describe('selección por el máximo global de fuentes', () => {
  const existing = [
    source(1, 'round-one-a', 0.75),
    source(1, 'round-one-b', 0.70),
    source(1, 'round-one-c', 0.65),
  ]
  const candidates = [
    source(2, 'round-two-sixth', 0.40),
    source(2, 'round-two-third', 0.70),
    source(2, 'round-two-first', 0.95),
    source(2, 'round-two-fifth', 0.50),
    source(2, 'round-two-second', 0.80),
    source(2, 'round-two-fourth', 0.60),
  ]

  it('incorpora cinco de seis candidatas al quedar cinco plazas', () => {
    expect(availableGlobalSourceSlots(existing, 8)).toBe(5)
    const selection = selectSourcesWithinGlobalLimit(existing, candidates, 8)

    expect(selection.combinedSources).toHaveLength(8)
    expect(selection.selectedSources.map(item => item.id)).toEqual([
      'round-two-first',
      'round-two-second',
      'round-two-third',
      'round-two-fourth',
      'round-two-fifth',
    ])
  })

  it('audita la sexta con rango y causa segura', () => {
    const selection = selectSourcesWithinGlobalLimit(existing, candidates, 8)

    expect(selection.excludedSources).toEqual([{
      source: expect.objectContaining({ id: 'round-two-sixth' }),
      rank: 6,
      reason: 'global_source_limit_exhausted',
    }])
  })

  it('elige lo mismo aunque cambie el orden de entrada', () => {
    const first = selectSourcesWithinGlobalLimit(existing, candidates, 8)
    const second = selectSourcesWithinGlobalLimit(existing, [...candidates].reverse(), 8)

    expect(second.selectedSources.map(item => item.id))
      .toEqual(first.selectedSources.map(item => item.id))
    expect(second.excludedSources.map(item => item.source.id))
      .toEqual(first.excludedSources.map(item => item.source.id))
  })
})
