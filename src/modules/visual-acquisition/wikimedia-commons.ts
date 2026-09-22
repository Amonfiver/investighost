import { randomUUID } from 'node:crypto'
import { canonicalPayloadHash } from '@modules/library-versioning/canonicalization'
import {
  VisualCandidateSchema,
  WikimediaCommonsDiscoveryQuerySchema,
  type VisualCandidate,
  type WikimediaCommonsDiscoveryQuery,
} from '@shared/visual-candidate-contracts'

const COMMONS_API = 'https://commons.wikimedia.org/w/api.php'
const MIME_ALLOWLIST = new Set(['image/jpeg', 'image/png', 'image/webp'])

export interface WikimediaCommonsFetch {
  (input: string, init?: RequestInit): Promise<Pick<Response, 'ok' | 'status' | 'json'>>
}
export interface WikimediaCommonsDiscoveryOptions {
  fetchFn?: WikimediaCommonsFetch
  timeoutMs?: number
  maxRetries?: number
  now?: () => Date
  candidateId?: () => string
  userAgent?: string
}

/** Small, injectable MediaWiki Action API client. It never downloads image bytes. */
export class WikimediaCommonsDiscoveryAdapter {
  private readonly fetchFn: WikimediaCommonsFetch
  private readonly timeoutMs: number
  private readonly maxRetries: number
  private readonly now: () => Date
  private readonly candidateId: () => string
  private readonly userAgent: string

  constructor(options: WikimediaCommonsDiscoveryOptions = {}) {
    this.fetchFn = options.fetchFn ?? fetch
    this.timeoutMs = options.timeoutMs ?? 10_000
    this.maxRetries = options.maxRetries ?? 1
    this.now = options.now ?? (() => new Date())
    this.candidateId = options.candidateId ?? randomUUID
    this.userAgent = options.userAgent ?? 'Investighost/visual-acquisition-v1 (Wikimedia Commons candidate discovery; no-download)'
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 60_000) throw new Error('WIKIMEDIA_TIMEOUT_INVALID')
    if (!Number.isSafeInteger(this.maxRetries) || this.maxRetries < 0 || this.maxRetries > 2) throw new Error('WIKIMEDIA_RETRIES_INVALID')
  }

  async discover(input: WikimediaCommonsDiscoveryQuery): Promise<VisualCandidate[]> {
    const query = WikimediaCommonsDiscoveryQuerySchema.parse(input)
    const response = await this.request(query)
    return normalizeWikimediaCommonsResponse(response, query, this.now(), this.candidateId)
  }

  private async request(query: WikimediaCommonsDiscoveryQuery): Promise<unknown> {
    const url = new URL(COMMONS_API)
    const parameters: Record<string, string> = {
      action: 'query', format: 'json', formatversion: '2', origin: '*', generator: 'search',
      gsrnamespace: '6', gsrlimit: String(query.limit), gsrsearch: buildWikimediaCommonsSearchTerm(query),
      prop: 'imageinfo', iilimit: '1',
      iiprop: 'url|size|mime|dimensions|extmetadata|canonicaltitle|sha1|user',
      iiextmetadatafilter: 'Artist|Credit|ImageDescription|LicenseShortName|LicenseUrl|UsageTerms|AttributionRequired|Copyrighted',
    }
    Object.entries(parameters).forEach(([key, value]) => url.searchParams.set(key, value))
    let lastError: Error | null = null
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
        try {
          const result = await this.fetchFn(url.toString(), { method: 'GET', signal: controller.signal, headers: { accept: 'application/json', 'user-agent': this.userAgent } })
          if (result.ok) return await result.json()
          if (result.status < 500 && result.status !== 429) throw new Error(`WIKIMEDIA_HTTP_${result.status}`)
          lastError = new Error(`WIKIMEDIA_RETRYABLE_HTTP_${result.status}`)
        } finally { clearTimeout(timeout) }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('WIKIMEDIA_NETWORK_ERROR')
      }
    }
    throw lastError ?? new Error('WIKIMEDIA_REQUEST_FAILED')
  }
}

