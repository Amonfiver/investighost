import {
  RealResearchSourceSchema,
  type RealResearchSource,
} from '@shared/real-pipeline-contracts'

export const GLOBAL_SOURCE_LIMIT_EXCLUSION_REASON =
  'global_source_limit_exhausted' as const

export interface GlobalSourceLimitExclusion {
  source: RealResearchSource
  rank: number
  reason: typeof GLOBAL_SOURCE_LIMIT_EXCLUSION_REASON
}

export interface GlobalSourceLimitSelection {
  maximumSources: number
  availableSlots: number
  existingSources: RealResearchSource[]
  candidateSources: RealResearchSource[]
  selectedSources: RealResearchSource[]
  excludedSources: GlobalSourceLimitExclusion[]
  combinedSources: RealResearchSource[]
}

export class GlobalSourceLimitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GlobalSourceLimitError'
  }
}

export function availableGlobalSourceSlots(
  existingCandidates: RealResearchSource[],
  maximumSources: number,
): number {
  const existing = uniqueExistingSources(existingCandidates)
  assertMaximum(maximumSources)
  if (existing.length > maximumSources) {
    throw new GlobalSourceLimitError(
      'El expediente ya supera el máximo global de fuentes',
    )
  }
  return maximumSources - existing.length
}

export function selectSourcesWithinGlobalLimit(
  existingCandidates: RealResearchSource[],
  newCandidates: RealResearchSource[],
  maximumSources: number,
): GlobalSourceLimitSelection {
  const existingSources = uniqueExistingSources(existingCandidates)
  const availableSlots = availableGlobalSourceSlots(existingSources, maximumSources)
  const existingUrls = new Set(existingSources.map(source => source.normalizedUrl))
  const candidateSources = rankedUniqueSources(newCandidates)
    .filter(source => !existingUrls.has(source.normalizedUrl))
  const selectedSources = candidateSources.slice(0, availableSlots)
  const excludedSources = candidateSources.slice(availableSlots).map((source, index) => ({
    source,
    rank: availableSlots + index + 1,
    reason: GLOBAL_SOURCE_LIMIT_EXCLUSION_REASON,
  }))
  return {
    maximumSources,
    availableSlots,
    existingSources,
    candidateSources,
    selectedSources,
    excludedSources,
    combinedSources: [...existingSources, ...selectedSources],
  }
}

function uniqueExistingSources(candidates: RealResearchSource[]): RealResearchSource[] {
  const sources = candidates.map(candidate => RealResearchSourceSchema.parse(candidate))
  const unique = new Map<string, RealResearchSource>()
  for (const source of sources) {
    if (unique.has(source.normalizedUrl)) {
      throw new GlobalSourceLimitError(
        'El expediente durable contiene fuentes normalizadas duplicadas',
      )
    }
    unique.set(source.normalizedUrl, source)
  }
  return [...unique.values()]
}

function rankedUniqueSources(candidates: RealResearchSource[]): RealResearchSource[] {
  const ranked = candidates
    .map(candidate => RealResearchSourceSchema.parse(candidate))
    .sort((left, right) =>
      right.score - left.score
      || compareText(left.normalizedUrl, right.normalizedUrl)
      || compareText(left.id, right.id))
  const unique = new Map<string, RealResearchSource>()
  for (const source of ranked) {
    if (!unique.has(source.normalizedUrl)) unique.set(source.normalizedUrl, source)
  }
  return [...unique.values()]
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function assertMaximum(maximumSources: number): void {
  if (!Number.isInteger(maximumSources) || maximumSources <= 0) {
    throw new GlobalSourceLimitError('El máximo global de fuentes no es válido')
  }
}
