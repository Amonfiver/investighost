import { randomUUID } from 'node:crypto'
import {
  StructuredEditorialPackageV1Schema,
  type StructuredEditorialPackageV1,
  type VisualIntent,
} from '@shared/structured-editorial-package-contracts'
import type { DestinationVisualAssetSchema } from '@shared/destination-visual-media-contract'
import type { VisualCandidate } from '@shared/visual-candidate-contracts'

type ApprovedAsset = typeof DestinationVisualAssetSchema._output
type UnresolvedReason = 'NO_CANDIDATES' | 'RIGHTS_NOT_APPROVED' | 'DIMENSIONS_REJECTED' | 'ASPECT_REJECTED' | 'DUPLICATE_CONFLICT' | 'ENTITY_MATCH_TOO_WEAK'

export interface StructuredVisualResolutionInput {
  package: StructuredEditorialPackageV1
  candidates: readonly VisualCandidate[]
  /** Candidate-to-asset provenance from the existing visual acquisition path. */
  assetsByCandidateId: ReadonlyMap<string, ApprovedAsset>
  sourceVisualPackageId?: string
  visualRevisionId?: string
  now?: () => Date
  /** Explicitly allowed reuse is intentionally opt-in, never a ranking side effect. */
  allowAssetReuseForIntentIds?: readonly string[]
}

export interface ContextualMediaCopy {
  alt: string
  caption?: string
  shortCopy?: string
  cta?: string
}

export interface ContextualMediaCopyComposer {
  generateContextualMediaCopy(input: {
    asset: ApprovedAsset
    candidate: VisualCandidate
    intent: VisualIntent
    slot: VisualIntent['purpose']
    editorialContext: string
  }): ContextualMediaCopy
}

/** Deterministic, provider-neutral copy boundary.  It only combines selected
 * asset metadata with already-approved editorial wording; it never introduces
 * a new fact, date, location or claim. */
export class DeterministicContextualMediaCopyComposer implements ContextualMediaCopyComposer {
  generateContextualMediaCopy(input: { asset: ApprovedAsset; candidate: VisualCandidate; intent: VisualIntent; slot: VisualIntent['purpose']; editorialContext: string }): ContextualMediaCopy {
    const visualDescription = compact(input.asset.alt ?? input.candidate.description ?? input.candidate.canonicalTitle)
    const subject = compact(input.intent.subject)
    const alt = visualDescription === subject ? visualDescription : `${visualDescription} — ${subject}`
    const caption = input.slot === 'STUDENT_FIGURE' ? undefined : compact(input.candidate.canonicalTitle)
    return {
      alt,
      ...(caption ? { caption } : {}),
      ...(input.slot === 'ADVENTURE_HERO' ? { shortCopy: compact(input.editorialContext) } : {}),
    }
  }
}

/** Resolves only assets that are already public-use approved by the existing
 * visual pipeline. Discovery/download/staging and rights classification stay
 * outside this adapter. */
