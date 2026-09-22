import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { VisualCandidateAcquisitionService } from '@modules/visual-acquisition/candidate-acquisition-service'
import { VisualCandidateDownloader, VisualDownloadError } from '@modules/visual-acquisition/byte-validation'
import { selectVisualCandidates } from '@modules/visual-acquisition/candidate-selection'
import { MemoryVisualCandidateRepository } from '@modules/visual-acquisition/candidate-repository'
import { MemoryVisualMediaStorage } from '@modules/visual-acquisition/media-storage'
import { MemoryVisualProcessingRepository } from '@modules/visual-acquisition/processing-repository'
import type { VisualCandidate } from '@shared/visual-candidate-contracts'

const destinationId = '11111111-1111-4111-8111-111111111111'
const ids = ['22222222-2222-4222-8222-222222222221', '22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222223', '22222222-2222-4222-8222-222222222224']

function candidate(index: number, role: VisualCandidate['requestedRole'], overrides: Partial<VisualCandidate> = {}): VisualCandidate {
  return {
    candidateId: ids[index]!, destinationId, provider: 'wikimedia_commons', providerAssetId: `commons-${index}`,
    canonicalTitle: `File:Cuenca-${index}.png`, sourcePageUrl: `https://commons.wikimedia.org/wiki/File:Cuenca-${index}.png`,
    originalMediaUrl: `https://upload.wikimedia.org/cuenca-${index}.png`, mimeType: 'image/png', width: 1800, height: 1000,
    byteSize: 10_000, creator: 'Autora Commons', uploader: 'Uploader Commons', sourceName: 'Wikimedia Commons',
    licenseShortName: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', usageTerms: 'Creative Commons Attribution 4.0',
    attributionText: 'Autora Commons — Wikimedia Commons — CC BY 4.0', description: `Vista documentada de Cuenca ${index}`,
    requestedCategory: 'landmark', requestedRole: role, discoveredAt: '2026-09-22T10:00:00.000Z',
    providerMetadataHash: createHash('sha256').update(`candidate-${index}`).digest('hex'), normalizedLicense: 'CC_BY_4_0', state: 'ELIGIBLE', rejectionReason: null,
    ...overrides,
  }
}

function png(width = 1800, height = 1000, marker = 1): Uint8Array {
  const bytes = new Uint8Array(32)
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82])
  new DataView(bytes.buffer).setUint32(16, width); new DataView(bytes.buffer).setUint32(20, height)
  bytes[31] = marker
  return bytes
}

function response(bytes: Uint8Array, contentType = 'image/png'): Response {
  return new Response(bytes, { status: 200, headers: { 'content-type': contentType, 'content-length': String(bytes.byteLength) } })
}

function service(candidates: VisualCandidate[], fetchFn: typeof fetch) {
  const candidateRepository = new MemoryVisualCandidateRepository()
  const processing = new MemoryVisualProcessingRepository()
  const storage = new MemoryVisualMediaStorage()
  const downloader = new VisualCandidateDownloader(fetchFn, () => new Date('2026-09-22T12:00:00.000Z'))
  const acquisition = new VisualCandidateAcquisitionService(candidateRepository, processing, downloader, storage, () => new Date('2026-09-22T12:00:00.000Z'), () => '33333333-3333-4333-8333-333333333333', () => '44444444-4444-4444-8444-444444444444')
  return { candidateRepository, processing, storage, acquisition }
}

