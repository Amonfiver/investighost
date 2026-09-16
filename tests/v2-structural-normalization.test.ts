import { describe, expect, it } from 'vitest'
import {
  assertV2StructuralSemanticEquivalence,
  normalizeApprovedContentForV2,
  semanticTextWithoutV2Delimiters,
} from '@modules/library-versioning/v2-structural-normalization'

describe('normalización estructural V2', () => {
  const source = [
    'Título original', '', 'Texto inicial.', '',
    'Panorama original', '', 'Texto de panorama.', '',
    'Consejos originales', '', '- Mantener esta lista.', '',
    'Riesgos originales', '', 'Texto de riesgo.',
  ].join('\n')

  const normalized = normalizeApprovedContentForV2(source, [
    { kind: 'intro', marker: 'Título original' },
    { kind: 'overview', marker: 'Panorama original' },
    { kind: 'practical', marker: 'Consejos originales' },
    { kind: 'risks', marker: 'Riesgos originales' },
  ])

  it('solo añade delimitadores V2 y conserva el texto semántico', () => {
    expect(normalized.startsWith('## [intro]\nTítulo original')).toBe(true)
    expect(normalized).toContain('## [practical]\nConsejos originales')
    expect(semanticTextWithoutV2Delimiters(normalized)).toBe(source)
    expect(() => assertV2StructuralSemanticEquivalence(source, normalized)).not.toThrow()
  })

  it('rechaza equivalencias si cambia contenido no estructural', () => {
    expect(() => assertV2StructuralSemanticEquivalence(source, normalized.replace('Texto de riesgo.', 'Texto alterado.')))
      .toThrow('alteró el texto semántico')
  })
})
