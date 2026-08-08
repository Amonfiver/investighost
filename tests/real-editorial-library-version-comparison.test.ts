import { describe, expect, it, vi } from 'vitest'
import {
  buildLibraryVersionComparison,
  diffLibraryVersionContent,
  RealEditorialLibraryVersionComparisonService,
} from '@modules/library-versioning/comparison-service'
import { sha256Hex } from '@modules/library-versioning/canonicalization'
import {
  LibraryVersioningRepositoryError,
  type RealEditorialLibraryVersioningReadRepository,
} from '@modules/library-versioning/repository'
import {
  LibraryVersionComparisonResultSchema,
  LibraryVersionComparisonSchema,
} from '@shared/real-editorial-library-comparison-contracts'
import type {
  LibraryEntryVersioningSummary,
  LibraryVersionDetail,
  LibraryVersionRevisionDetail,
} from '@shared/real-editorial-library-read-contracts'

const ids = {
  entry: 'b1000000-0000-4000-8000-000000000001',
  otherEntry: 'b1000000-0000-4000-8000-000000000002',
  version: 'b2000000-0000-4000-8000-000000000001',
  otherVersion: 'b2000000-0000-4000-8000-000000000002',
  revision1: 'b3000000-0000-4000-8000-000000000001',
  revision2: 'b3000000-0000-4000-8000-000000000002',
  revision3: 'b3000000-0000-4000-8000-000000000003',
  otherRevision: 'b3000000-0000-4000-8000-000000000004',
}

const origin = {
  libraryEntryId: ids.entry,
  title: 'Documento sintético',
  content: 'Cabecera\nBase\nCierre\n',
  contentHash: sha256Hex('origin-content'),
  originVersionHash: sha256Hex('origin-version'),
}

const revision1 = revision({
  id: ids.revision1,
  revisionNumber: 1,
  title: 'Documento sintético',
  content: 'Cabecera\nBase revisada\nCierre\n',
  previousRevisionId: null,
  expectedPreviousRevisionHash: null,
})
const revision2 = revision({
  id: ids.revision2,
  revisionNumber: 2,
  title: 'Documento sintético ampliado',
  content: 'Cabecera\nBase revisada\nDato añadido\nCierre\n',
  previousRevisionId: ids.revision1,
  expectedPreviousRevisionHash: revision1.revisionHash,
})
const revision3 = revision({
  id: ids.revision3,
  revisionNumber: 3,
  title: 'Documento sintético ampliado',
  content: 'Cabecera\nDato añadido\nCierre\n',
  previousRevisionId: ids.revision2,
  expectedPreviousRevisionHash: revision2.revisionHash,
})

