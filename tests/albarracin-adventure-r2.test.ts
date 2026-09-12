import { describe, expect, it } from 'vitest'
import { ALBARRACIN_PACK_B_CANDIDATES } from '@modules/library-versioning/albarracin-pack-b'
import {
  ADVENTURE_R2_EVIDENCE_AUDIT,
  ALBARRACIN_ADVENTURE_R2,
  adventureR2Content,
  canonicalSections,
  changedCanonicalSections,
  refineAlbarracinAdventureR1ToR2,
} from '@modules/library-versioning/albarracin-adventure-r2'

describe('Adventure Albarracín v2/r2', () => {
  const r1 = ALBARRACIN_PACK_B_CANDIDATES.adventure.content
  const r2 = adventureR2Content()

  it('deriva r2 de r1 sin modificar el texto de r1 ni su taxonomía', () => {
    expect(refineAlbarracinAdventureR1ToR2(r1)).toBe(r2)
    expect(ALBARRACIN_PACK_B_CANDIDATES.adventure.content).toBe(r1)
    expect([...canonicalSections(r2).keys()]).toEqual(ALBARRACIN_ADVENTURE_R2.taxonomy)
    expect(changedCanonicalSections(r1, r2)).toEqual(['intro', 'practical', 'risks'])
  })

  it('limita los cambios al ajuste editorial autorizado y conserva sus límites documentados', () => {
    const sections = canonicalSections(r2)
    expect(sections.get('intro')).toContain('recorridos vinculados al Guadalaviar')
    expect(sections.get('practical')).toContain('más de 415.000 visitantes a 2024 [c13]')
    expect(sections.get('practical')).toContain('no debe compararse directamente con series históricas no equivalentes')
    expect(sections.get('risks')).toContain('cambios de superficie, escaleras, pasarelas y puentes')
    expect(sections.get('risks')).toContain('calzado adecuado y agua porque no hay fuentes')
    expect(sections.get('risks')).toContain('no es apto para carritos de bebé ni para personas con movilidad reducida')
    expect(sections.get('risks')).toContain('incómodo para personas con vértigo')
  })

  it('clasifica cada frase nueva o reformulada sin reclamaciones potencialmente no respaldadas', () => {
    expect(ADVENTURE_R2_EVIDENCE_AUDIT.map(item => item.classification)).toEqual([
      'EDITORIAL_ONLY', 'SUPPORTED', 'CONTRADICTION_DISCLOSED', 'LIMITED_EVIDENCE_DISCLOSED',
    ])
  })
})