export function buildWikimediaCommonsSearchTerm(input: WikimediaCommonsDiscoveryQuery): string {
  const query = WikimediaCommonsDiscoveryQuerySchema.parse(input)
  const categoryTerm: Record<typeof query.category, string> = {
    landmark: 'monument', landscape: 'landscape', culture: 'culture', food: 'gastronomy',
    'people-life': 'daily life', atmosphere: 'cityscape', detail: 'architecture detail',
  }
  return [query.destinationName, query.countryOrRegion, categoryTerm[query.category]].filter((value): value is string => value !== null).join(' ')
}

export function normalizeWikimediaCommonsResponse(
  response: unknown,
  query: WikimediaCommonsDiscoveryQuery,
  discoveredAt: Date,
  candidateId: () => string = randomUUID,
): VisualCandidate[] {
  const pages = pagesFromResponse(response)
  return pages.map(page => normalizePage(page, query, discoveredAt, candidateId())).filter((candidate): candidate is VisualCandidate => candidate !== null)
}

function normalizePage(page: Record<string, unknown>, query: WikimediaCommonsDiscoveryQuery, discoveredAt: Date, candidateId: string): VisualCandidate | null {
  const info = array(page.imageinfo)[0]
  if (!record(info)) return null
  const metadata = record(info.extmetadata) ? info.extmetadata as Record<string, unknown> : {}
  const pageTitle = text(page.title)
  const canonicalTitle = text(info.canonicaltitle) ?? pageTitle
  const pageId = numeric(page.pageid)
  if (canonicalTitle === null || pageId === null) return null
  const creator = metadataText(metadata, 'Artist')
  const licenseShortName = metadataText(metadata, 'LicenseShortName')
  const licenseUrl = metadataUrl(metadata, 'LicenseUrl')
  const usageTerms = metadataText(metadata, 'UsageTerms')
  const originalMediaUrl = httpsUrl(info.url)
  const mimeType = text(info.mime)
  const width = positive(info.width)
  const height = positive(info.height)
  const byteSize = positive(info.size)
  const normalizedLicense = normalizeCommonsLicense(licenseShortName, usageTerms, metadataText(metadata, 'Copyrighted'))
  const qualityFailure = qualityFailureFor(query.role, mimeType, width, height)
  const attributionText = creator && licenseShortName ? `${creator} — Wikimedia Commons — ${licenseShortName}` : null
  const rightState = classifyWikimediaCandidateRights(normalizedLicense, creator, licenseUrl, attributionText, originalMediaUrl)
  const state = qualityFailure === null ? rightState.state : 'REJECTED'
  const rejectionReason = qualityFailure ?? rightState.reason
  return VisualCandidateSchema.parse({
    candidateId, destinationId: query.destinationId, provider: 'wikimedia_commons', providerAssetId: String(pageId),
    canonicalTitle, sourcePageUrl: commonsPageUrl(canonicalTitle), originalMediaUrl, mimeType, width, height, byteSize,
    creator, uploader: text(info.user), sourceName: 'Wikimedia Commons', licenseShortName, licenseUrl, usageTerms,
    attributionText, description: metadataText(metadata, 'ImageDescription'), requestedCategory: query.category,
    requestedRole: query.role, discoveredAt: discoveredAt.toISOString(), providerMetadataHash: canonicalPayloadHash(info),
    normalizedLicense, state, rejectionReason,
  })
}

