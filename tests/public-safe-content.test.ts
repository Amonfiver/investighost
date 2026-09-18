import { describe, expect, it } from 'vitest'
import {
  PublicSafeContentError,
  assertPublicSafeLibraryDocument,
} from '@modules/library-versioning/public-safe-content'

const clean = `## [intro] Guía breve
**Cuenca** invita a recorrer patrimonio y paisaje.
## [overview] Antes de viajar
Consulta horarios y accesibilidad actualizados.
`

describe('PUBLIC_SAFE consumer-content gate', () => {
  it('accepts finished consumer prose and valid Markdown', () => {
    expect(() => assertPublicSafeLibraryDocument('Cuenca para visitar', clean)).not.toThrow()
  })

  it('blocks editorial identifiers, audit language, V2 keys and escaped Markdown in title or body', () => {
    for (const marker of [
      '(c11)', 'c11', 'e12', 'g2–g3', 'claimId', 'libraryEntryId',
      'El expediente no acredita esta visita.', 'this dossier', 'resolved_editorially',
      'texto \\*\\*escapado\\*\\*',
    ]) {
      expect(() => assertPublicSafeLibraryDocument('Cuenca para visitar', clean.replace('Consulta horarios', marker)))
        .toThrow(PublicSafeContentError)
    }
    expect(() => assertPublicSafeLibraryDocument('Cuenca (c9)', clean)).toThrow(PublicSafeContentError)
  })
})
