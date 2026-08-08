import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import {
  TrawelEditorialHandoffContractError,
  prepareTrawelEditorialHandoff,
  verifyTrawelEditorialHandoff,
} from '@modules/trawel-handoff'
import { canonicalPayloadHash } from '@modules/library-versioning/canonicalization'
import {
  LibraryTrawelApprovedSourceSchema,
  PrepareTrawelEditorialHandoffCommandSchema,
  TrawelEditorialContentDraftSchema,
  TrawelEditorialHandoffPayloadSchema,
  type PrepareTrawelEditorialHandoffCommand,
} from '@shared/trawel-editorial-handoff-contracts'
import {
  buildSyntheticApprovedSource as source,
  buildSyntheticHandoffCommand as command,
  syntheticCreatedAt as createdAt,
  syntheticDerivedAt as derivedAt,
  syntheticHash as hash,
  syntheticTrawelIds as ids,
  syntheticTrawelTarget as target,
} from './support/trawel-handoff-fixture'

describe('E2E-02 contrato durable Investighost → Trawel', () => {
  it('proyecta exactamente current approved, ordena sin transformar y nunca filtra captura interna', () => {
    const payload = prepareTrawelEditorialHandoff(command())

    expect(payload.rows.map(row => row.mode)).toEqual(['adventure', 'student'])
    expect(payload.rows[0]).toMatchObject({
      headline: 'Origen Aventura sintético',
      intro: 'Contenido Aventura original y sintético.\n',
      status: 'draft',
      review_state: 'approved_in_investighost',
      published_at: null,
      highlights: [],
      practical_tips: [],
      sections: [],
      metadata: { investighost: { source: {
        currentApproved: { source: 'origin_v1', versionNumber: 1,
          approval: { kind: 'terminal', decisionId: ids.terminalDecision } },
      } } },
    })
    expect(payload.rows[1]).toMatchObject({
      headline: 'Estudiante v2 aprobado sintético',
      intro: 'Contenido Estudiante v2 aprobado y sintético.\n',
      metadata: { investighost: { source: {
        currentApproved: {
          source: 'derived',
          versionId: ids.studentVersion,
          revisionId: ids.studentRevision,
          approval: { kind: 'library_version', decisionId: ids.studentApproval },
        },
      } } },
    })
    expect(payload.rows[0].sources).toEqual([{
      sourceId: 'source-sintetica',
      title: 'Fuente pública sintética',
      url: 'https://example.test/fuente-sintetica',
      publisher: 'Editorial Sintética',
      publishedAt: '2026-01-01T00:00:00.000Z',
      contentHash: hash('4'),
    }])
    expect(JSON.stringify(payload)).not.toContain('Captura interna sintética')
    expect(JSON.stringify(payload)).not.toContain('finalRunCostEur')
  })

  it('es determinista frente al orden de perfiles y conserva IDs UUIDv8 estables', () => {
    const reversed = command({ sources: [source('adventure'), source('student')] })
    const first = prepareTrawelEditorialHandoff(command())
    const second = prepareTrawelEditorialHandoff(reversed)

    expect(second).toEqual(first)
    expect(first.rows.every(row => row.id.split('-')[2]?.startsWith('8'))).toBe(true)
    expect(TrawelEditorialHandoffPayloadSchema.parse(first)).toEqual(first)
  })

  it('separa identidad estable de fingerprint y detectará otra aprobación como conflicto', () => {
    const first = prepareTrawelEditorialHandoff(command())
    const laterStudent = source('student', true, {
      title: 'Estudiante v3 aprobado sintético',
      content: 'Contenido Estudiante v3 distinto y sintético.\n',
    })
    const second = prepareTrawelEditorialHandoff(command({
      sources: [source('adventure'), laterStudent],
    }))

    expect(second.handoffKey).toBe(first.handoffKey)
    expect(second.rows.map(row => row.id)).toEqual(first.rows.map(row => row.id))
    expect(second.payloadFingerprint).not.toBe(first.payloadFingerprint)
  })

  it('cambia identidad e IDs cuando cambia el target confirmado', () => {
    const first = prepareTrawelEditorialHandoff(command())
    const other = prepareTrawelEditorialHandoff(command({
      target: {
        ...target,
        entityId: 'e2000000-0000-4000-8000-000000000099',
        entitySlug: 'otra-villa-sintetica',
        zoneSlug: 'otra-villa-sintetica',
      },
    }))

    expect(other.handoffKey).not.toBe(first.handoffKey)
    expect(other.rows.map(row => row.id)).not.toEqual(first.rows.map(row => row.id))
  })

  it('rechaza perfiles, procedencia, target y confirmación incoherentes antes de adaptar', () => {
    const adventure = source('adventure')
    expect(PrepareTrawelEditorialHandoffCommandSchema.safeParse({
      ...command(), sources: [adventure, adventure],
    }).success).toBe(false)
    expect(PrepareTrawelEditorialHandoffCommandSchema.safeParse({
      ...command(), target: { ...target, countryCode: 'AA' },
    }).success).toBe(false)
    expect(PrepareTrawelEditorialHandoffCommandSchema.safeParse({
      ...command(), target: { ...target, entityType: 'country', zoneSlug: null },
    }).success).toBe(false)
    expect(PrepareTrawelEditorialHandoffCommandSchema.safeParse({
      ...command(), confirmed: false,
    }).success).toBe(false)
    expect(LibraryTrawelApprovedSourceSchema.safeParse({
      ...adventure,
      currentApproved: { ...adventure.currentApproved, libraryEntryId: ids.studentEntry },
    }).success).toBe(false)
  })

  it('recalcula hashes y no acepta elegir silenciosamente otro contenido', () => {
    const approved = source('student')
    const forged = {
      ...approved,
      currentApproved: {
        ...approved.currentApproved,
        content: 'Otra revisión no aprobada.\n',
      },
    }
    expect(() => prepareTrawelEditorialHandoff({
      ...command(), sources: [source('adventure'), forged],
    } as PrepareTrawelEditorialHandoffCommand)).toThrowError(
      expect.objectContaining<TrawelEditorialHandoffContractError>({
        code: 'SOURCE_HASH_MISMATCH',
      }),
    )
  })

  it('verifica igualdad exacta tras una lectura Trawel e ignora solo timestamps gestionados', () => {
    const payload = prepareTrawelEditorialHandoff(command())
    const observed = payload.rows.map((row, index) => ({
      ...row,
      created_at: index === 0 ? createdAt : derivedAt,
      updated_at: index === 0 ? derivedAt : createdAt,
    })).reverse()

    expect(verifyTrawelEditorialHandoff(payload, observed)).toEqual({
      status: 'verified',
      handoffKey: payload.handoffKey,
      payloadFingerprint: payload.payloadFingerprint,
      rowIds: [...payload.rows].sort((left, right) => left.id < right.id ? -1 : 1)
        .map(row => row.id),
      publicationState: 'private_draft',
    })
  })

  it('distingue filas ausentes, contenido divergente y ruptura de la frontera draft', () => {
    const payload = prepareTrawelEditorialHandoff(command())
    expect(verifyTrawelEditorialHandoff(payload, [payload.rows[0]])).toMatchObject({
      status: 'error', code: 'ROW_SET_MISMATCH',
    })
    expect(verifyTrawelEditorialHandoff(payload, payload.rows.map((row, index) =>
      index === 0 ? { ...row, headline: 'Título Trawel alterado' } : row,
    ))).toMatchObject({ status: 'error', code: 'CONTENT_MISMATCH' })
    expect(verifyTrawelEditorialHandoff(payload, payload.rows.map((row, index) =>
      index === 0 ? { ...row, status: 'published' } : row,
    ))).toMatchObject({ status: 'error', code: 'VALIDATION_ERROR' })
  })

  it('recalcula la integridad del payload y no confía en hashes autoconsistentes falsos', () => {
    const payload = prepareTrawelEditorialHandoff(command())
    const forgedFingerprint = canonicalPayloadHash({ forged: true })
    const forged = {
      ...payload,
      payloadFingerprint: forgedFingerprint,
      rows: payload.rows.map(row => ({
        ...row,
        metadata: { investighost: {
          ...row.metadata.investighost,
          payloadFingerprint: forgedFingerprint,
        } },
      })),
    }
    expect(TrawelEditorialHandoffPayloadSchema.safeParse(forged).success).toBe(true)
    expect(verifyTrawelEditorialHandoff(forged, forged.rows)).toMatchObject({
      status: 'error', code: 'PAYLOAD_INTEGRITY_ERROR',
    })
  })

  it('mantiene schemas cerrados y deja los campos editoriales no autorizados fuera', () => {
    const row = prepareTrawelEditorialHandoff(command()).rows[0]
    expect(TrawelEditorialContentDraftSchema.safeParse({ ...row, price: '10 EUR' }).success)
      .toBe(false)
    expect(TrawelEditorialContentDraftSchema.safeParse({ ...row, highlights: ['inventado'] }).success)
      .toBe(false)
    expect(TrawelEditorialContentDraftSchema.safeParse({ ...row, published_at: derivedAt }).success)
      .toBe(false)
    expect(TrawelEditorialContentDraftSchema.safeParse({
      ...row,
      metadata: { investighost: {
        ...row.metadata.investighost,
        source: {
          ...row.metadata.investighost.source,
          currentApproved: {
            ...row.metadata.investighost.source.currentApproved,
            source: 'derived',
          },
        },
      } },
    }).success).toBe(false)
  })

  it('permanece puro, sin Supabase, fetch, Tavily, OpenAI ni escritura', async () => {
    const sourceCode = await readFile(
      new URL('../src/modules/trawel-handoff/contract-adapter.ts', import.meta.url),
      'utf8',
    )
    for (const forbidden of [
      '@supabase/supabase-js', '.from(', '.insert(', '.update(', '.delete(',
      'fetch(', 'Tavily', 'OpenAI', 'publishToTrawel',
    ]) {
      expect(sourceCode).not.toContain(forbidden)
    }
  })
})
