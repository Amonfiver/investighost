import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { MANUAL_LOCAL_ACTOR_ID } from '@modules/editorial-pipeline/manual-runtime'
import {
  RealEditorialLibraryVersionDraftApplicationService,
  SupabaseRealEditorialLibraryVersioningRepository,
} from '@modules/library-versioning'
import {
  assertV2StructuralSemanticEquivalence,
  normalizeApprovedContentForV2,
} from '@modules/library-versioning/v2-structural-normalization'
import { SupabaseRealEditorialPilotRepository } from '@modules/real-pipeline'
import {
  prepareTrawelEditorialDeliveryV2,
  projectLibraryEntryToTrawelEditorialProfile,
} from '@modules/trawel-handoff'
import { RealEditorialLibraryVersioningService } from '@modules/library-versioning/repository'
import type { LibraryTrawelApprovedSource } from '@shared/trawel-editorial-handoff-contracts'

const EXPECTED = {
  adventure: {
    libraryEntryId: 'c9683342-5eb6-4d29-91fa-6eeadabe21af',
    versionId: '4a6ca898-7967-4052-a7a2-d6d25c26ce2a',
    revisionId: '2cce7419-ba03-42a9-a4ae-8fddfe9c4343',
    versionHash: '4e5b4321c915a392ad7bcce2e8aad692d891ed8f6f41993301d9633e1ccd8e9b',
    contentHash: '885513951103f6e937a07d812ceb89e0b01fe99b9ee5dd6845bc257d5b224dfd',
  },
  student: {
    libraryEntryId: 'c2c1bf05-45f4-4b04-bc3f-e4894c909bf4',
    versionId: '7791d810-35a8-4269-bfa6-c2fad5132b4d',
    revisionId: 'ef060c8f-fd5a-498f-9688-4f622828ca2d',
    versionHash: '28ce52f3f1164465a069ce2f51f10b02ba08cf8f3ac896693b27ad82edbd3354',
    contentHash: '1ff6661a9cb31b3028f8218dcb53aaadedce5cec689295cc4cea315200ce6f49',
  },
} as const

const BOUNDARIES = {
  adventure: [
    { kind: 'intro', marker: 'Cuenca (España) desde el terreno: lo que el expediente sostiene y lo que no' },
    { kind: 'overview', marker: 'El escenario: una ciudad colgada entre dos hoces' },
    { kind: 'highlights', marker: 'Puntos fuertes confirmados (lo que sí se puede tachar)' },
    { kind: 'route', marker: 'Naturaleza y actividad física: serranía, torcas y río' },
    { kind: 'practical', marker: 'Los huecos que no voy a rellenar' },
    { kind: 'risks', marker: 'Límite de perfil: vida cotidiana' },
  ],
  student: [
    { kind: 'intro', marker: '**Cuenca (España): historia, monumentos, cultura y vida cotidiana**' },
    { kind: 'overview', marker: '**2. Dónde está y qué la hace especial**' },
    { kind: 'study', marker: '**3. Historia y fechas**' },
    { kind: 'daily_life', marker: '**9. Población y vida cotidiana: aquí falta lo esencial**' },
    { kind: 'budget', marker: '**10. Lo que este expediente no responde**' },
    { kind: 'practical', marker: '**11. Cómo estudiar esta guía**' },
    { kind: 'risks', marker: '**Cierre**' },
  ],
} as const

type Profile = keyof typeof EXPECTED

const environment = readLocalSupabaseEnvironment()
const client = createClient(environment.url, environment.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})
const versioning = new SupabaseRealEditorialLibraryVersioningRepository(client)
const drafts = new RealEditorialLibraryVersionDraftApplicationService(versioning, versioning, versioning)
const decisions = new RealEditorialLibraryVersioningService(versioning)
const entries = await new SupabaseRealEditorialPilotRepository(client)
  .listLibraryEntries({ destination: 'Cuenca', origin: 'real_editorial_pilot' })

const created = await Promise.all((['adventure', 'student'] as const).map(profile => createTechnicalVersion(profile)))
for (const item of created) await approveTechnicalVersion(item.profile, item.versionId)

