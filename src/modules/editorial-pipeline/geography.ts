import { z } from 'zod'
import {
  GeographicEntitySchema,
  type GeographicEntity,
} from '@shared/editorial-contracts'

export interface GeographicHierarchyNode {
  id: string
  type: GeographicEntity['type']
  name: string
  normalizedName: string
  countryCode: string
  regionCode?: string
}

export interface GeographicCatalogEntry {
  entity: GeographicEntity
  hierarchy: GeographicHierarchyNode[]
}

export interface GeographicCorrection {
  normalizedQuery: string
  selectedEntityId: string
  catalogVersion: string
  actorId: string
  reason?: string
}

export interface GeographyCatalogRepository {
  listActive(): Promise<GeographicCatalogEntry[]>
  findCorrection(normalizedQuery: string, catalogVersion: string): Promise<string | null>
  saveCorrection(correction: GeographicCorrection): Promise<void>
}

export interface GeographicResolutionInput {
  query: string
  countryCode?: string
  regionCode?: string
  type?: GeographicEntity['type']
}

export interface GeographicResolutionCandidate {
  entity: GeographicEntity
  hierarchy: GeographicHierarchyNode[]
  score: number
  method: 'exact' | 'alias' | 'tolerant'
}

interface GeographicResolutionBase {
  query: string
  normalizedQuery: string
  catalogVersion: string
}

export type GeographicResolution =
  | (GeographicResolutionBase & {
    status: 'resolved'
    method: 'exact' | 'alias' | 'tolerant' | 'human'
    entity: GeographicEntity
    hierarchy: GeographicHierarchyNode[]
    score: number
  })
  | (GeographicResolutionBase & {
    status: 'ambiguous'
    candidates: GeographicResolutionCandidate[]
  })
  | (GeographicResolutionBase & {
    status: 'not_found'
    reason: string
  })

export type GeographyResolutionErrorCode = 'INVALID_QUERY' | 'CORRECTION_NOT_ALLOWED' | 'INVALID_CANDIDATE'

export class GeographyResolutionError extends Error {
  constructor(readonly code: GeographyResolutionErrorCode, message: string) {
    super(message)
    this.name = 'GeographyResolutionError'
  }
}

const GeographicResolutionInputSchema = z.object({
  query: z.string().trim().min(1).max(300),
  countryCode: z.string().length(2).transform(value => value.toUpperCase()).optional(),
  regionCode: z.string().trim().min(1).max(20).optional(),
  type: z.enum(['country', 'region', 'locality', 'zone']).optional(),
})

const HumanCorrectionSchema = z.object({
  actorId: z.string().uuid(),
  candidateId: z.string().uuid(),
  reason: z.string().trim().min(1).max(1000).optional(),
})

export function normalizeGeographicText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('es')
    .replace(/[’']/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export function slugifyGeographicText(value: string): string {
  return normalizeGeographicText(value).replace(/\s+/g, '-')
}

export function geographicSimilarity(left: string, right: string): number {
  if (left === right) return 1
  if (!left || !right) return 0
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0]
    previous[0] = leftIndex
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex]
      const substitution = diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
      previous[rightIndex] = Math.min(previous[rightIndex] + 1, previous[rightIndex - 1] + 1, substitution)
      diagonal = above
    }
  }
  return 1 - previous[right.length] / Math.max(left.length, right.length)
}

export class GeographicResolver {
  constructor(
    private readonly repository: GeographyCatalogRepository,
    readonly catalogVersion: string,
    private readonly tolerantThreshold = 0.72,
    private readonly ambiguityDelta = 0.03,
  ) {}