export function resolveStructuredVisualIntents(
  input: StructuredVisualResolutionInput,
  composer: ContextualMediaCopyComposer = new DeterministicContextualMediaCopyComposer(),
): StructuredEditorialPackageV1 {
  const source = StructuredEditorialPackageV1Schema.parse(input.package)
  const usedAssets = new Set<string>()
  const usedChecksums = new Set<string>()
  const allowReuse = new Set(input.allowAssetReuseForIntentIds ?? [])
  const resolutions: Array<{ intent: VisualIntent; candidate: VisualCandidate; asset: ApprovedAsset; score: number; copy: ContextualMediaCopy }> = []
  const unresolved: Array<{ intentId: string; reason: UnresolvedReason }> = []

  for (const intent of source.visualIntents) {
    const decision = selectForIntent(intent, source.destinationId, input.candidates, input.assetsByCandidateId, usedAssets, usedChecksums, allowReuse)
    if ('reason' in decision) { unresolved.push({ intentId: intent.id, reason: decision.reason }); continue }
    const copy = composer.generateContextualMediaCopy({ asset: decision.asset, candidate: decision.candidate, intent, slot: intent.purpose, editorialContext: intent.context })
    resolutions.push({ intent, ...decision, copy })
    if (!allowReuse.has(intent.id)) { usedAssets.add(decision.asset.assetId); usedChecksums.add(requiredChecksum(decision.asset)) }
  }

  const byIntent = new Map(resolutions.map(value => [value.intent.id, value]))
  const student = {
    ...source.student,
    document: {
      ...source.student.document,
      blocks: source.student.document.blocks.map(block => {
        if (block.type !== 'figure' || block.resolution !== 'INTENT') return block
        const selected = byIntent.get(block.visualIntentId)
        return selected ? { type: 'figure' as const, resolution: 'RESOLVED' as const, assetId: selected.asset.assetId, placement: block.placement, alt: selected.copy.alt, ...(selected.copy.caption ? { caption: selected.copy.caption } : {}) } : block
      }),
    },
  }
  const resolveAsset = (asset: { status: 'RESOLVED'; assetId: string } | { status: 'INTENT'; visualIntentId: string }) => asset.status === 'RESOLVED'
    ? asset
    : byIntent.get(asset.visualIntentId) ? { status: 'RESOLVED' as const, assetId: byIntent.get(asset.visualIntentId)!.asset.assetId } : asset
  const heroSelected = source.adventure.document.hero.asset.status === 'INTENT' ? byIntent.get(source.adventure.document.hero.asset.visualIntentId) : undefined
  const adventure = {
    ...source.adventure,
    document: {
      ...source.adventure.document,
      hero: { ...source.adventure.document.hero, asset: resolveAsset(source.adventure.document.hero.asset), ...(heroSelected?.copy.caption ? { caption: heroSelected.copy.caption } : {}), ...(heroSelected?.copy.shortCopy ? { shortCopy: heroSelected.copy.shortCopy } : {}) },
      visualStory: { items: source.adventure.document.visualStory.items.map(item => {
        const selected = item.asset.status === 'INTENT' ? byIntent.get(item.asset.visualIntentId) : undefined
        return { ...item, asset: resolveAsset(item.asset), ...(selected?.copy.caption ? { caption: selected.copy.caption } : {}), ...(selected?.copy.shortCopy ? { shortCopy: selected.copy.shortCopy } : {}), ...(selected?.copy.cta ? { cta: selected.copy.cta } : {}) }
      }) },
      placesToGo: { ...source.adventure.document.placesToGo, items: source.adventure.document.placesToGo.items.map(place => {
        if (!place.asset) return place
        const selected = place.asset.status === 'INTENT' ? byIntent.get(place.asset.visualIntentId) : undefined
        return { ...place, asset: resolveAsset(place.asset), ...(selected?.copy.caption ? { caption: selected.copy.caption } : {}) }
      }) },
    },
  }
  const allResolved = unresolved.length === 0
  const state = allResolved ? 'PACKAGE_READY_FOR_REVIEW' as const : resolutions.length > 0 ? 'CAPTIONS_RESOLVED' as const : 'VISUALS_PENDING' as const
  return StructuredEditorialPackageV1Schema.parse({
    ...source, state, student, adventure,
    ...(input.sourceVisualPackageId ? { visualPackageId: input.sourceVisualPackageId } : {}),
    visualResolution: {
      visualRevisionId: input.visualRevisionId ?? randomUUID(), ...(input.sourceVisualPackageId ? { sourceVisualPackageId: input.sourceVisualPackageId } : {}),
      state, resolved: resolutions.map(value => ({ intentId: value.intent.id, candidateId: value.candidate.candidateId, assetId: value.asset.assetId, checksum: requiredChecksum(value.asset), score: value.score, rightsStatus: 'APPROVED_FOR_PUBLIC_USE' as const, alt: value.copy.alt, ...(value.copy.caption ? { caption: value.copy.caption } : {}), ...(value.copy.shortCopy ? { shortCopy: value.copy.shortCopy } : {}), ...(value.copy.cta ? { cta: value.copy.cta } : {}) })),
      unresolved, generatedAt: (input.now ?? (() => new Date()))().toISOString(),
    },
  })
}

