import type { RemoteContribution, RemoteContributionFile } from '@shared/contracts'
import type { ContributionIntegrityService, ContributionRemoteSource } from './types'

export interface MockContributionSeed {
  remoteId: string
  sourceType?: RemoteContribution['sourceType']
  content: string
  files?: Array<{ id: string; name: string; mimeType: RemoteContributionFile['mimeType']; bytes: Uint8Array }>
  corruptFileIds?: string[]
  failDownload?: boolean
  failDelete?: boolean
  payloadHashOverride?: string
}

export class MockContributionRemoteSource implements ContributionRemoteSource {
  readonly kind = 'mock' as const
  private readonly records = new Map<string, RemoteContribution>()
  private readonly bytes = new Map<string, Uint8Array>()
  private readonly seeds = new Map<string, MockContributionSeed>()
  readonly deleted: string[] = []

  constructor(seeds: MockContributionSeed[], private readonly integrity: ContributionIntegrityService) {
    for (const seed of seeds) this.add(seed)
  }

  private add(seed: MockContributionSeed): void {
    const files = (seed.files ?? []).map(file => {
      this.bytes.set(`${seed.remoteId}:${file.id}`, file.bytes)
      return { remoteFileId: file.id, originalName: file.name, mimeType: file.mimeType, size: file.bytes.byteLength, sha256: this.integrity.sha256(file.bytes) }
    })
    const base = {
      remoteId: seed.remoteId,
      sourceType: seed.sourceType ?? 'suggestion',
      remoteCreatedAt: new Date('2026-07-12T10:00:00.000Z'),
      content: seed.content,
      metadata: { origin: 'mock-trawel' },
      files,
      version: 1,
    } satisfies Omit<RemoteContribution, 'payloadSize' | 'payloadSha256'>
    const provisional = { ...base, payloadSize: 1, payloadSha256: '0'.repeat(64) }
    const normalized = this.integrity.normalizePayload(provisional)
    this.records.set(seed.remoteId, { ...base, payloadSize: Buffer.byteLength(normalized), payloadSha256: seed.payloadHashOverride ?? this.integrity.sha256(normalized) })
    this.seeds.set(seed.remoteId, seed)
  }

  async listPending(): Promise<RemoteContribution[]> { return [...this.records.values()].map(record => structuredClone(record)) }

  async downloadFile(remoteId: string, file: RemoteContributionFile): Promise<Uint8Array> {
    const seed = this.seeds.get(remoteId)
    if (seed?.failDownload) throw new Error('NETWORK_ERROR: descarga simulada interrumpida')
    const value = this.bytes.get(`${remoteId}:${file.remoteFileId}`)
    if (!value) throw new Error('REMOTE_FILE_NOT_FOUND')
    if (seed?.corruptFileIds?.includes(file.remoteFileId)) return new Uint8Array([...value, 0])
    return new Uint8Array(value)
  }

  async deleteFiles(remoteId: string, fileIds: string[]): Promise<void> {
    if (this.seeds.get(remoteId)?.failDelete) throw new Error('REMOTE_DELETE_FAILED')
    for (const id of fileIds) this.bytes.delete(`${remoteId}:${id}`)
  }

  async deleteContribution(remoteId: string): Promise<void> {
    if (this.seeds.get(remoteId)?.failDelete) throw new Error('REMOTE_DELETE_FAILED')
    this.records.delete(remoteId)
    this.deleted.push(remoteId)
  }

  clearFailures(remoteId: string): void {
    const seed = this.seeds.get(remoteId)
    if (!seed) return
    seed.failDownload = false
    seed.failDelete = false
    seed.corruptFileIds = []
    seed.payloadHashOverride = undefined
  }
}
