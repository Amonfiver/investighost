import type { SupabaseClient } from '@supabase/supabase-js'
import { type VisualCandidate } from '@shared/visual-candidate-contracts'

export interface VisualCandidateRepository {
  upsert(candidate: VisualCandidate): Promise<VisualCandidate>
  findByProviderAsset(destinationId: string, provider: VisualCandidate['provider'], providerAssetId: string): Promise<VisualCandidate | null>
}

/** Test double with the same `(destination, provider, providerAssetId)` idempotency boundary as Postgres. */
export class MemoryVisualCandidateRepository implements VisualCandidateRepository {
  private readonly candidates = new Map<string, VisualCandidate>()
  async upsert(candidate: VisualCandidate): Promise<VisualCandidate> {
    const key = candidateKey(candidate.destinationId, candidate.provider, candidate.providerAssetId)
    const existing = this.candidates.get(key)
    const saved = existing === undefined ? structuredClone(candidate) : { ...structuredClone(candidate), candidateId: existing.candidateId, discoveredAt: existing.discoveredAt }
    this.candidates.set(key, saved)
    return structuredClone(saved)
  }
  async findByProviderAsset(destinationId: string, provider: VisualCandidate['provider'], providerAssetId: string): Promise<VisualCandidate | null> {
    const candidate = this.candidates.get(candidateKey(destinationId, provider, providerAssetId))
    return candidate === undefined ? null : structuredClone(candidate)
  }
}

export class SupabaseVisualCandidateRepository implements VisualCandidateRepository {
  constructor(private readonly client: Pick<SupabaseClient, 'from' | 'rpc'>) {}
  async upsert(candidate: VisualCandidate): Promise<VisualCandidate> {
    const { data, error } = await this.client.rpc('real_editorial_upsert_visual_candidate', { p_candidate: candidate })
    if (error) throw new Error(`VISUAL_CANDIDATE_UPSERT_FAILED:${error.message}`)
    return candidateFromRow(single(data))
  }
  async findByProviderAsset(destinationId: string, provider: VisualCandidate['provider'], providerAssetId: string): Promise<VisualCandidate | null> {
    const { data, error } = await this.client.from('real_editorial_visual_candidates').select('*')
      .eq('canonical_destination_id', destinationId).eq('provider', provider).eq('provider_asset_id', providerAssetId).maybeSingle()
    if (error) throw new Error(`VISUAL_CANDIDATE_LOOKUP_FAILED:${error.message}`)
    return data === null ? null : candidateFromRow(data as Record<string, unknown>)
  }
}

function candidateKey(destinationId: string, provider: string, providerAssetId: string): string { return `${destinationId}:${provider}:${providerAssetId}` }
function single(value: unknown): Record<string, unknown> {
  const row = Array.isArray(value) ? value[0] : value
  if (row === null || typeof row !== 'object') throw new Error('VISUAL_CANDIDATE_ROW_INVALID')
  return row as Record<string, unknown>
}
function candidateFromRow(row: Record<string, unknown>): VisualCandidate {
  return {
    candidateId: text(row.id), destinationId: text(row.canonical_destination_id), provider: text(row.provider) as VisualCandidate['provider'],
    providerAssetId: text(row.provider_asset_id), canonicalTitle: text(row.canonical_title), sourcePageUrl: text(row.source_page_url),
    originalMediaUrl: nullableText(row.original_media_url), mimeType: nullableText(row.mime_type), width: nullableNumber(row.width),
    height: nullableNumber(row.height), byteSize: nullableNumber(row.byte_size), creator: nullableText(row.creator), uploader: nullableText(row.uploader),
    sourceName: 'Wikimedia Commons', licenseShortName: nullableText(row.license_short_name), licenseUrl: nullableText(row.license_url),
    usageTerms: nullableText(row.usage_terms), attributionText: nullableText(row.attribution_text), description: nullableText(row.description),
    requestedCategory: text(row.requested_category) as VisualCandidate['requestedCategory'], requestedRole: text(row.requested_role) as VisualCandidate['requestedRole'],
    discoveredAt: text(row.discovered_at), providerMetadataHash: text(row.provider_metadata_hash), normalizedLicense: text(row.normalized_license) as VisualCandidate['normalizedLicense'],
    state: text(row.state) as VisualCandidate['state'], rejectionReason: nullableText(row.rejection_reason),
  }
}
function text(value: unknown): string { if (typeof value !== 'string') throw new Error('VISUAL_CANDIDATE_ROW_INVALID'); return value }
function nullableText(value: unknown): string | null { return value === null || value === undefined ? null : text(value) }
function nullableNumber(value: unknown): number | null { return value === null || value === undefined ? null : Number(value) }
