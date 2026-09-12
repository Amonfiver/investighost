import { createHash } from 'node:crypto'
import { createLocalSupabaseClientFromEnv } from '../src/services/supabase'
import {
  ADVENTURE_R2_EVIDENCE_AUDIT,
  ALBARRACIN_ADVENTURE_R2,
  assertR2ChangesAreLimited,
  canonicalSections,
  refineAlbarracinAdventureR1ToR2,
} from '../src/modules/library-versioning/albarracin-adventure-r2'
import {
  RealEditorialLibraryVersionComparisonService,
  RealEditorialLibraryVersionDraftApplicationService,
  SupabaseRealEditorialLibraryVersioningRepository,
} from '../src/modules/library-versioning'
import { MANUAL_LOCAL_ACTOR_ID } from '../src/modules/editorial-pipeline/manual-runtime'

const STUDENT = {
  libraryEntryId: '7a686367-bb9f-40ee-a92e-42dcf2ef4d64',
  versionId: '17360577-fad2-48dc-be0d-467b6fd0cab9',
  revisionId: 'c3ba0770-5caf-4fb9-b53f-8429d038bd41',
} as const

const { client } = createLocalSupabaseClientFromEnv()
const repository = new SupabaseRealEditorialLibraryVersioningRepository(client)
const drafts = new RealEditorialLibraryVersionDraftApplicationService(repository, repository, repository)
const comparisons = new RealEditorialLibraryVersionComparisonService(repository)

const beforeAdventure = await repository.getVersionDetail(ALBARRACIN_ADVENTURE_R2.versionId)
const beforeStudent = await repository.getVersionDetail(STUDENT.versionId)
assertAdventureR1(beforeAdventure)
assertStudentR1(beforeStudent)

const r2Content = refineAlbarracinAdventureR1ToR2(beforeAdventure.currentRevision.content)
const saved = await drafts.saveDraft({
  versionId: ALBARRACIN_ADVENTURE_R2.versionId,
  expectedPreviousRevisionHash: beforeAdventure.currentRevision.revisionHash,
  title: beforeAdventure.currentRevision.title,
  content: r2Content,
  changeSummary: ALBARRACIN_ADVENTURE_R2.changeSummary,
  actorId: MANUAL_LOCAL_ACTOR_ID,
  operationKey: createHash('sha256').update('investighost:albarracin:adventure:v2:r2').digest('hex'),
})
if (saved.status !== 'ok') throw new Error(`Adventure r2 no se creó (${saved.code})`)

const afterAdventure = await repository.getVersionDetail(ALBARRACIN_ADVENTURE_R2.versionId)
const afterStudent = await repository.getVersionDetail(STUDENT.versionId)
assertAdventureR2(beforeAdventure, afterAdventure)
assertStudentUntouched(beforeStudent, afterStudent)

const comparison = await comparisons.compare({
  left: {
    kind: 'revision', versionId: ALBARRACIN_ADVENTURE_R2.versionId,
    revisionId: ALBARRACIN_ADVENTURE_R2.parentRevisionId,
  },
  right: {
    kind: 'revision', versionId: ALBARRACIN_ADVENTURE_R2.versionId,
    revisionId: afterAdventure.currentRevision.id,
  },
})
if (comparison.status !== 'ok') throw new Error(`No se pudo generar el diff r1 → r2 (${comparison.code})`)
assertR2ChangesAreLimited(beforeAdventure.currentRevision.content, afterAdventure.currentRevision.content)