const approved = await Promise.all((['adventure', 'student'] as const).map(async profile => {
  const current = await versioning.getCurrentApprovedVersion(EXPECTED[profile].libraryEntryId)
  const entry = entries.find(candidate => candidate.entryId === EXPECTED[profile].libraryEntryId)
  if (!entry) throw new Error(`Falta la entrada de Biblioteca ${profile}`)
  assertV2StructuralSemanticEquivalence(
    (await versioning.getVersionDetail(EXPECTED[profile].versionId)).currentRevision.content,
    current.content,
  )
  projectLibraryEntryToTrawelEditorialProfile({ entry, currentApproved: current }, {
    sourceMappingId: 'zone:espana:cuenca', canonicalDestinationId: 'investighost:zone:espana:cuenca',
    entityType: 'zone', entitySlug: 'cuenca', countrySlug: 'espana', zoneSlug: 'cuenca',
  })
  return { profile, entry, current }
}))

const handoff = prepareTrawelEditorialDeliveryV2({
  target: {
    sourceMappingId: 'zone:espana:cuenca', canonicalDestinationId: 'investighost:zone:espana:cuenca',
    entityType: 'zone', entitySlug: 'cuenca', countrySlug: 'espana', zoneSlug: 'cuenca',
  },
  sources: approved.map(item => ({ entry: item.entry, currentApproved: item.current })) as [
    LibraryTrawelApprovedSource, LibraryTrawelApprovedSource,
  ],
})

console.log(JSON.stringify({
  operation: 'cuenca_v2_technical_structural_normalization',
  semanticEquivalence: 'PASS',
  projector: Object.fromEntries(approved.map(item => [item.profile, 'PASS'])),
  approved: approved.map(item => ({
    profile: item.profile, libraryEntryId: item.current.libraryEntryId, versionId: item.current.versionId,
    revisionId: item.current.revisionId, approvalDecisionId: item.current.approvalDecisionId,
    versionHash: item.current.versionHash, contentHash: item.current.contentHash,
    publicationState: item.current.publicationState,
  })),
  handoff: { mappingId: handoff.mappingId, canonicalDestinationId: handoff.canonicalDestinationId,
    handoffKey: handoff.handoffKey, payloadFingerprint: handoff.payloadFingerprint },
}, null, 2))

async function createTechnicalVersion(profile: Profile): Promise<{ profile: Profile; versionId: string }> {
  const expected = EXPECTED[profile]
  const detail = await versioning.getVersionDetail(expected.versionId)
  if (
    detail.currentRevision.id !== expected.revisionId
    || detail.version.versionHash !== expected.versionHash
    || detail.currentRevision.contentHash !== expected.contentHash
    || detail.state.effectiveState !== 'approved'
  ) throw new Error(`La base aprobada de ${profile} no coincide con el contrato 055`)

  const content = normalizeApprovedContentForV2(detail.currentRevision.content, BOUNDARIES[profile])
  assertV2StructuralSemanticEquivalence(detail.currentRevision.content, content)
  const expectedHeadHash = detail.decisions.at(-1)?.decisionTargetHash
  if (!expectedHeadHash) throw new Error(`Falta el token de cabecera aprobado para ${profile}`)
  const result = await drafts.createDraft({
    libraryEntryId: expected.libraryEntryId,
    expectedHeadHash,
    title: detail.currentRevision.title,
    content,
    changeSummary: 'technical_structural_normalization_for_v2: delimitadores Markdown canónicos sin modificación semántica.',
    actorId: MANUAL_LOCAL_ACTOR_ID,
    operationKey: key(`investighost:055:cuenca:${profile}:technical_structural_normalization_for_v2:v1`),
  })
  if (result.status !== 'ok') throw new Error(`No se pudo crear la versión técnica ${profile}: ${result.code}`)
  return { profile, versionId: result.version.versionId }
}

