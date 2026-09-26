import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'
import type { StructuredEditorialPackageV1 } from '@shared/structured-editorial-package-contracts'
import {
  HttpTrawelMediaClient,
  ingressApprovedPackageMedia,
  MemoryMediaIngressReceiptRepository,
  MemoryMediaMappingRepository,
  parseTrawelMediaIngressConfig,
  referencedAssets,
  SupabaseMediaIngressReceiptRepository,
  SupabaseMediaMappingRepository,
  type ApprovedMedia,
  type MediaMapping,
  type MediaMappingRepository,
  type TrawelMediaClient,
} from '@modules/trawel-handoff/approved-package-media-ingress'

const ids = {
  package: '10000000-0000-4000-8000-000000000001', approval: '10000000-0000-4000-8000-000000000002', destination: '10000000-0000-4000-8000-000000000003', execution: '10000000-0000-4000-8000-000000000004',
  hero: '10000000-0000-4000-8000-000000000005', story: '10000000-0000-4000-8000-000000000006', place: '10000000-0000-4000-8000-000000000007', figure: '10000000-0000-4000-8000-000000000008',
}
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
const checksum = (bytes = png) => createHash('sha256').update(bytes).digest('hex')
const asset = (assetId: string, overrides: Record<string, unknown> = {}): ApprovedMedia['asset'] => ({
  assetId, destinationId: ids.destination, lifecycle: 'APPROVED', rightsStatus: 'APPROVED_FOR_PUBLIC_USE', usageAllowed: true, rightsCheckedAt: '2026-09-26T00:00:00.000Z', publicUrl: 'https://assets.example.test/image.png', storageIdentity: 'stage/image.png', sourceUrl: 'https://commons.example.test/image.png', sourceName: 'Wikimedia Commons', author: 'Author', license: 'CC BY 4.0', attributionText: 'Author · CC BY 4.0', associatedPlace: null, category: 'landmark', modes: ['adventure'], alt: 'Vista documentada', caption: 'Caption documentada', width: 800, height: 600, mimeType: 'image/png', checksum: checksum(), rejectionReason: null, ...overrides,
}) as ApprovedMedia['asset']
const media = (assetId: string, overrides: Record<string, unknown> = {}): ApprovedMedia => ({ asset: asset(assetId, overrides), bytes: png })
const packageFixture = (state: 'APPROVED' | 'DRAFT' = 'APPROVED') => ({
  packageId: ids.package, approvalDecisionId: ids.approval, destinationId: ids.destination, executionId: ids.execution, state,
  adventure: { libraryRevision: { revisionId: ids.story }, document: { hero: { asset: { status: 'RESOLVED', assetId: ids.hero } }, visualStory: { items: [{ asset: { status: 'RESOLVED', assetId: ids.story } }] }, placesToGo: { items: [{ asset: { status: 'RESOLVED', assetId: ids.place } }] } } },
  student: { libraryRevision: { revisionId: ids.figure }, document: { blocks: [{ type: 'figure', resolution: 'RESOLVED', assetId: ids.figure }] } },
} as StructuredEditorialPackageV1)
const source = (items: Record<string, ApprovedMedia>): { load: (assetId: string) => Promise<ApprovedMedia | null> } => ({ load: async assetId => items[assetId] ?? null })
const completeClient = (calls: string[]): TrawelMediaClient => ({ upload: async input => { calls.push(input.asset.assetId); return { trawelMediaId: `trawel-${input.asset.assetId}` } } })
type IngressInput = Omit<Parameters<typeof ingressApprovedPackageMedia>[0], 'currentApprovedPackageId'> & { currentApprovedPackageId?: string }
const ingress = (input: IngressInput) => ingressApprovedPackageMedia({ currentApprovedPackageId: ids.package, ...input })

class DurableFakeMappings implements MediaMappingRepository {
  constructor(private readonly store: MediaMapping[]) {}
  async find(packageId: string, assetId: string, sum: string) { const value = this.store.find(item => item.packageId === packageId && item.assetId === assetId && item.checksum === sum); return value ? structuredClone(value) : null }
  async save(value: MediaMapping) { const index = this.store.findIndex(item => item.packageId === value.packageId && item.assetId === value.assetId && item.checksum === value.checksum); if (index >= 0) this.store[index] = structuredClone(value); else this.store.push(structuredClone(value)) }
}

