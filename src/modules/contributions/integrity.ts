import { createHash } from 'node:crypto'
import {
  RemoteContributionSchema,
  type RemoteContribution,
  type RemoteContributionFile,
} from '@shared/contracts'
import type { ContributionIntegrityService } from './types'

export class IntegrityError extends Error {
  constructor(readonly code: 'INVALID_PAYLOAD' | 'PAYLOAD_HASH_MISMATCH' | 'PAYLOAD_SIZE_MISMATCH' | 'FILE_HASH_MISMATCH' | 'FILE_SIZE_MISMATCH', message: string) {
    super(message)
    this.name = 'IntegrityError'
  }
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)]))
  }
  return value instanceof Date ? value.toISOString() : value
}

export class Sha256ContributionIntegrityService implements ContributionIntegrityService {
  normalizePayload(remote: RemoteContribution): string {
    const payload = {
      remoteId: remote.remoteId,
      sourceType: remote.sourceType,
      remoteCreatedAt: remote.remoteCreatedAt,
      content: remote.content.trim().replace(/\r\n/g, '\n'),
      metadata: remote.metadata,
      files: remote.files.map(({ remoteFileId, originalName, mimeType, size, sha256 }) => ({ remoteFileId, originalName, mimeType, size, sha256 })),
      version: remote.version,
    }
    return JSON.stringify(stableValue(payload))
  }

  sha256(input: string | Uint8Array): string {
    return createHash('sha256').update(input).digest('hex')
  }

  verifyPayload(remote: RemoteContribution, normalizedPayload: string): void {
    const parsed = RemoteContributionSchema.safeParse(remote)
    if (!parsed.success) throw new IntegrityError('INVALID_PAYLOAD', parsed.error.issues.map(issue => issue.message).join('; '))
    const size = Buffer.byteLength(normalizedPayload, 'utf8')
    if (size !== remote.payloadSize) throw new IntegrityError('PAYLOAD_SIZE_MISMATCH', `Tamaño esperado ${remote.payloadSize}; recibido ${size}`)
    const hash = this.sha256(normalizedPayload)
    if (hash !== remote.payloadSha256) throw new IntegrityError('PAYLOAD_HASH_MISMATCH', `Hash esperado ${remote.payloadSha256}; recibido ${hash}`)
  }

  verifyFile(remote: RemoteContributionFile, bytes: Uint8Array): void {
    if (bytes.byteLength !== remote.size) throw new IntegrityError('FILE_SIZE_MISMATCH', `Archivo ${remote.remoteFileId} truncado`)
    const hash = this.sha256(bytes)
    if (hash !== remote.sha256) throw new IntegrityError('FILE_HASH_MISMATCH', `Checksum distinto en ${remote.remoteFileId}`)
    if (bytes.byteLength === 0) throw new IntegrityError('FILE_SIZE_MISMATCH', `Archivo ${remote.remoteFileId} vacío`)
  }
}