console.log(JSON.stringify({
  status: 'ok',
  operation: 'create_albarracin_adventure_v2_r2',
  adventure: {
    candidateId: ALBARRACIN_ADVENTURE_R2.versionId,
    revisionId: afterAdventure.currentRevision.id,
    version: `v${afterAdventure.version.versionNumber}/r${afterAdventure.currentRevision.revisionNumber}`,
    parentRevisionId: afterAdventure.currentRevision.previousRevisionId,
    originVersionHash: afterAdventure.originV1.originVersionHash,
    state: afterAdventure.state.effectiveState,
    decisionCount: afterAdventure.decisions.length,
    sources: afterAdventure.originV1.sources.length,
    gaps: afterAdventure.originV1.gaps.length,
    contradictions: afterAdventure.originV1.contradictions.length,
    sections: Object.fromEntries(canonicalSections(afterAdventure.currentRevision.content)),
  },
  diff: comparison.comparison,
  evidenceAudit: ADVENTURE_R2_EVIDENCE_AUDIT,
  humanBarrier: {
    adventureApproved: afterAdventure.state.isCurrentApproved,
    studentApproved: afterStudent.state.isCurrentApproved,
    currentApprovedChanged: afterAdventure.currentApproved.source !== 'origin_v1'
      || afterStudent.currentApproved.source !== 'origin_v1',
    mappingCreated: false,
    dryRunExecuted: false,
    deliveryExecuted: false,
    trawelTouched: false,
    publication: afterAdventure.publicationState !== 'unpublished'
      || afterStudent.publicationState !== 'unpublished',
  },
}, null, 2))

function assertAdventureR1(detail: Awaited<ReturnType<typeof repository.getVersionDetail>>): void {
  if (
    detail.version.versionId !== ALBARRACIN_ADVENTURE_R2.versionId
    || detail.version.versionNumber !== 2
    || detail.currentRevision.id !== ALBARRACIN_ADVENTURE_R2.parentRevisionId
    || detail.currentRevision.revisionNumber !== 1
    || detail.state.effectiveState !== 'draft'
    || detail.decisions.length !== 0
    || detail.currentApproved.source !== 'origin_v1'
    || detail.originV1.originVersionHash !== ALBARRACIN_ADVENTURE_R2.expectedOriginVersionHash
    || detail.originV1.sources.length !== 8
    || detail.originV1.gaps.length !== 7
    || detail.originV1.contradictions.length !== 4
  ) throw new Error('Adventure r1 no satisface el preestado durable requerido')
}

function assertAdventureR2(
  before: Awaited<ReturnType<typeof repository.getVersionDetail>>,
  after: Awaited<ReturnType<typeof repository.getVersionDetail>>,
): void {
  const r1 = after.revisions.find(revision => revision.id === ALBARRACIN_ADVENTURE_R2.parentRevisionId)
  const findings = after.effectiveFindings.items
  const count = (type: string) => findings.filter(item => item.sourceFindingType === type).length
  if (
    r1?.content !== before.currentRevision.content
    || after.currentRevision.revisionNumber !== 2
    || after.currentRevision.previousRevisionId !== ALBARRACIN_ADVENTURE_R2.parentRevisionId
    || after.currentRevision.expectedPreviousRevisionHash !== before.currentRevision.revisionHash
    || after.state.effectiveState !== 'draft'
    || after.decisions.length !== 0
    || after.state.isCurrentApproved
    || after.currentApproved.source !== 'origin_v1'
    || after.originV1.content !== before.originV1.content
    || after.originV1.sources.length !== 8
    || after.originV1.gaps.length !== 7
    || after.originV1.contradictions.length !== 4
    || count('gap') !== 7
    || count('contradiction') !== 4
    || after.publicationState !== 'unpublished'
  ) throw new Error('Adventure r2 no preserva el linaje, findings o barrera humana')
}

function assertStudentR1(detail: Awaited<ReturnType<typeof repository.getVersionDetail>>): void {
  if (
    detail.version.versionId !== STUDENT.versionId
    || detail.currentRevision.id !== STUDENT.revisionId
    || detail.currentRevision.revisionNumber !== 1
    || detail.decisions.length !== 0
    || detail.state.isCurrentApproved
    || detail.currentApproved.source !== 'origin_v1'
  ) throw new Error('Student r1 no satisface el estado de integridad esperado')
}

function assertStudentUntouched(
  before: Awaited<ReturnType<typeof repository.getVersionDetail>>,
  after: Awaited<ReturnType<typeof repository.getVersionDetail>>,
): void {
  if (JSON.stringify(after) !== JSON.stringify(before)) {
    throw new Error('Student cambió durante la creación de Adventure r2')
  }
}
