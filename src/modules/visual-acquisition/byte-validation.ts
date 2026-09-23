import { createHash } from 'node:crypto'
import type { VisualCandidate } from '@shared/visual-candidate-contracts'

export const VISUAL_MEDIA_MAX_BYTES = 20 * 1024 * 1024
export const VISUAL_MEDIA_MIME_ALLOWLIST = new Set(['image/jpeg', 'image/png', 'image/webp'])

export type ValidatedVisualDownload = {
  bytes: Uint8Array
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
  width: number
  height: number
  byteSize: number
  checksum: string
  extension: 'jpg' | 'png' | 'webp'
  downloadedAt: string
}

export class VisualDownloadError extends Error {
  constructor(readonly code: VisualDownloadFailureCode, detail?: string) { super(detail === undefined ? code : `${code}:${detail}`) }
}

export type VisualDownloadFailureCode =
  | 'DOWNLOAD_TIMEOUT' | 'DOWNLOAD_FAILED' | 'INVALID_CONTENT_TYPE' | 'INVALID_MAGIC_BYTES'
  | 'TOO_LARGE' | 'CORRUPT_IMAGE' | 'DIMENSIONS_TOO_SMALL' | 'REDIRECT_NOT_ALLOWED'

/** Injectable only at the external byte-download boundary. */
export type VisualDownloadFetch = (input: string, init: RequestInit) => Promise<Pick<Response, 'ok' | 'status' | 'headers' | 'arrayBuffer' | 'redirected'>>

export class VisualCandidateDownloader {
  constructor(
    private readonly fetchFn: VisualDownloadFetch = fetch,
    private readonly now: () => Date = () => new Date(),
    private readonly timeoutMs = 15_000,
    private readonly maxBytes = VISUAL_MEDIA_MAX_BYTES,
  ) {}

  async download(candidate: VisualCandidate): Promise<ValidatedVisualDownload> {
    if (candidate.originalMediaUrl === null) throw new VisualDownloadError('DOWNLOAD_FAILED', 'ORIGINAL_URL_MISSING')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      let response: Awaited<ReturnType<VisualDownloadFetch>>
      try {
        response = await this.fetchFn(candidate.originalMediaUrl, {
          method: 'GET', signal: controller.signal, redirect: 'error', headers: { Accept: 'image/jpeg,image/png,image/webp' },
        })
      } catch (error) {
        if (controller.signal.aborted) throw new VisualDownloadError('DOWNLOAD_TIMEOUT')
        throw new VisualDownloadError('DOWNLOAD_FAILED', error instanceof Error ? error.message : undefined)
      }
      if (response.redirected) throw new VisualDownloadError('REDIRECT_NOT_ALLOWED')
      if (!response.ok) throw new VisualDownloadError('DOWNLOAD_FAILED', `HTTP_${response.status}`)
      const declaredMime = normalizeMime(response.headers.get('content-type'))
      if (declaredMime === null || !VISUAL_MEDIA_MIME_ALLOWLIST.has(declaredMime)) throw new VisualDownloadError('INVALID_CONTENT_TYPE')
      const declaredSize = contentLength(response.headers.get('content-length'))
      if (declaredSize !== null && declaredSize > this.maxBytes) throw new VisualDownloadError('TOO_LARGE')
      const bytes = new Uint8Array(await response.arrayBuffer())
      if (bytes.byteLength === 0) throw new VisualDownloadError('CORRUPT_IMAGE')
      if (bytes.byteLength > this.maxBytes) throw new VisualDownloadError('TOO_LARGE')
      const inspected = inspectImage(bytes)
      if (inspected === null) throw new VisualDownloadError('INVALID_MAGIC_BYTES')
      if (inspected.mimeType !== declaredMime) throw new VisualDownloadError('INVALID_CONTENT_TYPE')
      if (!dimensionsMeetRole(candidate.requestedRole, inspected.width, inspected.height)) throw new VisualDownloadError('DIMENSIONS_TOO_SMALL')
      return {
        bytes, ...inspected, byteSize: bytes.byteLength,
        checksum: createHash('sha256').update(bytes).digest('hex'), downloadedAt: this.now().toISOString(),
      }
    } finally {
      clearTimeout(timer)
    }
  }
}

