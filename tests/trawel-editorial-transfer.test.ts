import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import {
  TrawelEditorialTransferService,
  prepareTrawelEditorialHandoff,
  type TrawelEditorialApprovedSourcePort,
  type TrawelEditorialTransferPort,
} from '@modules/trawel-handoff'
import {
  TrawelEditorialTransferCommandSchema,
  TrawelEditorialTransferResultSchema,
  type TrawelEditorialTransferCommand,
} from '@shared/trawel-editorial-transfer-contracts'
import type {
  TrawelEditorialContentDraft,
  TrawelEditorialTarget,
} from '@shared/trawel-editorial-handoff-contracts'
import {
  buildSyntheticApprovedSource,
  buildSyntheticHandoffCommand,
  syntheticCreatedAt,
  syntheticDerivedAt,
  syntheticTrawelIds,
  syntheticTrawelTarget,
} from './support/trawel-handoff-fixture'

describe('E2E-03 transferencia controlada y read-back sintéticos', () => {
  it('inserta dos drafts privados, relee lo durable y devuelve PASS exacto', async () => {
    const sources = new SyntheticApprovedSourcePort()
    const trawel = new SyntheticTrawelPort()

    const result = await application(sources, trawel).transfer(transferCommand())

    expect(result).toMatchObject({
      status: 'verified',
      outcome: 'PASS',
      operation: 'inserted',
      readBackPerformed: true,
      publicReadPerformed: true,
      publicationState: 'private_draft',
      publiclyVisible: false,
      reusedRowIds: [],
      differences: [],
    })
    expect(TrawelEditorialTransferResultSchema.parse(result)).toEqual(result)
    expect(trawel.insertedIds).toHaveLength(2)
    expect(trawel.privateReadCount).toBe(2)
    expect(trawel.publicReadCount).toBe(1)
    expect(trawel.rows.size).toBe(2)
    expect([...trawel.rows.values()]).toEqual(expect.arrayContaining([
      expect.objectContaining({
        mode: 'adventure',
        headline: 'Origen Aventura sintético',
        intro: 'Contenido Aventura original y sintético.\n',
        status: 'draft',
        published_at: null,
      }),
      expect.objectContaining({
        mode: 'student',
        headline: 'Estudiante v2 aprobado sintético',
        intro: 'Contenido Estudiante v2 aprobado y sintético.\n',
        status: 'draft',
        published_at: null,
      }),
    ]))
  })

  it('repite el comando sin duplicar y tolera solo timestamps gestionados por Trawel', async () => {
    const sources = new SyntheticApprovedSourcePort()
    const trawel = new SyntheticTrawelPort()
    const service = application(sources, trawel)
    const first = await service.transfer(transferCommand())

    const repeated = await service.transfer(transferCommand())

    expect(first).toMatchObject({ status: 'verified', operation: 'inserted' })
    expect(repeated).toMatchObject({
      status: 'verified', outcome: 'PASS', operation: 'reused',
      insertedRowIds: [], publiclyVisible: false, differences: [],
    })
    expect(trawel.insertedIds).toHaveLength(2)
    expect(trawel.rows.size).toBe(2)
    expect(trawel.privateReadCount).toBe(4)
    expect(trawel.timestampPairs.size).toBeGreaterThan(1)
  })

  it('completa un parcial privado compatible y conserva la identidad idempotente', async () => {
    const sources = new SyntheticApprovedSourcePort()
    const trawel = new SyntheticTrawelPort()
    const payload = prepareTrawelEditorialHandoff(buildSyntheticHandoffCommand())
    trawel.seed(payload.rows[0])

    const result = await application(sources, trawel).transfer(transferCommand())

    expect(result).toMatchObject({
      status: 'verified', outcome: 'PASS', operation: 'recovered_partial',
      insertedRowIds: [payload.rows[1]?.id], reusedRowIds: [payload.rows[0]?.id],
    })
    expect(trawel.insertedIds).toEqual([payload.rows[1]?.id])
    expect(trawel.rows.size).toBe(2)
  })

  it('declara FAIL parcial recuperable si la segunda escritura se interrumpe', async () => {
    const sources = new SyntheticApprovedSourcePort()
    const trawel = new SyntheticTrawelPort()
    trawel.failInsertAttempt = 2

    const result = await application(sources, trawel).transfer(transferCommand())

    expect(result).toMatchObject({
      status: 'partial_private_draft',
      outcome: 'FAIL',
      code: 'WRITE_FAILED',
      publicationState: 'private_draft',
      publiclyVisible: false,
    })
    expect(result.status === 'partial_private_draft' && result.presentRowIds).toHaveLength(1)
    expect(result.status === 'partial_private_draft' && result.missingRowIds).toHaveLength(1)
    expect(result.status === 'partial_private_draft' && result.differences[0]?.kind)
      .toBe('missing')
    expect(trawel.rows.size).toBe(1)
    expect(trawel.publicReadCount).toBe(1)

    trawel.failInsertAttempt = null
    const recovered = await application(sources, trawel).transfer(transferCommand())
    expect(recovered).toMatchObject({
      status: 'verified', outcome: 'PASS', operation: 'recovered_partial',
    })
    expect(trawel.rows.size).toBe(2)
    expect(trawel.insertedIds).toHaveLength(2)
  })

  it('detecta una discrepancia deliberada del read-back con path y valores', async () => {
    const sources = new SyntheticApprovedSourcePort()
    const trawel = new SyntheticTrawelPort()
    trawel.transformPrivateRead = (rows, readNumber) => readNumber === 2
      ? rows.map((row, index) => index === 0
          ? { ...asRecord(row), headline: 'Título alterado en destino' }
          : row)
      : rows

    const result = await application(sources, trawel).transfer(transferCommand())

    expect(result).toMatchObject({
      status: 'conflict', outcome: 'FAIL', code: 'READ_BACK_MISMATCH',
      readBackPerformed: true, publicReadPerformed: true, publiclyVisible: false,
    })
    expect(result.status === 'conflict' && result.differences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: expect.stringContaining('.headline'),
          kind: 'different',
          actual: 'Título alterado en destino',
        }),
      ]),
    )
  })

  it('rechaza una aprobación posterior incompatible en los mismos IDs sin sobrescribir', async () => {
    const sources = new SyntheticApprovedSourcePort()
    const trawel = new SyntheticTrawelPort()
    const service = application(sources, trawel)
    await expect(service.transfer(transferCommand())).resolves.toMatchObject({
      status: 'verified', operation: 'inserted',
    })
    const before = snapshotRows(trawel)
    sources.candidates = [
      buildSyntheticApprovedSource('adventure'),
      buildSyntheticApprovedSource('student', true, {
        title: 'Estudiante v3 sintético incompatible',
        content: 'Otro contenido aprobado sintético.\n',
      }),
    ]

    const result = await service.transfer(transferCommand())

    expect(result).toMatchObject({
      status: 'conflict', outcome: 'FAIL', code: 'EXISTING_ROW_CONFLICT',
    })
    expect(result.status === 'conflict' && result.differences.some(item =>
      item.path.endsWith('.intro') || item.path.endsWith('.headline'),
    )).toBe(true)
    expect(snapshotRows(trawel)).toEqual(before)
    expect(trawel.insertedIds).toHaveLength(2)
  })

  it('bloquea antes de Trawel una entrada no aprobada o una versión no inequívoca', async () => {
    const unapproved = new SyntheticApprovedSourcePort()
    const invalid = structuredClone(buildSyntheticApprovedSource('adventure')) as unknown
    asRecord(asRecord(invalid).entry).status = 'draft'
    unapproved.candidates = [invalid, buildSyntheticApprovedSource('student')]
    const firstTrawel = new SyntheticTrawelPort()

    await expect(application(unapproved, firstTrawel).transfer(transferCommand()))
      .resolves.toMatchObject({
        status: 'error', outcome: 'FAIL', code: 'SOURCE_NOT_APPROVED',
      })
    expect(firstTrawel.resolveTargetCount).toBe(0)
    expect(firstTrawel.insertedIds).toEqual([])

    const ambiguous = new SyntheticApprovedSourcePort()
    ambiguous.candidates = [
      buildSyntheticApprovedSource('adventure'),
      buildSyntheticApprovedSource('adventure'),
    ]
    const secondTrawel = new SyntheticTrawelPort()
    await expect(application(ambiguous, secondTrawel).transfer(transferCommand()))
      .resolves.toMatchObject({
        status: 'error', outcome: 'FAIL', code: 'SOURCE_VERSION_AMBIGUOUS',
      })
    expect(secondTrawel.resolveTargetCount).toBe(0)
    expect(secondTrawel.insertedIds).toEqual([])
  })

  it('falla cerrado si el target leído no coincide y no toca filas', async () => {
    const sources = new SyntheticApprovedSourcePort()
    const trawel = new SyntheticTrawelPort()
    trawel.resolvedTarget = {
      ...syntheticTrawelTarget,
      entityId: 'e2000000-0000-4000-8000-000000000099',
      entitySlug: 'otra-villa-sintetica',
      zoneSlug: 'otra-villa-sintetica',
    }

    const result = await application(sources, trawel).transfer(transferCommand())

    expect(result).toMatchObject({
      status: 'error', outcome: 'FAIL', code: 'TARGET_MISMATCH',
      readBackPerformed: false,
    })
    expect(result.status === 'error' && result.differences[0]?.path).toBe('target')
    expect(trawel.privateReadCount).toBe(0)
    expect(trawel.insertedIds).toEqual([])
  })

  it('considera cualquier lectura pública una violación aunque el draft privado coincida', async () => {
    const sources = new SyntheticApprovedSourcePort()
    const trawel = new SyntheticTrawelPort()
    trawel.exposeAllPublicly = true

    const result = await application(sources, trawel).transfer(transferCommand())

    expect(result).toMatchObject({
      status: 'error', outcome: 'FAIL', code: 'PUBLIC_VISIBILITY_VIOLATION',
      readBackPerformed: true, publicReadPerformed: true, publiclyVisible: true,
    })
    expect(trawel.rows.size).toBe(2)
    expect([...trawel.rows.values()].every(row =>
      row.status === 'draft' && row.published_at === null,
    )).toBe(true)
  })

  it('mantiene cerrado el resultado PASS y la identidad de un parcial', async () => {
    const trawel = new SyntheticTrawelPort()
    const verified = await application(new SyntheticApprovedSourcePort(), trawel)
      .transfer(transferCommand())
    expect(verified.status).toBe('verified')
    expect(TrawelEditorialTransferResultSchema.safeParse({
      ...verified,
      operation: 'reused',
    }).success).toBe(false)

    const interrupted = new SyntheticTrawelPort()
    interrupted.failInsertAttempt = 2
    const partial = await application(new SyntheticApprovedSourcePort(), interrupted)
      .transfer(transferCommand())
    expect(partial.status).toBe('partial_private_draft')
    if (partial.status !== 'partial_private_draft') return
    expect(TrawelEditorialTransferResultSchema.safeParse({
      ...partial,
      missingRowIds: partial.presentRowIds,
    }).success).toBe(false)
  })

  it('no incorpora cliente real, proveedores, publicación ni superficies Electron', async () => {
    const files = await Promise.all([
      readFile(new URL('../src/modules/trawel-handoff/transfer-service.ts', import.meta.url), 'utf8'),
      readFile(
        new URL('../src/shared/trawel-editorial-transfer-contracts.ts', import.meta.url),
        'utf8',
      ),
    ])
    const sourceCode = files.join('\n')
    for (const forbidden of [
      '@supabase/supabase-js', 'createClient(', 'fetch(', 'Tavily', 'OpenAI',
      'publishToTrawel', 'ipcMain', 'ipcRenderer', 'contextBridge', 'BrowserWindow',
    ]) {
      expect(sourceCode).not.toContain(forbidden)
    }
  })
})

