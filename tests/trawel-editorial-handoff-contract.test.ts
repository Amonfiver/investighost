import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import {
  TrawelEditorialHandoffContractError,
  prepareTrawelEditorialHandoff,
  verifyTrawelEditorialHandoff,
} from '@modules/trawel-handoff'
import {
  canonicalPayloadHash,
  libraryContentHash,
  libraryOriginVersionHash,
} from '@modules/library-versioning/canonicalization'
import {
  CurrentApprovedLibraryContentSchema,
  type CurrentApprovedLibraryContent,
} from '@shared/real-editorial-library-read-contracts'
import {
  RealEditorialLibraryEntrySchema,
  type RealEditorialLibraryEntry,
} from '@shared/real-editorial-pilot-contracts'
import {
  LibraryTrawelApprovedSourceSchema,
  PrepareTrawelEditorialHandoffCommandSchema,
  TrawelEditorialContentDraftSchema,
  TrawelEditorialHandoffPayloadSchema,
  type LibraryTrawelApprovedSource,
  type PrepareTrawelEditorialHandoffCommand,
  type TrawelEditorialTarget,
} from '@shared/trawel-editorial-handoff-contracts'

const ids = {
  pilot: 'e2000000-0000-4000-8000-000000000001',
  run: 'e2000000-0000-4000-8000-000000000002',
  transfer: 'e2000000-0000-4000-8000-000000000003',
  destination: 'e2000000-0000-4000-8000-000000000004',
  adventureEntry: 'e2000000-0000-4000-8000-000000000005',
  studentEntry: 'e2000000-0000-4000-8000-000000000006',
  adventureArtifact: 'e2000000-0000-4000-8000-000000000007',
  studentArtifact: 'e2000000-0000-4000-8000-000000000008',
  reviewArtifact: 'e2000000-0000-4000-8000-000000000009',
  snapshotArtifact: 'e2000000-0000-4000-8000-000000000010',
  terminalDecision: 'e2000000-0000-4000-8000-000000000011',
  actor: 'e2000000-0000-4000-8000-000000000012',
  target: 'e2000000-0000-4000-8000-000000000013',
  studentVersion: 'e2000000-0000-4000-8000-000000000014',
  studentRevision: 'e2000000-0000-4000-8000-000000000015',
  studentApproval: 'e2000000-0000-4000-8000-000000000016',
}
const createdAt = '2026-08-08T10:00:00.000Z'
const derivedAt = '2026-08-08T11:00:00.000Z'
const hash = (character: string) => character.repeat(64)

const target: TrawelEditorialTarget = {
  projectRef: 'abcdefghijklmnopqrst',
  entityType: 'zone',
  entityId: ids.target,
  entitySlug: 'villa-sintetica',
  countrySlug: 'pais-sintetico',
  zoneSlug: 'villa-sintetica',
  countryCode: 'ZZ',
}

function entry(profile: 'adventure' | 'student'): RealEditorialLibraryEntry {
  const adventure = profile === 'adventure'
  return RealEditorialLibraryEntrySchema.parse({
    entryId: adventure ? ids.adventureEntry : ids.studentEntry,
    transferId: ids.transfer,
    pilotId: ids.pilot,
    runId: ids.run,
    destination: {
      canonicalId: ids.destination,
      name: 'Villa Sintética',
      countryCode: 'ZZ',
      type: 'locality',
    },
    profile,
    title: adventure ? 'Origen Aventura sintético' : 'Origen Estudiante sintético',
    content: adventure
      ? 'Contenido Aventura original y sintético.\n'
      : 'Contenido Estudiante original y sintético.\n',
    editorialVersion: 1,
    language: 'es-ES',
    status: 'approved_unpublished',
    editorialState: 'approved',
    libraryState: 'ready_for_library',
    publicationState: 'unpublished',
    origin: 'real_editorial_pilot',
    sourceArtifact: {
      artifactId: adventure ? ids.adventureArtifact : ids.studentArtifact,
      kind: adventure ? 'draft_adventure' : 'draft_student',
      key: profile,
      version: 1,
      hash: adventure ? hash('1') : hash('2'),
      createdAt,
    },
    finalReviewArtifact: {
      artifactId: ids.reviewArtifact,
      kind: 'final_review',
      key: 'final',
      version: 1,
      hash: hash('3'),
      createdAt,
    },
    terminalDecisionId: ids.terminalDecision,
    reviewOutcome: 'passed_with_warnings',
    warnings: ['Advertencia sintética aceptada.'],
    gaps: [{
      id: 'gap-sintetico',
      topic: 'alcance-sintetico',
      description: 'Gap creado exclusivamente para la prueba.',
      importance: 'medium',
      requiredForProfiles: ['adventure', 'student'],
      resolvableWithResearch: false,
    }],
    contradictions: ['Contradicción sintética controlada.'],
    claims: [{
      id: 'claim-sintetico',
      topic: 'tema-sintetico',
      statement: 'Afirmación sintética controlada.',
      evidenceIds: ['source-sintetica'],
      confidence: 0.9,
      suitableProfiles: ['adventure', 'student'],
    }],
    evidence: [{
      claimId: 'claim-sintetico',
      statement: 'Evidencia sintética controlada.',
      confidence: 0.9,
      evidenceIds: ['source-sintetica'],
    }],
    sources: [{
      id: 'source-sintetica',
      round: 1,
      url: 'https://example.test/fuente-sintetica',
      normalizedUrl: 'https://example.test/fuente-sintetica',
      title: 'Fuente pública sintética',
      publisher: 'Editorial Sintética',
      publishedAt: '2026-01-01T00:00:00.000Z',
      capturedAt: createdAt,
      contentHash: hash('4'),
      score: 0.8,
      content: 'Captura interna sintética que nunca debe viajar a Trawel.',
    }],
    approvalActorId: ids.actor,
    transferActorId: ids.actor,
    finalRunCostEur: 0,
    currency: 'EUR',
    approvedAt: createdAt,
    createdAt,
  })
}