function selectForIntent(intent: VisualIntent, destinationId: string, candidates: readonly VisualCandidate[], assets: ReadonlyMap<string, ApprovedAsset>, usedAssets: ReadonlySet<string>, usedChecksums: ReadonlySet<string>, allowReuse: ReadonlySet<string>) {
  const matching = candidates.filter(candidate => candidate.destinationId === destinationId)
  if (!matching.length) return { reason: 'NO_CANDIDATES' as const }
  const publicCandidates = matching.filter(candidate => candidate.state === 'ELIGIBLE' && isApprovedAsset(assets.get(candidate.candidateId)))
  if (!publicCandidates.length) return { reason: 'RIGHTS_NOT_APPROVED' as const }
  const dimensioned = publicCandidates.filter(candidate => (candidate.width ?? 0) >= 640 && (candidate.height ?? 0) >= 360)
  if (!dimensioned.length) return { reason: 'DIMENSIONS_REJECTED' as const }
  const aspect = dimensioned.filter(candidate => aspectSuitable(candidate, intent))
  if (!aspect.length) return { reason: 'ASPECT_REJECTED' as const }
  const entity = aspect.filter(candidate => entityScore(candidate, intent) > 0)
  if (!entity.length) return { reason: 'ENTITY_MATCH_TOO_WEAK' as const }
  const unique = entity.filter(candidate => {
    const asset = assets.get(candidate.candidateId)!
    return allowReuse.has(intent.id) || (!usedAssets.has(asset.assetId) && !usedChecksums.has(requiredChecksum(asset)))
  })
  if (!unique.length) return { reason: 'DUPLICATE_CONFLICT' as const }
  const ranked = unique.map(candidate => ({ candidate, asset: assets.get(candidate.candidateId)!, score: score(candidate, intent) }))
    .sort((a, b) => b.score - a.score || a.candidate.canonicalTitle.localeCompare(b.candidate.canonicalTitle) || a.candidate.candidateId.localeCompare(b.candidate.candidateId))
  return ranked[0]!
}

function isApprovedAsset(asset: ApprovedAsset | undefined): asset is ApprovedAsset {
  return Boolean(asset && asset.lifecycle === 'APPROVED' && asset.rightsStatus === 'APPROVED_FOR_PUBLIC_USE' && asset.usageAllowed === true && asset.rightsCheckedAt && asset.publicUrl && asset.checksum)
}
function aspectSuitable(candidate: VisualCandidate, intent: VisualIntent): boolean {
  const ratio = (candidate.width ?? 0) / (candidate.height ?? 1)
  if (intent.purpose === 'ADVENTURE_HERO') return ratio >= 1.3 && ratio <= 2.5
  if (intent.purpose === 'STUDENT_FIGURE' && intent.desiredPlacement === 'WIDE') return ratio >= 1.15
  return ratio >= 0.65 && ratio <= 2.8
}
function entityScore(candidate: VisualCandidate, intent: VisualIntent): number {
  const haystack = `${candidate.canonicalTitle} ${candidate.description ?? ''}`.toLocaleLowerCase()
  const subject = tokens(intent.subject)
  const keywords = intent.keywords.flatMap(tokens)
  return subject.filter(token => haystack.includes(token)).length * 100 + keywords.filter(token => haystack.includes(token)).length * 10
}
function score(candidate: VisualCandidate, intent: VisualIntent): number {
  const role = candidate.requestedRole === expectedRole(intent) ? 100_000 : 0
  const dimensions = (candidate.width ?? 0) * (candidate.height ?? 0) / 1_000
  const metadata = [candidate.creator, candidate.licenseUrl, candidate.attributionText, candidate.description].filter(Boolean).length
  return role + entityScore(candidate, intent) * 100 + dimensions + metadata
}
function expectedRole(intent: VisualIntent): 'hero' | 'highlight' | 'gallery' { return intent.purpose === 'ADVENTURE_HERO' ? 'hero' : intent.purpose === 'VISUAL_STORY' ? 'highlight' : 'gallery' }
function tokens(value: string): string[] { return value.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^\p{L}\p{N}]+/u).filter(token => token.length >= 3) }
function compact(value: string): string { return value.replace(/\s+/g, ' ').trim() }
function requiredChecksum(asset: ApprovedAsset): string { if (!asset.checksum) throw new Error('VISUAL_RESOLUTION_CHECKSUM_REQUIRED'); return asset.checksum }
