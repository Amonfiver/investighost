import { createHash } from 'node:crypto'
import { createLocalSupabaseClientFromEnv } from '../src/services/supabase'
import {
  ALBARRACIN_PACK_B_CANDIDATES,
  canonicalHeadingKinds,
  type AlbarracinPackBCandidate,
} from '../src/modules/library-versioning/albarracin-pack-b'
import {
  RealEditorialLibraryVersionComparisonService,
  RealEditorialLibraryVersionDraftApplicationService,
  SupabaseRealEditorialLibraryVersioningRepository,
} from '../src/modules/library-versioning'
import { MANUAL_LOCAL_ACTOR_ID } from '../src/modules/editorial-pipeline/manual-runtime'

const { client } = createLocalSupabaseClientFromEnv()
const repository = new SupabaseRealEditorialLibraryVersioningRepository(client)
const drafts = new RealEditorialLibraryVersionDraftApplicationService(
  repository, repository, repository,
)
const comparisons = new RealEditorialLibraryVersionComparisonService(repository)

const results = await Promise.all(Object.values(ALBARRACIN_PACK_B_CANDIDATES)
  .map(candidate => createAndValidateCandidate(candidate)))

console.log(JSON.stringify({
  status: 'ok',
  operation: 'create_albarracin_pack_b_candidates',
  candidates: results,
  humanBarrier: {
    approved: false,
    currentApprovedChanged: false,
    deliveryExecuted: false,
    mappingCreated: false,
    trawelTouched: false,
    publication: false,
  },
}, null, 2))

async function createAndValidateCandidate(candidate: AlbarracinPackBCandidate) {
  const before = await repository.getVersioningSummary(candidate.libraryEntryId)
  assertOrigin(before, candidate)
  assertTaxonomy(candidate)

  const draft = await drafts.createDraft({
    libraryEntryId: candidate.libraryEntryId,
    expectedHeadHash: candidate.expectedOriginVersionHash,
    title: candidate.title,
    content: candidate.content,
    changeSummary: candidate.changeSummary,
    actorId: MANUAL_LOCAL_ACTOR_ID,
    operationKey: operationKey(candidate.profile),
  })
  if (draft.status !== 'ok') {
    throw new Error(`${candidate.profile}: no se creó el draft (${draft.code})`)
  }
  if (draft.version.effectiveState !== 'draft' || draft.stateSnapshot.effectiveState !== 'draft') {
    throw new Error(`${candidate.profile}: el candidate no permaneció en draft`)
  }
  if (draft.entrySummary.currentApproved?.versionHash !== candidate.expectedOriginVersionHash
    || draft.entrySummary.currentApproved?.source !== 'origin_v1') {
    throw new Error(`${candidate.profile}: current approved cambió durante la creación`)
  }

  const detail = await repository.getVersionDetail(draft.version.versionId)
  const findings = await repository.getEffectiveVersionFindings(
    detail.version.versionId,
    detail.currentRevision.id,
  )
  const comparison = await comparisons.compare({
    left: { kind: 'origin_v1', libraryEntryId: candidate.libraryEntryId },
    right: {
      kind: 'revision', versionId: detail.version.versionId, revisionId: detail.currentRevision.id,
    },
  })
  if (comparison.status !== 'ok') {
    throw new Error(`${candidate.profile}: no se pudo generar el diff (${comparison.code})`)
  }

  const after = await repository.getVersioningSummary(candidate.libraryEntryId)
  assertOrigin(after, candidate)
  if (after.currentApproved?.versionHash !== before.currentApproved?.versionHash
    || after.currentApproved?.source !== before.currentApproved?.source) {
    throw new Error(`${candidate.profile}: current approved cambió tras el candidate`)
  }
  assertFindings(findings.items, after.originalVersion)

  return {
    profile: candidate.profile,
    libraryEntryId: candidate.libraryEntryId,
    versionId: detail.version.versionId,
    versionNumber: detail.version.versionNumber,
    revisionId: detail.currentRevision.id,
    revisionNumber: detail.currentRevision.revisionNumber,
    parent: detail.parent,
    state: detail.state.effectiveState,
    publicationState: detail.publicationState,
    operationReplayed: draft.operationReplayed,
    taxonomy: canonicalHeadingKinds(detail.currentRevision.content),
    sourceCount: after.originalVersion.sources.length,
    gapCount: after.originalVersion.gaps.length,
    contradictionCount: after.originalVersion.contradictions.length,
    claimCount: after.originalVersion.claims.length,
    findingCount: findings.items.length,
    decisionCount: detail.decisions.length,
    diff: {
      comparisonKind: comparison.comparison.comparisonKind,
      fingerprint: comparison.comparison.fingerprint,
      statistics: comparison.comparison.statistics,
    },
  }
}

function assertOrigin(
  summary: Awaited<ReturnType<typeof repository.getVersioningSummary>>,
  candidate: AlbarracinPackBCandidate,
): void {
  if (summary.profile !== candidate.profile
    || summary.originalVersion.title !== candidate.title
    || summary.originalVersion.originVersionHash !== candidate.expectedOriginVersionHash
    || summary.originalVersion.versionNumber !== 1
    || summary.originalVersion.sources.length === 0
    || summary.originalVersion.gaps.length === 0
    || summary.originalVersion.contradictions.length === 0
    || summary.publication.publicationCount !== 0
    || summary.publication.trawelConnected
    || summary.publication.automaticEnabled) {
    throw new Error(`${candidate.profile}: origin_v1 no coincide con el expediente durable esperado`)
  }
}

function assertTaxonomy(candidate: AlbarracinPackBCandidate): void {
  const headings = canonicalHeadingKinds(candidate.content)
  if (JSON.stringify(headings) !== JSON.stringify(candidate.taxonomy)) {
    throw new Error(`${candidate.profile}: taxonomía canónica incompleta o ambigua`)
  }
}

function assertFindings(
  findings: Array<{ sourceFindingType: string }>,
  origin: Awaited<ReturnType<typeof repository.getVersioningSummary>>['originalVersion'],
): void {
  const count = (kind: string) => findings.filter(finding => finding.sourceFindingType === kind).length
  if (count('gap') !== origin.gaps.length
    || count('contradiction') !== origin.contradictions.length
    || count('claim') !== origin.claims.length) {
    throw new Error('Los findings heredados no preservan gaps, contradicciones y claims del origin_v1')
  }
}

function operationKey(profile: AlbarracinPackBCandidate['profile']): string {
  return createHash('sha256').update(`investighost:pack-b:albarracin:${profile}:v2:r1`).digest('hex')
}