describe('approved package media ingress', () => {
  it('enumerates only resolved approved-package Hero, story, places and Student figures, collapsing duplicates', () => {
    const value = packageFixture(); value.adventure.document.visualStory.items.push({ asset: { status: 'RESOLVED', assetId: ids.hero } } as never)
    expect(referencedAssets(value)).toEqual([ids.hero, ids.story, ids.place, ids.figure])
  })

  it('requires an approved package, its exact approval decision, and the current package identity', async () => {
    const dependencies = { source: source({}), mappings: new MemoryMediaMappingRepository(), client: completeClient([]) }
    await expect(ingress({ package: packageFixture('DRAFT'), approvalDecisionId: ids.approval, ...dependencies })).rejects.toThrow('ONLY_CURRENT_APPROVED_PACKAGE_CAN_INGRESS_MEDIA')
    await expect(ingress({ package: packageFixture(), approvalDecisionId: '', ...dependencies })).rejects.toThrow('EXACT_APPROVAL_DECISION_REQUIRED')
    await expect(ingress({ package: packageFixture(), approvalDecisionId: ids.approval, currentApprovedPackageId: ids.figure, ...dependencies })).rejects.toThrow('STALE_APPROVED_PACKAGE_BLOCKED')
    const mixed = packageFixture(); mixed.adventure.libraryRevision.revisionId = mixed.student.libraryRevision.revisionId
    await expect(ingress({ package: mixed, approvalDecisionId: ids.approval, ...dependencies })).rejects.toThrow('MIXED_PACKAGE_BLOCKED')
  })

  it('uploads valid approved assets once, persists an append-only receipt, and reuses complete mappings', async () => {
    const values = Object.fromEntries([ids.hero, ids.story, ids.place, ids.figure].map(id => [id, media(id)]))
    const mappings = new MemoryMediaMappingRepository(); const receipts = new MemoryMediaIngressReceiptRepository(); const calls: string[] = []
    const first = await ingress({ package: packageFixture(), approvalDecisionId: ids.approval, source: source(values), mappings, receipts, client: completeClient(calls) })
    const retry = await ingress({ package: packageFixture(), approvalDecisionId: ids.approval, source: source(values), mappings, receipts, client: completeClient(calls) })
    expect(first).toMatchObject({ assetCount: 4, uploadedCount: 4, reusedCount: 0, failedCount: 0, state: 'MEDIA_COMPLETE' })
    expect(retry).toMatchObject({ uploadedCount: 0, reusedCount: 4, failedCount: 0, state: 'MEDIA_COMPLETE' })
    expect(calls).toHaveLength(4); expect(mappings.values).toHaveLength(4); expect(receipts.values).toHaveLength(2)
  })

  it('fails closed for rights, local bytes, MIME, magic bytes, dimensions, size and checksum mismatches', async () => {
    const tooLarge = new Uint8Array(5 * 1024 * 1024 + 1); tooLarge.set(png)
    const cases: Array<[string, ApprovedMedia | null, string]> = [
      ['missing', null, 'MISSING_LOCAL_BYTES'], ['unknown-rights', media(ids.hero, { rightsStatus: 'UNKNOWN', lifecycle: 'PENDING', usageAllowed: null }), 'RIGHTS_NOT_APPROVED'], ['pending-rights', media(ids.hero, { rightsStatus: 'PENDING', lifecycle: 'PENDING', usageAllowed: null }), 'RIGHTS_NOT_APPROVED'], ['reference-only', media(ids.hero, { rightsStatus: 'REFERENCE_ONLY', lifecycle: 'PENDING', usageAllowed: null }), 'RIGHTS_NOT_APPROVED'], ['mime', media(ids.hero, { mimeType: 'image/gif' }), 'UNSUPPORTED_MIME'], ['magic', { asset: asset(ids.hero), bytes: new Uint8Array([1, 2, 3]) }, 'INVALID_BYTES'], ['dimensions', media(ids.hero, { width: null }), 'INVALID_BYTES'], ['size', { asset: asset(ids.hero, { checksum: checksum(tooLarge) }), bytes: tooLarge }, 'FILE_TOO_LARGE'], ['checksum', media(ids.hero, { checksum: 'f'.repeat(64) }), 'CHECKSUM_MISMATCH'],
    ]
    for (const [, value, code] of cases) {
      const result = await ingress({ package: { ...packageFixture(), adventure: { document: { hero: { asset: { status: 'RESOLVED', assetId: ids.hero } }, visualStory: { items: [] }, placesToGo: { items: [] } } }, student: { document: { blocks: [] } } } as StructuredEditorialPackageV1, approvalDecisionId: ids.approval, source: source(value ? { [ids.hero]: value } : {}), mappings: new MemoryMediaMappingRepository(), client: completeClient([]) })
      expect(result.failures).toEqual([{ assetId: ids.hero, code }])
    }
  })

  it('persists retryable failure state and is process-restart safe without duplicate remote uploads', async () => {
    const durable: MediaMapping[] = []; const values = Object.fromEntries([ids.hero, ids.story, ids.place, ids.figure].map(id => [id, media(id)])); const firstCalls: string[] = []
    const flaky: TrawelMediaClient = { upload: async input => { firstCalls.push(input.asset.assetId); if (input.asset.assetId === ids.figure) throw new Error('HTTP_5XX'); return { trawelMediaId: `trawel-${input.asset.assetId}` } } }
    const first = await ingress({ package: packageFixture(), approvalDecisionId: ids.approval, source: source(values), mappings: new DurableFakeMappings(durable), client: flaky })
    expect(durable.find(item => item.assetId === ids.figure)).toMatchObject({ state: 'FAILED_RETRYABLE', failureCode: 'HTTP_5XX', failureMessage: 'MEDIA_INGRESS_HTTP_5XX' })
    const secondCalls: string[] = []
    const second = await ingress({ package: packageFixture(), approvalDecisionId: ids.approval, source: source(values), mappings: new DurableFakeMappings(durable), client: completeClient(secondCalls) })
    expect(first).toMatchObject({ state: 'MEDIA_PARTIAL', uploadedCount: 3, failedCount: 1 })
    expect(durable.find(item => item.assetId === ids.figure)).toMatchObject({ state: 'COMPLETE' })
    expect(second).toMatchObject({ state: 'MEDIA_COMPLETE', reusedCount: 3, uploadedCount: 1, failedCount: 0 })
    expect(secondCalls).toEqual([ids.figure])
  })

  it('does not retry durable permanent failures and versions a changed checksum', async () => {
    const mappings = new MemoryMediaMappingRepository(); const values = { [ids.hero]: media(ids.hero, { checksum: 'f'.repeat(64) }) }; const calls: string[] = []
    const first = await ingress({ package: { ...packageFixture(), adventure: { document: { hero: { asset: { status: 'RESOLVED', assetId: ids.hero } }, visualStory: { items: [] }, placesToGo: { items: [] } } }, student: { document: { blocks: [] } } } as StructuredEditorialPackageV1, approvalDecisionId: ids.approval, source: source(values), mappings, client: completeClient(calls) })
    const sameChecksum = await ingress({ package: { ...packageFixture(), adventure: { document: { hero: { asset: { status: 'RESOLVED', assetId: ids.hero } }, visualStory: { items: [] }, placesToGo: { items: [] } } }, student: { document: { blocks: [] } } } as StructuredEditorialPackageV1, approvalDecisionId: ids.approval, source: source(values), mappings, client: completeClient(calls) })
    const changedBytes = new Uint8Array([...png, 4]); const changed = { asset: asset(ids.hero, { checksum: checksum(changedBytes) }), bytes: changedBytes }
    const changedChecksum = await ingress({ package: { ...packageFixture(), adventure: { document: { hero: { asset: { status: 'RESOLVED', assetId: ids.hero } }, visualStory: { items: [] }, placesToGo: { items: [] } } }, student: { document: { blocks: [] } } } as StructuredEditorialPackageV1, approvalDecisionId: ids.approval, source: source({ [ids.hero]: changed }), mappings, client: completeClient(calls) })
    expect(first.failures[0]).toMatchObject({ code: 'CHECKSUM_MISMATCH' }); expect(sameChecksum.failures[0]).toMatchObject({ code: 'CHECKSUM_MISMATCH' }); expect(calls).toEqual([ids.hero]); expect(changedChecksum.uploadedCount).toBe(1)
    expect(mappings.values.filter(value => value.assetId === ids.hero)).toHaveLength(2)
  })

  it('uses multipart with the secret header and validates the Trawel media id without exposing raw input', async () => {
    expect(parseTrawelMediaIngressConfig({ TRAWEL_INTERNAL_EDITORIAL_DELIVERIES_URL: 'https://trawel.example.test/functions/v1/internal-editorial-deliveries/', TRAWEL_INTERNAL_EDITORIAL_DELIVERIES_SECRET: 'private-secret' })).toEqual({ url: 'https://trawel.example.test/functions/v1/internal-editorial-deliveries/media', secret: 'private-secret' })
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.headers).toEqual({ 'x-internal-editorial-secret': 'private-secret' }); expect(init?.body).toBeInstanceOf(FormData)
      expect((init?.body as FormData).get('metadata')).not.toContain('private-secret')
      return new Response(JSON.stringify({ trawelMediaId: 'media-ok' }), { status: 200 })
    })
    const client = new HttpTrawelMediaClient({ url: 'http://localhost/media', secret: 'private-secret', timeoutMs: 7, fetchFn, allowInsecureForTests: true })
    await expect(client.upload({ bytes: png, asset: asset(ids.hero), checksum: checksum() })).resolves.toEqual({ trawelMediaId: 'media-ok' })
    const invalid = new HttpTrawelMediaClient({ url: 'http://localhost/media', secret: 'private-secret', fetchFn: async () => new Response('{}', { status: 200 }), allowInsecureForTests: true })
    await expect(invalid.upload({ bytes: png, asset: asset(ids.hero), checksum: checksum() })).rejects.toThrow('INVALID_RESPONSE')
    const unavailable = new HttpTrawelMediaClient({ url: 'http://localhost/media', secret: 'private-secret', fetchFn: async () => new Response('', { status: 503 }), allowInsecureForTests: true })
    await expect(unavailable.upload({ bytes: png, asset: asset(ids.hero), checksum: checksum() })).rejects.toThrow('HTTP_5XX')
  })

  it('persists pending, partial and complete receipts without replacing their history', async () => {
    const receipts = new MemoryMediaIngressReceiptRepository(); const mappings = new MemoryMediaMappingRepository()
    const oneAssetPackage = { ...packageFixture(), adventure: { document: { hero: { asset: { status: 'RESOLVED', assetId: ids.hero } }, visualStory: { items: [] }, placesToGo: { items: [] } } }, student: { document: { blocks: [] } } } as StructuredEditorialPackageV1
    const pending = await ingress({ package: oneAssetPackage, approvalDecisionId: ids.approval, source: source({}), mappings, receipts, client: completeClient([]) })
    const partial = await ingress({ package: packageFixture(), approvalDecisionId: ids.approval, source: source({ [ids.hero]: media(ids.hero), [ids.story]: media(ids.story), [ids.place]: media(ids.place) }), mappings, receipts, client: completeClient([]) })
    const complete = await ingress({ package: packageFixture(), approvalDecisionId: ids.approval, source: source({ [ids.hero]: media(ids.hero), [ids.story]: media(ids.story), [ids.place]: media(ids.place), [ids.figure]: media(ids.figure) }), mappings, receipts, client: completeClient([]) })
    expect([pending.state, partial.state, complete.state]).toEqual(['MEDIA_PENDING', 'MEDIA_PARTIAL', 'MEDIA_COMPLETE'])
    expect(receipts.values).toHaveLength(3); expect(receipts.values.map(value => value.assetCount)).toEqual([1, 4, 4])
  })

  it('maps mocked Supabase rows and inserts mappings and receipts without a network', async () => {
    const calls: Array<{ method: string; value?: unknown }> = []; const chain = {
      select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: { package_id: ids.package, approval_decision_id: ids.approval, destination_id: ids.destination, execution_id: ids.execution, local_asset_id: ids.hero, checksum_sha256: checksum(), trawel_media_id: 'media', uploaded_at: null, upload_state: 'COMPLETE', failure_code: null, failure_message: null }, error: null }),
      upsert: async (value: unknown) => { calls.push({ method: 'upsert', value }); return { error: null } }, insert: async (value: unknown) => { calls.push({ method: 'insert', value }); return { error: null } },
    }
    const client = { from: () => chain } as never; const mappings = new SupabaseMediaMappingRepository(client); const receipts = new SupabaseMediaIngressReceiptRepository(client)
    expect(await mappings.find(ids.package, ids.hero, checksum())).toMatchObject({ trawelMediaId: 'media', state: 'COMPLETE' })
    await mappings.save({ packageId: ids.package, approvalDecisionId: ids.approval, destinationId: ids.destination, executionId: ids.execution, assetId: ids.hero, checksum: checksum(), trawelMediaId: null, uploadedAt: null, state: 'FAILED_RETRYABLE', failureCode: 'HTTP_5XX', failureMessage: 'MEDIA_INGRESS_HTTP_5XX' })
    await receipts.save({ packageId: ids.package, approvalDecisionId: ids.approval, assetCount: 1, uploadedCount: 0, reusedCount: 0, failedCount: 1, state: 'MEDIA_PENDING', startedAt: '2026-09-26T00:00:00.000Z', completedAt: '2026-09-26T00:00:00.000Z' })
    expect(calls.map(item => item.method)).toEqual(['upsert', 'insert'])
  })

  it('projects pending, partial and complete media ingress counts to the existing Review Desk and blocks handoff before complete', async () => {
    const [contract, desk] = await Promise.all([
      readFile(new URL('../src/shared/factory-batch-contracts.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/renderer/BatchReviewDesk.tsx', import.meta.url), 'utf8'),
    ])
    expect(contract).toContain("mediaIngressState: z.enum(['MEDIA_PENDING', 'MEDIA_PARTIAL', 'MEDIA_COMPLETE'])")
    expect(contract).toContain('mediaAssetCount')
    expect(contract).toContain('mediaUploadedCount')
    expect(contract).toContain('mediaReusedCount')
    expect(contract).toContain('mediaFailedCount')
    expect(desk).toContain('Media ingress')
    expect(desk).toContain("value === 'MEDIA_COMPLETE' ? 'Complete'")
    expect(desk).toContain('Handoff bloqueado hasta MEDIA_COMPLETE')
  })
})