async function approveTechnicalVersion(profile: Profile, versionId: string): Promise<void> {
  let detail = await versioning.getVersionDetail(versionId)
  if (detail.state.effectiveState === 'approved') return
  if (detail.state.effectiveState !== 'draft') throw new Error(`La versión técnica ${profile} no está en draft`)

  for (const item of (await versioning.getEffectiveVersionFindings(versionId, detail.currentRevision.id)).items) {
    if (!item.isBaseline) continue
    const state = await versioning.getVersionStateSnapshot(versionId)
    const reconciled = await decisions.reconcileFindings({
      versionId, revisionId: detail.currentRevision.id, expectedState: 'draft',
      expectedRevisionHash: detail.currentRevision.revisionHash,
      expectedTraceabilityHash: state.traceabilityHash,
      finding: {
        findingKey: item.findingKey, sourceFindingType: item.sourceFindingType, sourceFindingId: item.sourceFindingId,
        origin: item.origin, disposition: 'accepted_risk', claimRelation: item.claimRelation,
        supportStatus: item.supportStatus, subjectText: item.subjectText, diffAnchor: null,
        claimIds: item.claimIds, evidenceReferences: item.evidenceReferences, sourceIds: item.sourceIds,
        editorDeclaration: 'technical_structural_normalization_for_v2: trazabilidad heredada sin cambio semántico.',
        justification: 'La equivalencia determinista preserva el contenido aprobado; solo se añaden delimitadores estructurales V2.',
      },
      createdByActorId: MANUAL_LOCAL_ACTOR_ID,
      operationKey: key(`investighost:055:cuenca:${profile}:reconcile:${item.findingKey}`),
    })
    if (reconciled.status !== 'ok') throw new Error(`No se pudo reconciliar ${profile}/${item.findingKey}`)
  }

  detail = await versioning.getVersionDetail(versionId)
  const beforeSubmit = await versioning.getVersionStateSnapshot(versionId)
  const submitted = await decisions.submitForReview({
    versionId, revisionId: detail.currentRevision.id, expectedState: 'draft',
    expectedRevisionHash: detail.currentRevision.revisionHash,
    expectedTraceabilityHash: beforeSubmit.traceabilityHash,
    reason: 'technical_structural_normalization_for_v2: equivalencia semántica determinista y proyección local V2 confirmadas.',
    actorId: MANUAL_LOCAL_ACTOR_ID,
    operationKey: key(`investighost:055:cuenca:${profile}:submit:v1`),
  })
  if (submitted.status !== 'ok') throw new Error(`No se pudo enviar ${profile} a aprobación técnica`)

  const review = await versioning.getVersionStateSnapshot(versionId)
  if (!review.aggregateHash) throw new Error(`Falta el hash de decisión para ${profile}`)
  const acceptedRiskFindingKeys = (await versioning.getEffectiveVersionFindings(versionId, detail.currentRevision.id))
    .items.map(item => item.findingKey).sort()
  const decision = await decisions.decideVersion({
    versionId, revisionId: detail.currentRevision.id, decisionType: 'approve',
    expectedPreviousState: 'ready_for_review', expectedDecisionTargetHash: review.aggregateHash,
    reason: 'technical_structural_normalization_for_v2 aprobada: no cambia el contenido semántico y habilita exclusivamente la proyección V2.',
    actorId: MANUAL_LOCAL_ACTOR_ID, affectedFindingKeys: [], changeInstructions: [], acceptedRiskFindingKeys,
    separationOfDutiesException: true,
    separationOfDutiesReason: 'Operador local autorizado aprueba la transformación técnica tras equivalencia determinista y proyección V2 local.',
    operationKey: key(`investighost:055:cuenca:${profile}:approve:v1`),
  })
  if (decision.status !== 'ok') throw new Error(`No se pudo aprobar técnicamente ${profile}`)
}

function key(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function readLocalSupabaseEnvironment(): { url: string; serviceRoleKey: string } {
  const output = execSync('npx supabase status -o env', {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  })
  const apiUrl = output.match(/^API_URL="?([^\r\n"]+)/m)?.[1]
  const serviceRoleKey = output.match(/^SERVICE_ROLE_KEY="?([^\r\n"]+)/m)?.[1]
  if (!apiUrl || !serviceRoleKey) throw new Error('Supabase local no expuso credenciales de servicio')
  return { url: apiUrl, serviceRoleKey }
}