  async resolve(candidate: GeographicResolutionInput): Promise<GeographicResolution> {
    const parsed = GeographicResolutionInputSchema.safeParse(candidate)
    if (!parsed.success) {
      throw new GeographyResolutionError('INVALID_QUERY', parsed.error.issues.map(issue => issue.message).join('; '))
    }
    const input = parsed.data
    const normalizedQuery = buildResolutionKey(input)
    const base = { query: input.query, normalizedQuery, catalogVersion: this.catalogVersion }
    const entries = (await this.repository.listActive())
      .filter(entry => this.matchesFilters(entry.entity, input))
      .sort((left, right) => left.entity.id.localeCompare(right.entity.id))

    const correctedEntityId = await this.repository.findCorrection(normalizedQuery, this.catalogVersion)
    if (correctedEntityId) {
      const corrected = entries.find(entry => entry.entity.id === correctedEntityId)
      if (corrected) {
        return {
          ...base,
          status: 'resolved',
          method: 'human',
          entity: withResolution(corrected.entity, 'human', []),
          hierarchy: corrected.hierarchy,
          score: 1,
        }
      }
    }

    const segments = input.query.split(',').map(normalizeGeographicText).filter(Boolean)
    const primaryQuery = segments[0] ?? normalizeGeographicText(input.query)
    const fullQuery = normalizeGeographicText(input.query)
    const qualifiers = segments.slice(1)
    const candidates = entries
      .map(entry => this.score(entry, primaryQuery, fullQuery, qualifiers))
      .filter((entry): entry is GeographicResolutionCandidate => entry !== null && entry.score >= this.tolerantThreshold)
      .sort((left, right) => right.score - left.score || left.entity.id.localeCompare(right.entity.id))

    if (candidates.length === 0) {
      return { ...base, status: 'not_found', reason: 'El catálogo versionado no contiene una coincidencia suficiente' }
    }

    const topScore = candidates[0].score
    const competing = candidates.filter(item => topScore - item.score <= this.ambiguityDelta)
    if (competing.length > 1) {
      const candidateIds = competing.map(item => item.entity.id)
      return {
        ...base,
        status: 'ambiguous',
        candidates: competing.map(item => ({
          ...item,
          entity: withResolution(item.entity, item.method, candidateIds.filter(candidateId => candidateId !== item.entity.id)),
        })),
      }
    }

    const winner = candidates[0]
    return {
      ...base,
      status: 'resolved',
      method: winner.method,
      entity: withResolution(winner.entity, winner.method, []),
      hierarchy: winner.hierarchy,
      score: winner.score,
    }
  }

  async applyHumanCorrection(
    input: GeographicResolutionInput,
    correction: { actorId: string; candidateId: string; reason?: string },
  ): Promise<Extract<GeographicResolution, { status: 'resolved' }>> {
    const parsedCorrection = HumanCorrectionSchema.safeParse(correction)
    if (!parsedCorrection.success) {
      throw new GeographyResolutionError('INVALID_CANDIDATE', parsedCorrection.error.issues.map(issue => issue.message).join('; '))
    }
    const resolution = await this.resolve(input)
    if (resolution.status !== 'ambiguous') {
      throw new GeographyResolutionError('CORRECTION_NOT_ALLOWED', 'Solo una resolución ambigua admite corrección humana')
    }
    const selected = resolution.candidates.find(candidate => candidate.entity.id === parsedCorrection.data.candidateId)
    if (!selected) {
      throw new GeographyResolutionError('INVALID_CANDIDATE', 'La entidad elegida no pertenece a las alternativas visibles')
    }
    await this.repository.saveCorrection({
      normalizedQuery: resolution.normalizedQuery,
      selectedEntityId: selected.entity.id,
      catalogVersion: this.catalogVersion,
      actorId: parsedCorrection.data.actorId,
      reason: parsedCorrection.data.reason,
    })
    return {
      query: resolution.query,
      normalizedQuery: resolution.normalizedQuery,
      catalogVersion: this.catalogVersion,
      status: 'resolved',
      method: 'human',
      entity: withResolution(selected.entity, 'human', resolution.candidates.map(candidate => candidate.entity.id)),
      hierarchy: selected.hierarchy,
      score: 1,
    }
  }

  private matchesFilters(entity: GeographicEntity, input: z.infer<typeof GeographicResolutionInputSchema>): boolean {
    return (!input.countryCode || entity.countryCode === input.countryCode)
      && (!input.regionCode || entity.regionCode === input.regionCode)
      && (!input.type || entity.type === input.type)
  }