describe('diff determinista BIB-V05', () => {
  it('canonicaliza NFC, LF, trailing whitespace y salto final sin crear cambios', () => {
    const diff = diffLibraryVersionContent('Cafe\u0301  \r\nRuta\t\r\n', 'Café\nRuta\n\n')
    expect(diff.leftContent).toBe('Café\nRuta\n')
    expect(diff.rightContent).toBe('Café\nRuta\n')
    expect(diff.segments).toEqual([{
      kind: 'context', header: '@@ -1,2 +1,2 @@',
      left: { startLine: 1, endLine: 2, lineCount: 2 },
      right: { startLine: 1, endLine: 2, lineCount: 2 },
      leftLines: ['Café', 'Ruta'], rightLines: ['Café', 'Ruta'],
    }])
    const comparison = buildLibraryVersionComparison(
      originSide({ content: 'Cafe\u0301  \r\nRuta\t\r\n' }),
      revisionSide(revision1, { content: 'Café\nRuta\n\n' }),
    )
    expect(comparison.statistics).toMatchObject({
      addedLines: 0, removedLines: 0, unchangedLines: 2, changedSegments: 0,
    })
  })

  it('representa adiciones, eliminaciones y sus rangos de forma estable', () => {
    const added = diffLibraryVersionContent('A\nC\n', 'A\nB\nC\n')
    expect(added.segments.map(segment => segment.kind)).toEqual(['context', 'added', 'context'])
    expect(added.segments[1]).toEqual({
      kind: 'added', header: '@@ -2,0 +2,1 @@',
      left: { startLine: 2, endLine: 1, lineCount: 0 },
      right: { startLine: 2, endLine: 2, lineCount: 1 },
      leftLines: [], rightLines: ['B'],
    })

    const removed = diffLibraryVersionContent('A\nB\nC\n', 'A\nC\n')
    expect(removed.segments.map(segment => segment.kind)).toEqual([
      'context', 'removed', 'context',
    ])
    expect(removed.segments[1].header).toBe('@@ -2,1 +2,0 @@')
  })

  it('congela una modificación como eliminación seguida de adición', () => {
    const diff = diffLibraryVersionContent('Antes\nTexto viejo\nDespués\n',
      'Antes\nTexto nuevo\nDespués\n')
    expect(diff.segments.map(segment => segment.kind)).toEqual([
      'context', 'removed', 'added', 'context',
    ])
    expect(diff.segments[1].leftLines).toEqual(['Texto viejo'])
    expect(diff.segments[2].rightLines).toEqual(['Texto nuevo'])
  })

  it('separa múltiples bloques y fija el desempate ambiguo en eliminación primero', () => {
    const blocks = diffLibraryVersionContent('A\nx\nB\ny\nC\n', 'A\nX\nB\nY\nC\n')
    expect(blocks.segments.map(segment => segment.kind)).toEqual([
      'context', 'removed', 'added', 'context', 'removed', 'added', 'context',
    ])
    const ambiguous = diffLibraryVersionContent('A\nB\n', 'B\nA\n')
    expect(ambiguous.segments.map(segment => [segment.kind, segment.leftLines,
      segment.rightLines])).toEqual([
      ['removed', ['A'], []],
      ['context', ['B'], ['B']],
      ['added', [], ['A']],
    ])
  })

  it('admite contenido lógico vacío sin relajar el contrato durable', () => {
    const comparison = buildLibraryVersionComparison(
      originSide({ content: '\r\n\n' }),
      revisionSide(revision1, { content: '' }),
    )
    expect(comparison.left.content).toBe('')
    expect(comparison.right.content).toBe('')
    expect(comparison.segments).toEqual([])
    expect(comparison.statistics).toMatchObject({
      leftLines: 0, rightLines: 0, addedLines: 0, removedLines: 0,
      unchangedLines: 0, changedSegments: 0, totalSegments: 0,
    })
  })

  it('calcula estadísticas coherentes con todos los segmentos', () => {
    const comparison = buildLibraryVersionComparison(
      originSide(),
      revisionSide(revision2),
    )
    const changed = comparison.segments.filter(segment => segment.kind !== 'context')
    expect(comparison.statistics).toEqual({
      leftLines: comparison.left.lines.length,
      rightLines: comparison.right.lines.length,
      addedLines: comparison.segments.filter(segment => segment.kind === 'added')
        .reduce((total, segment) => total + segment.right.lineCount, 0),
      removedLines: comparison.segments.filter(segment => segment.kind === 'removed')
        .reduce((total, segment) => total + segment.left.lineCount, 0),
      unchangedLines: comparison.segments.filter(segment => segment.kind === 'context')
        .reduce((total, segment) => total + segment.left.lineCount, 0),
      changedSegments: changed.length,
      totalSegments: comparison.segments.length,
      titleChanged: true,
    })
    expect(LibraryVersionComparisonSchema.parse(comparison)).toEqual(comparison)
  })

  it('mantiene fingerprint y resultado estables y cambia ante contenido o extremo distinto', () => {
    const first = buildLibraryVersionComparison(originSide(), revisionSide(revision2))
    const repeated = buildLibraryVersionComparison(originSide(), revisionSide(revision2))
    const changedContent = buildLibraryVersionComparison(
      originSide(),
      revisionSide(revision2, { content: `${revision2.content}Otra línea\n` }),
    )
    const changedEndpoint = buildLibraryVersionComparison(
      originSide(),
      revisionSide({ ...revision2, id: ids.revision3 }),
    )
    expect(repeated).toEqual(first)
    expect(repeated.fingerprint).toBe(first.fingerprint)
    expect(changedContent.fingerprint).not.toBe(first.fingerprint)
    expect(changedEndpoint.fingerprint).not.toBe(first.fingerprint)
  })

  it('rechaza de forma tipada entradas que exceden el límite de trabajo LCS', () => {
    const left = Array.from({ length: 2_001 }, (_, index) => `L${index}`).join('\n')
    const right = Array.from({ length: 2_001 }, (_, index) => `R${index}`).join('\n')
    expect(() => diffLibraryVersionContent(left, right))
      .toThrow('La comparacion excede los limites deterministas')
  })
})