export function dimensionsMeetRole(role: VisualCandidate['requestedRole'], width: number, height: number): boolean {
  const longSide = Math.max(width, height); const shortSide = Math.min(width, height)
  if (role === 'hero') return width >= height && width >= 1600 && height >= 900 && width / height <= 2.5
  if (role === 'highlight') return longSide >= 1200 && shortSide >= 675
  return longSide >= 1000 && shortSide >= 600
}

function inspectImage(bytes: Uint8Array): Pick<ValidatedVisualDownload, 'mimeType' | 'width' | 'height' | 'extension'> | null {
  return inspectPng(bytes) ?? inspectJpeg(bytes) ?? inspectWebp(bytes)
}

function inspectPng(bytes: Uint8Array): Pick<ValidatedVisualDownload, 'mimeType' | 'width' | 'height' | 'extension'> | null {
  if (bytes.length < 24 || ![137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return null
  if (String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR') throw new VisualDownloadError('CORRUPT_IMAGE')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const width = view.getUint32(16); const height = view.getUint32(20)
  if (width === 0 || height === 0) throw new VisualDownloadError('CORRUPT_IMAGE')
  return { mimeType: 'image/png', width, height, extension: 'png' }
}

function inspectJpeg(bytes: Uint8Array): Pick<ValidatedVisualDownload, 'mimeType' | 'width' | 'height' | 'extension'> | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  let offset = 2
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) throw new VisualDownloadError('CORRUPT_IMAGE')
    while (bytes[offset] === 0xff) offset += 1
    const marker = bytes[offset++]
    if (marker === 0xd9) break
    if (marker === 0xda) break
    const length = (bytes[offset] << 8) | bytes[offset + 1]
    if (length < 2 || offset + length > bytes.length) throw new VisualDownloadError('CORRUPT_IMAGE')
    if (isSofMarker(marker)) {
      const height = (bytes[offset + 3] << 8) | bytes[offset + 4]
      const width = (bytes[offset + 5] << 8) | bytes[offset + 6]
      if (width === 0 || height === 0) throw new VisualDownloadError('CORRUPT_IMAGE')
      return { mimeType: 'image/jpeg', width, height, extension: 'jpg' }
    }
    offset += length
  }
  throw new VisualDownloadError('CORRUPT_IMAGE')
}

function inspectWebp(bytes: Uint8Array): Pick<ValidatedVisualDownload, 'mimeType' | 'width' | 'height' | 'extension'> | null {
  if (bytes.length < 30 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') return null
  const type = ascii(bytes, 12, 4)
  let width = 0; let height = 0
  if (type === 'VP8X' && bytes.length >= 30) {
    width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16)
    height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16)
  } else if (type === 'VP8 ' && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    width = (bytes[26] | (bytes[27] << 8)) & 0x3fff
    height = (bytes[28] | (bytes[29] << 8)) & 0x3fff
  } else if (type === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
    const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24)
    width = (bits & 0x3fff) + 1; height = ((bits >> 14) & 0x3fff) + 1
  }
  if (width === 0 || height === 0) throw new VisualDownloadError('CORRUPT_IMAGE')
  return { mimeType: 'image/webp', width, height, extension: 'webp' }
}

function isSofMarker(marker: number): boolean { return [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) }
function ascii(bytes: Uint8Array, start: number, length: number): string { return String.fromCharCode(...bytes.slice(start, start + length)) }
function normalizeMime(value: string | null): string | null { return value === null ? null : value.split(';')[0]?.trim().toLowerCase() ?? null }
function contentLength(value: string | null): number | null { if (value === null || !/^\d+$/.test(value)) return null; return Number(value) }
