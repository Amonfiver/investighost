import type { SupabaseClient } from '@supabase/supabase-js'
import type { CurrentApprovedLibraryContent } from '@shared/real-editorial-library-read-contracts'
import type {
  RealEditorialLibraryEntry,
  RealEditorialLibraryQuery,
} from '@shared/real-editorial-pilot-contracts'
import type {
  TrawelEditorialContentDraft,
  TrawelEditorialTarget,
} from '@shared/trawel-editorial-handoff-contracts'
import type {
  TrawelEditorialApprovedSourcePort,
  TrawelEditorialTransferPort,
} from './transfer-service'

const EDITORIAL_CONTENT_COLUMNS = [
  'id',
  'entity_type',
  'entity_id',
  'entity_slug',
  'country_slug',
  'zone_slug',
  'mode',
  'headline',
  'intro',
  'what_makes_special',
  'highlights',
  'suggested_route',
  'practical_tips',
  'sections',
  'sources',
  'metadata',
  'status',
  'review_state',
  'published_at',
  'created_at',
  'updated_at',
].join(',')

interface LibraryEntryReader {
  listLibraryEntries(query: RealEditorialLibraryQuery): Promise<RealEditorialLibraryEntry[]>
}

interface CurrentApprovedReader {
  getCurrentApproved(libraryEntryId: string): Promise<CurrentApprovedLibraryContent | null>
}

export class SupabaseTrawelApprovedSourcePort
implements TrawelEditorialApprovedSourcePort {
  constructor(
    private readonly entries: LibraryEntryReader,
    private readonly versions: CurrentApprovedReader,
  ) {}

  async loadApprovedSources(
    libraryEntryIds: readonly [string, string],
  ): Promise<unknown[]> {
    const entries = await this.entries.listLibraryEntries({ origin: 'real_editorial_pilot' })
    const requested = libraryEntryIds.flatMap(libraryEntryId =>
      entries.filter(entry => entry.entryId === libraryEntryId),
    )
    const approved = await Promise.all(requested.map(async entry => ({
      entry,
      currentApproved: await this.versions.getCurrentApproved(entry.entryId),
    })))
    return approved.filter((item): item is {
      entry: RealEditorialLibraryEntry
      currentApproved: CurrentApprovedLibraryContent
    } => item.currentApproved !== null)
  }
}

export interface SupabaseTrawelEditorialTransferPortConfig {
  privilegedClient: SupabaseClient
  publicClient: SupabaseClient
  projectRef: string
  supabaseUrl: string
}

export class SupabaseTrawelEditorialTransferPort
implements TrawelEditorialTransferPort {
  private readonly privilegedClient: SupabaseClient
  private readonly publicClient: SupabaseClient
  private readonly projectRef: string

  constructor(config: SupabaseTrawelEditorialTransferPortConfig) {
    const projectRef = supabaseProjectRef(config.supabaseUrl)
    if (projectRef !== config.projectRef) {
      throw new Error('TRAWEL_PROJECT_REF_MISMATCH')
    }
    this.privilegedClient = config.privilegedClient
    this.publicClient = config.publicClient
    this.projectRef = projectRef
  }

  async resolveTarget(target: TrawelEditorialTarget): Promise<unknown | null> {
    this.assertProjectRef(target.projectRef)
    if (target.entityType === 'country') {
      const country = await this.readCatalogRow(
        'location_countries',
        'id,slug,iso2,is_active',
        'id',
        target.entityId,
      )
      if (country === null || country.is_active !== true) return null
      return {
        projectRef: this.projectRef,
        entityType: 'country',
        entityId: country.id,
        entitySlug: country.slug,
        countrySlug: country.slug,
        zoneSlug: null,
        countryCode: country.iso2,
      }
    }

    const city = await this.readCatalogRow(
      'location_cities',
      'id,country_slug,slug,status',
      'id',
      target.entityId,
    )
    if (city === null || city.status !== 'active' || typeof city.country_slug !== 'string') {
      return null
    }
    const country = await this.readCatalogRow(
      'location_countries',
      'id,slug,iso2,is_active',
      'slug',
      city.country_slug,
    )
    if (country === null || country.is_active !== true) return null
    return {
      projectRef: this.projectRef,
      entityType: 'zone',
      entityId: city.id,
      entitySlug: city.slug,
      countrySlug: city.country_slug,
      zoneSlug: city.slug,
      countryCode: country.iso2,
    }
  }

  readPrivateDrafts(projectRef: string, rowIds: readonly string[]): Promise<unknown[]> {
    return this.readDrafts(this.privilegedClient, projectRef, rowIds)
  }

  async insertPrivateDraft(
    projectRef: string,
    row: TrawelEditorialContentDraft,
  ): Promise<void> {
    this.assertProjectRef(projectRef)
    const { error } = await this.privilegedClient.from('editorial_contents').insert(row)
    if (error) throw new Error('TRAWEL_PRIVATE_DRAFT_INSERT_FAILED')
  }

  readPublicRows(projectRef: string, rowIds: readonly string[]): Promise<unknown[]> {
    return this.readDrafts(this.publicClient, projectRef, rowIds)
  }

  private async readDrafts(
    client: SupabaseClient,
    projectRef: string,
    rowIds: readonly string[],
  ): Promise<unknown[]> {
    this.assertProjectRef(projectRef)
    const { data, error } = await client
      .from('editorial_contents')
      .select(EDITORIAL_CONTENT_COLUMNS)
      .in('id', [...rowIds])
      .order('id', { ascending: true })
    if (error) throw new Error('TRAWEL_EDITORIAL_CONTENT_READ_FAILED')
    return data ?? []
  }

  private async readCatalogRow(
    table: 'location_countries' | 'location_cities',
    columns: string,
    field: 'id' | 'slug',
    value: string,
  ): Promise<Record<string, unknown> | null> {
    const { data, error } = await this.privilegedClient
      .from(table)
      .select(columns)
      .eq(field, value)
      .limit(2)
    if (error) throw new Error('TRAWEL_TARGET_READ_FAILED')
    if (data === null || data.length !== 1) return null
    return data[0] as unknown as Record<string, unknown>
  }

  private assertProjectRef(candidate: string): void {
    if (candidate !== this.projectRef) throw new Error('TRAWEL_PROJECT_REF_MISMATCH')
  }
}

export function supabaseProjectRef(candidate: string): string {
  const hostname = new URL(candidate).hostname.toLowerCase()
  const match = /^([a-z0-9]{20})\.supabase\.co$/.exec(hostname)
  if (match?.[1] === undefined) throw new Error('TRAWEL_SUPABASE_URL_INVALID')
  return match[1]
}