function originFor(item: RealEditorialLibraryEntry) {
  const contentHash = libraryContentHash({
    profile: item.profile,
    language: item.language,
    title: item.title,
    content: item.content,
  })
  const entryKey = item.profile === 'adventure' ? hash('5') : hash('6')
  const originVersionHash = libraryOriginVersionHash({
    entryId: item.entryId,
    entryKey,
    profile: item.profile,
    language: item.language,
    contentHash,
    sourceArtifactId: item.sourceArtifact.artifactId,
    sourceArtifactHash: item.sourceArtifact.hash,
    finalReviewHash: item.finalReviewArtifact.hash,
    terminalDecisionId: item.terminalDecisionId,
  })
  return {
    libraryEntryId: item.entryId,
    entryKey,
    versionNumber: 1 as const,
    profile: item.profile,
    language: item.language,
    title: item.title,
    content: item.content,
    contentHash,
    originVersionHash,
    sourceArtifact: item.sourceArtifact,
    finalReviewArtifact: item.finalReviewArtifact,
    terminalDecisionId: item.terminalDecisionId,
    transfer: {
      transferId: item.transferId,
      snapshotArtifactId: ids.snapshotArtifact,
      snapshotHash: hash('7'),
      terminalDecisionId: item.terminalDecisionId,
      transferredAt: createdAt,
      publicationCount: 0 as const,
      trawelConnected: false as const,
      automaticEnabled: false as const,
    },
    reviewOutcome: 'passed_with_warnings' as const,
    reviewPayload: {},
    warnings: item.warnings,
    gaps: item.gaps,
    contradictions: item.contradictions,
    claims: item.claims,
    evidence: item.evidence,
    sources: item.sources,
    approvalActorId: item.approvalActorId,
    transferActorId: item.transferActorId,
    approvedAt: item.approvedAt,
    createdAt: item.createdAt,
    publicationState: 'unpublished' as const,
  }
}

function source(
  profile: 'adventure' | 'student',
  derived = profile === 'student',
  replacement?: { title: string; content: string },
): LibraryTrawelApprovedSource {
  const item = entry(profile)
  const origin = originFor(item)
  const selected = replacement ?? (derived
    ? {
        title: 'Estudiante v2 aprobado sintético',
        content: 'Contenido Estudiante v2 aprobado y sintético.\n',
      }
    : { title: item.title, content: item.content })
  const contentHash = libraryContentHash({
    profile,
    language: item.language,
    title: selected.title,
    content: selected.content,
  })
  const currentApproved: CurrentApprovedLibraryContent = derived
    ? {
        source: 'derived',
        libraryEntryId: item.entryId,
        profile,
        language: 'es-ES',
        versionId: ids.studentVersion,
        versionNumber: 2,
        revisionId: ids.studentRevision,
        title: selected.title,
        content: selected.content,
        contentHash,
        versionHash: hash('8'),
        revisionHash: hash('9'),
        approvalDecisionId: ids.studentApproval,
        approvedAt: derivedAt,
        originV1: origin,
        publicationState: 'unpublished',
      }
    : {
        source: 'origin_v1',
        libraryEntryId: item.entryId,
        profile,
        language: 'es-ES',
        versionId: null,
        versionNumber: 1,
        revisionId: null,
        title: selected.title,
        content: selected.content,
        contentHash,
        versionHash: origin.originVersionHash,
        revisionHash: null,
        approvalDecisionId: null,
        approvedAt: item.approvedAt,
        originV1: origin,
        publicationState: 'unpublished',
      }
  return LibraryTrawelApprovedSourceSchema.parse({
    entry: item,
    currentApproved: CurrentApprovedLibraryContentSchema.parse(currentApproved),
  })
}

function command(
  overrides: Partial<PrepareTrawelEditorialHandoffCommand> = {},
): PrepareTrawelEditorialHandoffCommand {
  return PrepareTrawelEditorialHandoffCommandSchema.parse({
    sources: [source('student'), source('adventure')],
    target,
    actorId: ids.actor,
    confirmed: true,
    ...overrides,
  })
}

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