describe('servicio read-only BIB-V05', () => {
  it('compara v1 con una revisión usando exclusivamente lecturas BIB-V03', async () => {
    const fixture = repositoryFixture()
    const service = new RealEditorialLibraryVersionComparisonService(fixture.repository)
    const result = await service.compare({
      left: { kind: 'origin_v1', libraryEntryId: ids.entry },
      right: { kind: 'revision', versionId: ids.version, revisionId: ids.revision2 },
    })
    expect(result).toMatchObject({
      status: 'ok', comparison: {
        comparisonKind: 'origin_to_revision',
        title: 'v1 (Documento sintético) → v2/r2 (Documento sintético ampliado)',
        left: { kind: 'origin_v1', versionNumber: 1 },
        right: { kind: 'revision', versionNumber: 2, revisionNumber: 2 },
        statistics: { addedLines: 2, removedLines: 1, unchangedLines: 2 },
      },
    })
    expect(fixture.reads.getVersioningSummary).toHaveBeenCalledOnce()
    expect(fixture.reads.getVersionDetail).toHaveBeenCalledOnce()
    expect(fixture.reads.getVersionRevision).not.toHaveBeenCalled()
    expect(fixture.writes.createVersion).not.toHaveBeenCalled()
    expect(fixture.writes.saveRevision).not.toHaveBeenCalled()
    expect(LibraryVersionComparisonResultSchema.parse(result)).toEqual(result)
  })

  it('compara dos revisiones y reutiliza una única lectura de detalle', async () => {
    const fixture = repositoryFixture()
    const service = new RealEditorialLibraryVersionComparisonService(fixture.repository)
    const result = await service.compare({
      left: { kind: 'revision', versionId: ids.version, revisionId: ids.revision1 },
      right: { kind: 'revision', versionId: ids.version, revisionId: ids.revision3 },
    })
    expect(result).toMatchObject({ status: 'ok', comparison: {
      comparisonKind: 'revision_to_revision',
      left: { revisionNumber: 1 }, right: { revisionNumber: 3 },
    } })
    expect(fixture.reads.getVersionDetail).toHaveBeenCalledOnce()
    expect(fixture.reads.getVersionRevision).not.toHaveBeenCalled()
  })

  it('resuelve el padre inmediato de una revisión y valida su hash de linaje', async () => {
    const fixture = repositoryFixture()
    const service = new RealEditorialLibraryVersionComparisonService(fixture.repository)
    const result = await service.compareToParent({
      revision: { kind: 'revision', versionId: ids.version, revisionId: ids.revision3 },
    })
    expect(result).toMatchObject({ status: 'ok', comparison: {
      left: { revisionId: ids.revision2, revisionNumber: 2 },
      right: { revisionId: ids.revision3, revisionNumber: 3 },
    } })
    expect(fixture.reads.getVersionDetail).toHaveBeenCalledOnce()
  })

  it('devuelve errores deterministas para padre ausente y referencias corruptas', async () => {
    const noParent = new RealEditorialLibraryVersionComparisonService(repositoryFixture().repository)
    await expect(noParent.compareToParent({
      revision: { kind: 'revision', versionId: ids.version, revisionId: ids.revision1 },
    })).resolves.toEqual({
      status: 'error', code: 'COMPARISON_PARENT_NOT_FOUND',
      message: 'La revision no tiene un padre inmediato valido',
    })

    const corrupt = repositoryFixture({
      revisions: [revision1, revision2, {
        ...revision3, expectedPreviousRevisionHash: sha256Hex('corrupt-parent'),
      }],
    })
    await expect(new RealEditorialLibraryVersionComparisonService(corrupt.repository)
      .compareToParent({
        revision: { kind: 'revision', versionId: ids.version, revisionId: ids.revision3 },
      })).resolves.toMatchObject({ status: 'error', code: 'INVALID_VERSION_HISTORY' })
  })

  it('rechaza extremos inexistentes, UUID inválidos e incompatibilidad entre artefactos', async () => {
    const missingRepository = repositoryFixture().repository
    vi.mocked(missingRepository.getVersionDetail).mockRejectedValueOnce(
      new LibraryVersioningRepositoryError('VERSION_NOT_FOUND', 'detalle SQL omitido'),
    )
    const missing = new RealEditorialLibraryVersionComparisonService(missingRepository)
    await expect(missing.compare({
      left: { kind: 'origin_v1', libraryEntryId: ids.entry },
      right: { kind: 'revision', versionId: ids.version, revisionId: ids.revision2 },
    })).resolves.toEqual({
      status: 'error', code: 'VERSION_NOT_FOUND', message: 'No existe la version solicitada',
    })
    await expect(missing.compare({
      left: { kind: 'origin_v1', libraryEntryId: ids.otherEntry },
      right: { kind: 'origin_v1', libraryEntryId: ids.entry },
    })).resolves.toMatchObject({ status: 'error', code: 'LIBRARY_ENTRY_NOT_FOUND' })
    await expect(missing.compare({
      left: { kind: 'origin_v1', libraryEntryId: 'uuid-invalido' },
      right: { kind: 'origin_v1', libraryEntryId: ids.entry },
    } as never)).resolves.toMatchObject({ status: 'error', code: 'VALIDATION_ERROR' })

    const incompatibleFixture = repositoryFixture({
      entryId: ids.otherEntry,
      versionId: ids.otherVersion,
      revisions: [{ ...revision1, id: ids.otherRevision, versionId: ids.otherVersion }],
    })
    const mixedRepository = repositoryFixture().repository
    vi.mocked(mixedRepository.getVersionDetail)
      .mockImplementation(incompatibleFixture.repository.getVersionDetail)
    vi.mocked(mixedRepository.getVersionRevision)
      .mockImplementation(incompatibleFixture.repository.getVersionRevision)
    const incompatible = new RealEditorialLibraryVersionComparisonService(mixedRepository)
    await expect(incompatible.compare({
      left: { kind: 'origin_v1', libraryEntryId: ids.entry },
      right: {
        kind: 'revision', versionId: ids.otherVersion, revisionId: ids.otherRevision,
      },
    })).resolves.toEqual({
      status: 'error', code: 'COMPARISON_INCOMPATIBLE',
      message: 'Los extremos no pertenecen al mismo artefacto',
    })
  })

  it('devuelve un error tipado al exceder los límites desde el servicio', async () => {
    const oversized = `${Array.from({ length: 5_001 }, () => 'x').join('\n')}\n`
    const fixture = repositoryFixture({
      revisions: [{ ...revision1, content: oversized }],
    })
    const service = new RealEditorialLibraryVersionComparisonService(fixture.repository)
    await expect(service.compare({
      left: { kind: 'origin_v1', libraryEntryId: ids.entry },
      right: { kind: 'revision', versionId: ids.version, revisionId: ids.revision1 },
    })).resolves.toEqual({
      status: 'error', code: 'COMPARISON_LIMIT_EXCEEDED',
      message: 'La comparacion excede los limites deterministas',
    })
  })
})