export function normalizeCommonsLicense(shortName: string | null, usageTerms: string | null, copyrighted: string | null) {
  const value = `${shortName ?? ''} ${usageTerms ?? ''} ${copyrighted ?? ''}`.toLowerCase().replaceAll(' ', '')
  if (value.includes('publicdomain') || value === 'pd' || value.includes('copyrighted=false')) return 'PUBLIC_DOMAIN' as const
  if (value.includes('cc0')) return 'CC0' as const
  if (value.includes('allrightsreserved')) return 'ALL_RIGHTS_RESERVED' as const
  if (value.includes('by-nc')) return 'CC_BY_NC' as const
  if (value.includes('by-nd')) return 'CC_BY_ND' as const
  if (value.includes('by-sa')) return 'CC_BY_SA' as const
  if (value.includes('cc-by-4') || value.includes('ccby4')) return 'CC_BY_4_0' as const
  if (value.includes('cc-by-3') || value.includes('ccby3')) return 'CC_BY_3_0' as const
  return shortName === null ? 'UNKNOWN' as const : 'CUSTOM' as const
}

export function qualityFailureFor(role: WikimediaCommonsDiscoveryQuery['role'], mimeType: string | null, width: number | null, height: number | null): string | null {
  if (mimeType === null || !MIME_ALLOWLIST.has(mimeType)) return 'MIME_UNSUPPORTED'
  if (width === null || height === null) return 'DIMENSIONS_MISSING'
  const longSide = Math.max(width, height); const shortSide = Math.min(width, height)
  if (role === 'hero') {
    if (width < height || width < 1600 || height < 900 || width / height > 2.5) return 'HERO_DIMENSIONS_INSUFFICIENT'
  } else if (role === 'highlight' && (longSide < 1200 || shortSide < 675)) return 'HIGHLIGHT_DIMENSIONS_INSUFFICIENT'
  else if (role === 'gallery' && (longSide < 1000 || shortSide < 600)) return 'GALLERY_DIMENSIONS_INSUFFICIENT'
  return null
}

export function classifyWikimediaCandidateRights(license: ReturnType<typeof normalizeCommonsLicense>, creator: string | null, licenseUrl: string | null, attribution: string | null, mediaUrl: string | null) {
  if (['ALL_RIGHTS_RESERVED', 'UNKNOWN'].includes(license)) return { state: 'REFERENCE_ONLY' as const, reason: 'RIGHTS_UNCLEAR' }
  if (['CC_BY_NC', 'CC_BY_ND', 'CC_BY_SA', 'CUSTOM'].includes(license)) return { state: 'REFERENCE_ONLY' as const, reason: 'LICENSE_REQUIRES_MANUAL_REVIEW' }
  if (creator === null || licenseUrl === null || attribution === null || mediaUrl === null) return { state: 'REFERENCE_ONLY' as const, reason: 'ATTRIBUTION_OR_PROVENANCE_INCOMPLETE' }
  return { state: 'ELIGIBLE' as const, reason: null }
}
function pagesFromResponse(value: unknown): Record<string, unknown>[] {
  if (!record(value) || !record(value.query)) return []
  return array(value.query.pages).filter(record)
}
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value) }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : [] }
function text(value: unknown): string | null { return typeof value === 'string' && plainText(value).length > 0 ? plainText(value) : null }
function numeric(value: unknown): number | null { return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null }
function positive(value: unknown): number | null { return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null }
function httpsUrl(value: unknown): string | null { return typeof value === 'string' && value.startsWith('https://') ? value : null }
function metadataText(metadata: Record<string, unknown>, key: string): string | null { return record(metadata[key]) ? text(metadata[key].value) : null }
function metadataUrl(metadata: Record<string, unknown>, key: string): string | null { return record(metadata[key]) ? httpsUrl(metadata[key].value) : null }
function commonsPageUrl(title: string): string { return `https://commons.wikimedia.org/wiki/${encodeURIComponent(title.replaceAll(' ', '_'))}` }
function plainText(value: string): string { return value.replace(/<[^>]*>/gu, ' ').replace(/&(?:amp|quot|#39);/gu, ' ').replace(/\s+/gu, ' ').trim() }