class SyntheticApprovedSourcePort implements TrawelEditorialApprovedSourcePort {
  candidates: unknown[] = [
    buildSyntheticApprovedSource('student'),
    buildSyntheticApprovedSource('adventure'),
  ]

  async loadApprovedSources(): Promise<unknown[]> {
    return structuredClone(this.candidates)
  }
}

class SyntheticTrawelPort implements TrawelEditorialTransferPort {
  readonly rows = new Map<string, TrawelEditorialContentDraft>()
  readonly insertedIds: string[] = []
  readonly timestampPairs = new Set<string>()
  resolvedTarget: TrawelEditorialTarget | null = syntheticTrawelTarget
  resolveTargetCount = 0
  privateReadCount = 0
  publicReadCount = 0
  insertAttemptCount = 0
  failInsertAttempt: number | null = null
  exposeAllPublicly = false
  transformPrivateRead: ((rows: unknown[], readNumber: number) => unknown[]) | null = null

  async resolveTarget(): Promise<unknown | null> {
    this.resolveTargetCount += 1
    return this.resolvedTarget === null ? null : structuredClone(this.resolvedTarget)
  }

  async readPrivateDrafts(_projectRef: string, rowIds: readonly string[]): Promise<unknown[]> {
    this.privateReadCount += 1
    const createdAt = this.privateReadCount % 2 === 0
      ? syntheticCreatedAt
      : syntheticDerivedAt
    const updatedAt = this.privateReadCount % 2 === 0
      ? syntheticDerivedAt
      : syntheticCreatedAt
    this.timestampPairs.add(`${createdAt}|${updatedAt}`)
    const rows = rowIds.flatMap(rowId => {
      const row = this.rows.get(rowId)
      return row === undefined ? [] : [{
        ...structuredClone(row),
        created_at: createdAt,
        updated_at: updatedAt,
      }]
    }).reverse()
    return this.transformPrivateRead === null
      ? rows
      : this.transformPrivateRead(rows, this.privateReadCount)
  }