type SideInput = Parameters<typeof buildLibraryVersionComparison>[0]

function originSide(patch: Partial<SideInput> = {}): SideInput {
  return {
    kind: 'origin_v1', label: 'v1', libraryEntryId: ids.entry,
    versionId: null, versionNumber: 1, revisionId: null, revisionNumber: null,
    referenceHash: origin.originVersionHash, contentHash: origin.contentHash,
    title: origin.title, content: origin.content, ...patch,
  }
}

function revisionSide(
  item: LibraryVersionRevisionDetail,
  patch: Partial<SideInput> = {},
): SideInput {
  return {
    kind: 'revision', label: `v2/r${item.revisionNumber}`, libraryEntryId: ids.entry,
    versionId: item.versionId, versionNumber: 2, revisionId: item.id,
    revisionNumber: item.revisionNumber, referenceHash: item.revisionHash,
    contentHash: item.contentHash, title: item.title, content: item.content, ...patch,
  }
}

function revision(input: {
  id: string
  revisionNumber: number
  title: string
  content: string
  previousRevisionId: string | null
  expectedPreviousRevisionHash: string | null
}): LibraryVersionRevisionDetail {
  return {
    ...input,
    versionId: ids.version,
    contentSchemaContract: 'investighost-library-content-v1',
    canonicalizationContract: 'investighost-library-c14n-v1',
    contentHash: sha256Hex(`content:${input.id}:${input.content}:${input.title}`),
    revisionHash: sha256Hex(`revision:${input.id}`),
    changeSummary: 'Cambio exclusivamente sintético.',
    createdByActorId: 'b4000000-0000-4000-8000-000000000001',
    createdAt: '2026-08-08T10:00:00.000Z',
    operationKey: sha256Hex(`operation:${input.id}`),
  }
}