  private score(
    entry: GeographicCatalogEntry,
    primaryQuery: string,
    fullQuery: string,
    qualifiers: string[],
  ): GeographicResolutionCandidate | null {
    const canonicalName = normalizeGeographicText(entry.entity.normalizedName)
    const aliases = entry.entity.aliases.map(normalizeGeographicText)
    const names = [canonicalName, ...aliases]
    const fullCanonicalMatch = canonicalName === fullQuery
    const fullAliasMatch = aliases.includes(fullQuery)
    const primaryCanonicalMatch = canonicalName === primaryQuery
    const primaryAliasMatch = aliases.includes(primaryQuery)
    const similarity = Math.max(...names.map(name => geographicSimilarity(primaryQuery, name)))
    if (!fullCanonicalMatch && !fullAliasMatch && !primaryCanonicalMatch && !primaryAliasMatch && similarity < this.tolerantThreshold) {
      return null
    }

    let method: GeographicResolutionCandidate['method'] = 'tolerant'
    let score = 0.55 + similarity * 0.4
    if (fullCanonicalMatch) {
      method = 'exact'
      score = 1
    } else if (fullAliasMatch) {
      method = 'alias'
      score = 1
    } else if (primaryCanonicalMatch) {
      method = 'exact'
      score = 0.9
    } else if (primaryAliasMatch) {
      method = 'alias'
      score = 0.9
    }

    const contextNames = new Set([
      entry.entity.countryCode.toLocaleLowerCase(),
      entry.entity.regionCode?.toLocaleLowerCase() ?? '',
      ...entry.hierarchy.flatMap(node => [
        normalizeGeographicText(node.name),
        normalizeGeographicText(node.normalizedName),
        node.countryCode.toLocaleLowerCase(),
        node.regionCode?.toLocaleLowerCase() ?? '',
      ]),
    ].filter(Boolean))
    for (const qualifier of qualifiers) {
      if (contextNames.has(qualifier)) score += 0.04
      else score -= 0.16
    }

    return {
      entity: structuredClone(entry.entity),
      hierarchy: structuredClone(entry.hierarchy),
      score: Math.max(0, Math.min(1, Number(score.toFixed(4)))),
      method,
    }
  }
}

export class MemoryGeographyCatalogRepository implements GeographyCatalogRepository {
  private readonly entries: GeographicCatalogEntry[]
  private readonly corrections = new Map<string, GeographicCorrection>()

  constructor(entries: GeographicCatalogEntry[]) {
    this.entries = entries.map(entry => ({
      entity: GeographicEntitySchema.parse(entry.entity),
      hierarchy: structuredClone(entry.hierarchy),
    }))
  }

  async listActive(): Promise<GeographicCatalogEntry[]> {
    return structuredClone(this.entries.filter(entry => entry.entity.status === 'active'))
  }

  async findCorrection(normalizedQuery: string, catalogVersion: string): Promise<string | null> {
    return this.corrections.get(`${catalogVersion}:${normalizedQuery}`)?.selectedEntityId ?? null
  }

  async saveCorrection(correction: GeographicCorrection): Promise<void> {
    if (!this.entries.some(entry => entry.entity.id === correction.selectedEntityId && entry.entity.status === 'active')) {
      throw new GeographyResolutionError('INVALID_CANDIDATE', 'No se puede corregir hacia una entidad inexistente o inactiva')
    }
    this.corrections.set(`${correction.catalogVersion}:${correction.normalizedQuery}`, structuredClone(correction))
  }
}

function buildResolutionKey(input: z.infer<typeof GeographicResolutionInputSchema>): string {
  return [
    normalizeGeographicText(input.query),
    input.countryCode ?? '*',
    input.regionCode ? normalizeGeographicText(input.regionCode) : '*',
    input.type ?? '*',
  ].join('|')
}

function withResolution(
  entity: GeographicEntity,
  method: GeographicEntity['resolutionMethod'],
  ambiguityCandidateIds: string[],
): GeographicEntity {
  return GeographicEntitySchema.parse({
    ...structuredClone(entity),
    resolutionMethod: method,
    ambiguityCandidateIds,
  })
}