describe('visual candidate selection and approved storage V1', () => {
  it('selects hero, highlights and gallery deterministically without reusing a candidate', () => {
    const selections = selectVisualCandidates([
      candidate(1, 'hero', { width: 1600, height: 900 }), candidate(0, 'hero', { width: 2200, height: 1200 }),
      candidate(2, 'highlight'), candidate(3, 'gallery'),
    ], { modes: ['adventure'], highlightLimit: 4, galleryLimit: 6 })
    expect(selections.map(selection => [selection.role, selection.candidate.candidateId])).toEqual([
      ['hero', ids[0]], ['highlight', ids[2]], ['gallery', ids[3]],
    ])
    expect(new Set(selections.map(selection => selection.candidate.candidateId)).size).toBe(selections.length)
  })

  it('stages, validates, hashes, promotes and packages approved assets without any handoff', async () => {
    const values = [candidate(0, 'hero'), candidate(1, 'highlight'), candidate(2, 'highlight'), candidate(3, 'gallery')]
    const fetchFn = vi.fn(async (url: string) => response(png(1800, 1000, Number(url.match(/-(\d)\.png$/)?.[1] ?? 0)))) as unknown as typeof fetch
    const context = service(values, fetchFn)
    for (const value of values) await context.candidateRepository.upsert(value)
    const first = await context.acquisition.acquireDestination(destinationId, { modes: ['adventure'] })
    expect(first.package.state).toBe('APPROVED')
    expect(first.promotions).toHaveLength(4)
    expect(context.storage.stageUploads).toBe(4)
    expect(context.storage.publicUploads).toBe(4)
    expect(first.promotions.every(promotion => promotion.asset.lifecycle === 'APPROVED' && promotion.asset.rightsStatus === 'APPROVED_FOR_PUBLIC_USE')).toBe(true)
    expect(first.promotions.every(promotion => promotion.asset.publicUrl?.startsWith('https://'))).toBe(true)
    expect(first.promotions[0]?.asset.publicUrl).toContain(`/images-approved/v1/by-checksum/${first.promotions[0]?.asset.checksum}.png`)
    expect(JSON.stringify(first.package)).not.toContain('handoffKey')
    const second = await context.acquisition.acquireDestination(destinationId, { modes: ['adventure'] })
    expect(second.package.packageId).toBe(first.package.packageId)
    expect(context.storage.stageUploads).toBe(4)
    expect(context.storage.publicUploads).toBe(4)
    expect(fetchFn).toHaveBeenCalledTimes(4)
  })

  it('reuses one physical approved blob for equal SHA-256 bytes and retains both provenances', async () => {
    const hero = candidate(0, 'hero')
    const highlight = candidate(1, 'highlight')
    const fetchFn = vi.fn(async () => response(png())) as unknown as typeof fetch
    const context = service([hero, highlight], fetchFn)
    await context.candidateRepository.upsert(hero); await context.candidateRepository.upsert(highlight)
    const result = await context.acquisition.acquireDestination(destinationId, { modes: ['adventure'] })
    expect(result.promotions).toHaveLength(2)
    expect(context.storage.publicUploads).toBe(1)
    expect(context.processing.blobs.size).toBe(1)
    expect(context.processing.provenance.size).toBe(2)
  })

  it('rejects HTML, MIME inconsistencies and insufficient real dimensions before staging', async () => {
    const html = new VisualCandidateDownloader(async () => response(new TextEncoder().encode('<html>not an image</html>'), 'image/png'))
    await expect(html.download(candidate(0, 'hero'))).rejects.toMatchObject({ code: 'INVALID_MAGIC_BYTES' })
    const mismatch = new VisualCandidateDownloader(async () => response(png(), 'image/jpeg'))
    await expect(mismatch.download(candidate(0, 'hero'))).rejects.toMatchObject({ code: 'INVALID_CONTENT_TYPE' })
    const small = new VisualCandidateDownloader(async () => response(png(1200, 800)))
    await expect(small.download(candidate(0, 'hero'))).rejects.toMatchObject({ code: 'DIMENSIONS_TOO_SMALL' })
  })

  it('fails closed on final rights and does not create staging or public media', async () => {
    const blocked = candidate(0, 'hero', { state: 'REFERENCE_ONLY', normalizedLicense: 'CC_BY_SA' })
    const fetchFn = vi.fn(async () => response(png())) as unknown as typeof fetch
    const context = service([blocked], fetchFn)
    await context.candidateRepository.upsert(blocked)
    const result = await context.acquisition.acquireDestination(destinationId, { modes: ['adventure'] })
    expect(result.selected).toHaveLength(0)
    expect(context.storage.stageUploads).toBe(0)
    expect(context.storage.publicUploads).toBe(0)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('prepares a private human-review package without inventing an HTTPS public asset', async () => {
    const values = [candidate(0, 'hero'), candidate(1, 'highlight'), candidate(2, 'highlight'), candidate(3, 'gallery')]
    const fetchFn = vi.fn(async (url: string) => response(png(1800, 1000, Number(url.match(/-(\d)\.png$/)?.[1] ?? 0)))) as unknown as typeof fetch
    const context = service(values, fetchFn)
    for (const value of values) await context.candidateRepository.upsert(value)
    const prepared = await context.acquisition.prepareDestinationForHumanVisualReview(destinationId, { modes: ['adventure'] })
    expect(prepared.package.state).toBe('PARTIAL')
    expect(prepared.package.assets).toHaveLength(1) // equal bytes retain one physical pending asset
    expect(prepared.package.assets.every(asset => asset.lifecycle === 'PENDING' && asset.publicUrl === null && asset.rightsStatus === 'PENDING')).toBe(true)
    expect(prepared.package.selections).toHaveLength(4)
    expect(context.storage.stageUploads).toBe(4)
    expect(context.storage.publicUploads).toBe(0)
  })

  it('requires existing descriptive metadata before any public promotion', async () => {
    const noAlt = candidate(0, 'hero', { description: null })
    const fetchFn = vi.fn(async () => response(png())) as unknown as typeof fetch
    const context = service([noAlt], fetchFn)
    await context.candidateRepository.upsert(noAlt)
    const result = await context.acquisition.acquireDestination(destinationId, { modes: ['adventure'] })
    expect(result.failures).toEqual([{ candidateId: noAlt.candidateId, code: 'ALT_REQUIRED_FOR_PUBLIC_ASSET' }])
    expect(context.storage.stageUploads).toBe(0)
    expect(context.storage.publicUploads).toBe(0)
  })

  it('classifies corrupt JPEG bytes explicitly', async () => {
    const downloader = new VisualCandidateDownloader(async () => response(new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00]), 'image/jpeg'))
    await expect(downloader.download(candidate(0, 'hero'))).rejects.toBeInstanceOf(VisualDownloadError)
    await expect(downloader.download(candidate(0, 'hero'))).rejects.toMatchObject({ code: 'CORRUPT_IMAGE' })
  })
})