function repositoryFixture(options: {
  entryId?: string
  versionId?: string
  revisions?: LibraryVersionRevisionDetail[]
} = {}) {
  const entryId = options.entryId ?? ids.entry
  const versionId = options.versionId ?? ids.version
  const revisions = (options.revisions ?? [revision1, revision2, revision3])
    .map(item => ({ ...item, versionId }))
  const fixtureOrigin = { ...origin, libraryEntryId: entryId }
  const summary = {
    libraryEntryId: entryId,
    originalVersion: fixtureOrigin,
  } as unknown as LibraryEntryVersioningSummary
  const detail = {
    version: { versionId, libraryEntryId: entryId, versionNumber: 2 },
    originV1: fixtureOrigin,
    revisions,
  } as unknown as LibraryVersionDetail
  const reads = {
    getVersioningSummary: vi.fn(async (requestedEntryId: string) => {
      if (requestedEntryId !== entryId) {
        throw new LibraryVersioningRepositoryError(
          'LIBRARY_ENTRY_NOT_FOUND', 'fixture entry inexistente',
        )
      }
      return summary
    }),
    getVersionDetail: vi.fn(async (requestedVersionId: string) => {
      if (requestedVersionId !== versionId) {
        throw new LibraryVersioningRepositoryError('VERSION_NOT_FOUND', 'fixture version inexistente')
      }
      return detail
    }),
    getVersionRevision: vi.fn(async (requestedVersionId: string, revisionId: string) => {
      if (requestedVersionId !== versionId) {
        throw new LibraryVersioningRepositoryError('VERSION_NOT_FOUND', 'fixture version inexistente')
      }
      const item = revisions.find(candidate => candidate.id === revisionId)
      if (item === undefined) {
        throw new LibraryVersioningRepositoryError('REVISION_NOT_FOUND', 'fixture revision inexistente')
      }
      return item
    }),
  }
  const writes = { createVersion: vi.fn(), saveRevision: vi.fn() }
  return {
    reads,
    writes,
    repository: { ...reads, ...writes } as unknown as RealEditorialLibraryVersioningReadRepository,
  }
}