  async insertPrivateDraft(
    _projectRef: string,
    row: TrawelEditorialContentDraft,
  ): Promise<void> {
    this.insertAttemptCount += 1
    if (this.failInsertAttempt === this.insertAttemptCount) {
      throw new Error('fallo sintético de escritura')
    }
    if (this.rows.has(row.id)) throw new Error('conflicto sintético de ID')
    this.rows.set(row.id, structuredClone(row))
    this.insertedIds.push(row.id)
  }

  async readPublicRows(_projectRef: string, rowIds: readonly string[]): Promise<unknown[]> {
    this.publicReadCount += 1
    if (!this.exposeAllPublicly) return []
    return rowIds.flatMap(rowId => {
      const row = this.rows.get(rowId)
      return row === undefined ? [] : [structuredClone(row)]
    })
  }

  seed(row: TrawelEditorialContentDraft): void {
    this.rows.set(row.id, structuredClone(row))
  }
}

function application(
  sources: TrawelEditorialApprovedSourcePort,
  trawel: TrawelEditorialTransferPort,
): TrawelEditorialTransferService {
  return new TrawelEditorialTransferService(sources, trawel)
}

function transferCommand(): TrawelEditorialTransferCommand {
  return TrawelEditorialTransferCommandSchema.parse({
    libraryEntryIds: [
      syntheticTrawelIds.adventureEntry,
      syntheticTrawelIds.studentEntry,
    ],
    target: syntheticTrawelTarget,
    actorId: syntheticTrawelIds.actor,
    confirmed: true,
  })
}

function snapshotRows(trawel: SyntheticTrawelPort): string {
  return JSON.stringify([...trawel.rows.entries()].sort(([left], [right]) =>
    left < right ? -1 : left === right ? 0 : 1,
  ))
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('fixture sintético inválido')
  }
  return value as Record<string, unknown>
}
