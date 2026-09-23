import type { VisualAssetModeSchema, VisualAssetRoleSchema } from '@shared/destination-visual-media-contract'
import type { VisualCandidate } from '@shared/visual-candidate-contracts'

export type SelectedVisualCandidate = {
  candidate: VisualCandidate
  role: typeof VisualAssetRoleSchema._output
  priority: number
  modes: Array<typeof VisualAssetModeSchema._output>
}

export type VisualCandidateSelectionPlan = {
  modes: Array<typeof VisualAssetModeSchema._output>
  highlightLimit?: number
  galleryLimit?: number
  excludeCandidateIds?: readonly string[]
  preferredCategories?: readonly string[]
  diversifyCategories?: boolean
}

/** Selection is intentionally small and stable: it only ranks candidates already eligible under the rights policy. */
export function selectVisualCandidates(
  candidates: readonly VisualCandidate[],
  plan: VisualCandidateSelectionPlan,
): SelectedVisualCandidate[] {
  const modes = [...new Set(plan.modes)].sort()
  if (modes.length === 0) throw new Error('VISUAL_SELECTION_REQUIRES_A_MODE')
  const selectedIds = new Set<string>(plan.excludeCandidateIds ?? [])
  const selectedCategories = new Set<string>()
  const select = (role: SelectedVisualCandidate['role'], limit: number): SelectedVisualCandidate[] => candidates
    .filter(candidate => candidate.requestedRole === role && isFinalRightsEligible(candidate) && !selectedIds.has(candidate.candidateId))
    .sort(compareCandidatesForRole(role, plan, selectedCategories))
    .slice(0, limit)
    .map((candidate, priority) => {
      selectedIds.add(candidate.candidateId)
      selectedCategories.add(candidate.requestedCategory)
      return { candidate, role, priority, modes }
    })

  return [
    ...select('hero', 1),
    ...select('highlight', Math.min(4, Math.max(0, plan.highlightLimit ?? 4))),
    ...select('gallery', Math.min(6, Math.max(0, plan.galleryLimit ?? 6))),
  ]
}

export function isFinalRightsEligible(candidate: VisualCandidate): boolean {
  return candidate.state === 'ELIGIBLE'
    && ['PUBLIC_DOMAIN', 'CC0', 'CC_BY_4_0', 'CC_BY_3_0'].includes(candidate.normalizedLicense)
    && candidate.creator !== null
    && candidate.licenseUrl !== null
    && candidate.attributionText !== null
    && candidate.sourcePageUrl !== null
    && candidate.originalMediaUrl !== null
}

function compareCandidatesForRole(role: SelectedVisualCandidate['role'], plan: VisualCandidateSelectionPlan, selectedCategories: ReadonlySet<string>) {
  return (left: VisualCandidate, right: VisualCandidate): number => {
    const preference = categoryPreference(right, plan, selectedCategories) - categoryPreference(left, plan, selectedCategories)
    if (preference !== 0) return preference
    const quality = roleQuality(right, role) - roleQuality(left, role)
    if (quality !== 0) return quality
    const metadata = metadataQuality(right) - metadataQuality(left)
    if (metadata !== 0) return metadata
    return left.canonicalTitle.localeCompare(right.canonicalTitle) || left.providerAssetId.localeCompare(right.providerAssetId)
  }
}

function categoryPreference(candidate: VisualCandidate, plan: VisualCandidateSelectionPlan, selectedCategories: ReadonlySet<string>): number {
  const preferred = plan.preferredCategories?.indexOf(candidate.requestedCategory) ?? -1
  const preferredScore = preferred === -1 ? 0 : 1_000 - preferred
  const varietyScore = plan.diversifyCategories && !selectedCategories.has(candidate.requestedCategory) ? 100 : 0
  return preferredScore + varietyScore
}

function roleQuality(candidate: VisualCandidate, role: SelectedVisualCandidate['role']): number {
  const width = candidate.width ?? 0
  const height = candidate.height ?? 0
  const ratio = height === 0 ? 0 : width / height
  const pixels = width * height
  const landscapeBonus = width >= height ? 10_000_000 : 0
  const ratioPenalty = role === 'hero' ? Math.round(Math.abs(ratio - 16 / 9) * 1_000_000) : 0
  return pixels + (role === 'hero' ? landscapeBonus - ratioPenalty : 0)
}

function metadataQuality(candidate: VisualCandidate): number {
  return [candidate.creator, candidate.licenseShortName, candidate.licenseUrl, candidate.attributionText, candidate.description]
    .filter(value => value !== null).length
}
