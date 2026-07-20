import type { SupabaseClient } from '@supabase/supabase-js'
import { GeographicEntitySchema } from '@shared/editorial-contracts'
import type {
  GeographicCatalogEntry,
  GeographicCorrection,
  GeographicHierarchyNode,
  GeographyCatalogRepository,
} from './geography'

type Row = Record<string, unknown>

export class SupabaseGeographyCatalogRepository implements GeographyCatalogRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listActive(): Promise<GeographicCatalogEntry[]> {
    const [entitiesResult, aliasesResult, externalIdsResult] = await Promise.all([
      this.client.from('geographic_entities').select('*').eq('status', 'active'),
      this.client.from('geographic_aliases').select('entity_id,alias'),
      this.client.from('geographic_external_ids').select('entity_id,provider,external_id'),
    ])
    if (entitiesResult.error) throw new Error(`GEOGRAPHY_PERSISTENCE_ERROR: ${entitiesResult.error.message}`)
    if (aliasesResult.error) throw new Error(`GEOGRAPHY_PERSISTENCE_ERROR: ${aliasesResult.error.message}`)
    if (externalIdsResult.error) throw new Error(`GEOGRAPHY_PERSISTENCE_ERROR: ${externalIdsResult.error.message}`)

    const aliasesByEntity = groupRows(aliasesResult.data as Row[] | null, 'entity_id')
    const externalIdsByEntity = groupRows(externalIdsResult.data as Row[] | null, 'entity_id')
    const entities = (entitiesResult.data as Row[] | null ?? []).map(row => GeographicEntitySchema.parse({
      id: row.id,
      parentId: row.parent_id ?? undefined,
      type: row.entity_type,
      name: row.name,
      normalizedName: row.normalized_name,
      aliases: (aliasesByEntity.get(String(row.id)) ?? []).map(alias => String(alias.alias)),
      countryCode: row.country_code,
      regionCode: row.region_code ?? undefined,
      slug: row.slug,
      coordinates: row.latitude === null || row.latitude === undefined ? undefined : {
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
      },
      sourceName: row.source_name,
      sourceVersion: row.source_version,
      sourceLicense: row.source_license,
      sourceSnapshotId: row.source_snapshot_id ?? undefined,
      sourceCheckedAt: row.source_checked_at ? new Date(String(row.source_checked_at)) : undefined,
      externalIds: Object.fromEntries((externalIdsByEntity.get(String(row.id)) ?? [])
        .map(item => [String(item.provider), String(item.external_id)])),
      status: row.status,
      resolutionMethod: row.resolution_method,
      ambiguityCandidateIds: [],
      version: row.version,
      createdAt: new Date(String(row.created_at)),
      updatedAt: new Date(String(row.updated_at)),
    }))
    const byId = new Map(entities.map(entity => [entity.id, entity]))
    return entities.map(entity => ({ entity, hierarchy: buildHierarchy(entity.parentId, byId) }))
  }

  async findCorrection(normalizedQuery: string, catalogVersion: string): Promise<string | null> {
    const { data, error } = await this.client
      .from('geographic_resolution_corrections')
      .select('selected_entity_id')
      .eq('normalized_query', normalizedQuery)
      .eq('catalog_version', catalogVersion)
      .maybeSingle()
    if (error) throw new Error(`GEOGRAPHY_PERSISTENCE_ERROR: ${error.message}`)
    return data ? String(data.selected_entity_id) : null
  }

  async saveCorrection(correction: GeographicCorrection): Promise<void> {
    const { error } = await this.client.from('geographic_resolution_corrections').upsert({
      normalized_query: correction.normalizedQuery,
      selected_entity_id: correction.selectedEntityId,
      catalog_version: correction.catalogVersion,
      actor_id: correction.actorId,
      reason: correction.reason ?? null,
    }, { onConflict: 'normalized_query,catalog_version' })
    if (error) throw new Error(`GEOGRAPHY_PERSISTENCE_ERROR: ${error.message}`)
  }
}

function groupRows(rows: Row[] | null, key: string): Map<string, Row[]> {
  const grouped = new Map<string, Row[]>()
  for (const row of rows ?? []) {
    const group = grouped.get(String(row[key])) ?? []
    group.push(row)
    grouped.set(String(row[key]), group)
  }
  return grouped
}

function buildHierarchy(
  parentId: string | undefined,
  entities: Map<string, ReturnType<typeof GeographicEntitySchema.parse>>,
): GeographicHierarchyNode[] {
  const hierarchy: GeographicHierarchyNode[] = []
  const visited = new Set<string>()
  let currentId = parentId
  while (currentId) {
    if (visited.has(currentId)) throw new Error('GEOGRAPHY_HIERARCHY_CYCLE')
    visited.add(currentId)
    const current = entities.get(currentId)
    if (!current) break
    hierarchy.unshift({
      id: current.id,
      type: current.type,
      name: current.name,
      normalizedName: current.normalizedName,
      countryCode: current.countryCode,
      regionCode: current.regionCode,
    })
    currentId = current.parentId
  }
  return hierarchy
}
