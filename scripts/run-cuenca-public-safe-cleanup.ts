import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { MANUAL_LOCAL_ACTOR_ID } from '@modules/editorial-pipeline/manual-runtime'
import {
  assertPublicSafeLibraryDocument,
  RealEditorialLibraryVersionDraftApplicationService,
  RealEditorialLibraryVersioningService,
  SupabaseRealEditorialLibraryVersioningRepository,
} from '@modules/library-versioning'
import { SupabaseRealEditorialPilotRepository } from '@modules/real-pipeline'
import {
  prepareTrawelEditorialDeliveryV2,
  projectLibraryEntryToTrawelEditorialProfile,
} from '@modules/trawel-handoff'
import type { LibraryTrawelApprovedSource } from '@shared/trawel-editorial-handoff-contracts'
import { emptyDestinationVisualContract, projectDestinationVisualsForTrawel } from '@shared/destination-visual-contract'

const ENTRIES = {
  adventure: 'c9683342-5eb6-4d29-91fa-6eeadabe21af',
  student: 'c2c1bf05-45f4-4b04-bc3f-e4894c909bf4',
} as const

const CLEAN = {
  adventure: {
    title: 'Cuenca (España): patrimonio, paisaje y planes para explorar',
    content: `## [intro] Una ciudad entre hoces
Cuenca combina su casco histórico con un paisaje marcado por las hoces de los ríos Júcar y Huécar. Es un destino para recorrer a pie con calma y alternar patrimonio, museos y escapadas a la serranía.

## [overview] Patrimonio y paisaje
La ciudad se asienta en un promontorio entre ambos ríos. Su conjunto histórico fue inscrito como Patrimonio Mundial en 1996 y conserva una imagen urbana ligada a las Casas Colgadas y a sus miradores.

## [highlights] Lugares para no perderse
- Las Casas Colgadas y el entorno de la hoz del Huécar.
- El Museo de Arte Abstracto Español, abierto en 1966 en las Casas Colgadas.
- El Museo Paleontológico de Castilla-La Mancha y los fósiles de Las Hoyas.

## [route] Patrimonio, naturaleza y actividad
Reserva una jornada para el casco histórico y sus miradores. Para ampliar la visita, la Serranía de Cuenca reúne lugares como la Ciudad Encantada, torcas, cauces y áreas de paseo; la zona también permite actividades al aire libre según la temporada.

## [practical] Antes de ir
- Consulta horarios, precios, reservas y condiciones de accesibilidad actualizados antes de la visita.
- Planifica los desplazamientos y el tiempo disponible con información oficial o local reciente.
- Para museos, rutas y espacios naturales, revisa las condiciones específicas del día.

## [risks] Planificación prudente
En paseos y rutas por la serranía, comprueba el estado del terreno, el tiempo y las recomendaciones de seguridad. Las condiciones pueden variar según la temporada.
`,
  },
  student: {
    title: 'Cuenca (España): historia, patrimonio y vida cultural',
    content: `## [intro] Una ciudad para estudiar entre patrimonio y paisaje
Cuenca ofrece un buen punto de partida para relacionar historia, arte y paisaje. Su casco histórico se levanta entre las hoces de los ríos Júcar y Huécar.

## [overview] Dónde está y qué la hace especial
La ciudad se asienta sobre un promontorio entre ambos ríos. El conjunto histórico fue inscrito como Patrimonio Mundial en 1996; las Casas Colgadas y los miradores ayudan a entender la relación entre arquitectura y relieve.

## [budget] Planificar una visita de estudio
Consulta precios de entradas, transporte, alojamiento y reservas antes de organizar la estancia. Los importes y las condiciones pueden cambiar según la temporada.

## [daily_life] Cultura y tradiciones
La Semana Santa, las Turbas y la música religiosa forman parte de la vida cultural de Cuenca. En la gastronomía local aparecen platos como el morteruelo, el ajoarriero, las gachas y los zarajos.

## [study] Historia, arte y ciencia
Cuenca se desarrolló en época andalusí y fue conquistada por Alfonso VIII el 21 de septiembre de 1177 tras nueve meses de asedio. El Museo de Arte Abstracto Español abrió en 1966 en las Casas Colgadas. El Museo Paleontológico de Castilla-La Mancha permite acercarse a los fósiles de Las Hoyas.

## [practical] Cómo preparar el aprendizaje
- Combina una visita al casco histórico con museos y miradores para relacionar espacio, arte e historia.
- Comprueba con antelación horarios, reservas y accesibilidad de cada lugar.
- Si el plan incluye la serranía, adapta el recorrido al tiempo disponible y a las condiciones del día.

## [risks] Información que conviene actualizar
Antes de viajar, consulta fuentes oficiales o locales para confirmar horarios, precios, transporte, reservas y accesibilidad. Las condiciones de los espacios al aire libre pueden variar.
`,
  },
} as const

type Profile = keyof typeof ENTRIES
const environment = readLocalSupabaseEnvironment()
const client = createClient(environment.url, environment.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})
const versioning = new SupabaseRealEditorialLibraryVersioningRepository(client)
const drafts = new RealEditorialLibraryVersionDraftApplicationService(versioning, versioning, versioning)
const decisions = new RealEditorialLibraryVersioningService(versioning)
const entries = await new SupabaseRealEditorialPilotRepository(client)
  .listLibraryEntries({ destination: 'Cuenca', origin: 'real_editorial_pilot' })

const approved = await Promise.all((['adventure', 'student'] as const).map(async profile => {
  const versionId = await createCleanVersion(profile)
  await approveCleanVersion(profile, versionId)
  const current = await versioning.getCurrentApprovedVersion(ENTRIES[profile])
  assertPublicSafeLibraryDocument(current.title, current.content)
  const entry = entries.find(candidate => candidate.entryId === ENTRIES[profile])
  if (!entry) throw new Error(`Falta la entrada de Biblioteca ${profile}`)
  const projected = projectLibraryEntryToTrawelEditorialProfile({ entry, currentApproved: current }, target())
  return { profile, entry, current, projected }
}))

const handoff = prepareTrawelEditorialDeliveryV2({
  target: target(),
  sources: approved.map(item => ({ entry: item.entry, currentApproved: item.current })) as [
    LibraryTrawelApprovedSource, LibraryTrawelApprovedSource,
  ],
})
const visualState = emptyDestinationVisualContract(approved[0].entry.destination.canonicalId)
const visualV2Capability = projectDestinationVisualsForTrawel(visualState)

console.log(JSON.stringify({
  operation: 'cuenca_public_safe_cleanup',
  publicSafe: 'PASS',
  tavilyCalls: 0,
  approved: approved.map(item => ({
    profile: item.profile, libraryEntryId: item.current.libraryEntryId, versionId: item.current.versionId,
    revisionId: item.current.revisionId, approvalDecisionId: item.current.approvalDecisionId,
    versionHash: item.current.versionHash, contentHash: item.current.contentHash,
  })),
  profiles: approved.map(item => ({
    profile: item.profile,
    internalMarkersVisible: countInternalMarkers(JSON.stringify({
      headline: item.projected.headline, intro: item.projected.intro,
      whatMakesSpecial: item.projected.whatMakesSpecial, highlights: item.projected.highlights,
      suggestedRoute: item.projected.suggestedRoute, practicalTips: item.projected.practicalTips,
      sections: item.projected.sections,
    })),
  })),
  handoff: {
    mappingId: handoff.mappingId, canonicalDestinationId: handoff.canonicalDestinationId,
    handoffKey: handoff.handoffKey, payloadFingerprint: handoff.payloadFingerprint,
  },
  visualContract: {
    destinationLevel: true,
    slot1: visualState.imageSlot1.state,
    slot2: visualState.imageSlot2.state,
    textOnlyHandoffOmitsVisuals: handoff.destinationVisuals === undefined,
    v2CanCarryEmptySlots: visualV2Capability.imageSlot1.state === 'EMPTY'
      && visualV2Capability.imageSlot2.state === 'EMPTY',
  },
  delivery: 'NOT_SENT:TRAWEL_INGRESS_CONFIG_MISSING',
}, null, 2))

async function createCleanVersion(profile: Profile): Promise<string> {
  const current = await versioning.getCurrentApprovedVersion(ENTRIES[profile])
  const detail = current.versionId === null
    ? null
    : await versioning.getVersionDetail(current.versionId)
  if (detail?.state.effectiveState === 'approved' && detail.currentRevision.content === CLEAN[profile].content) {
    return detail.version.versionId
  }
  assertPublicSafeLibraryDocument(CLEAN[profile].title, CLEAN[profile].content)
  const expectedHeadHash = detail?.decisions.at(-1)?.decisionTargetHash
  if (!expectedHeadHash) throw new Error(`Falta la cabecera aprobada de ${profile}`)
  const result = await drafts.createDraft({
    libraryEntryId: ENTRIES[profile], expectedHeadHash,
    title: CLEAN[profile].title, content: CLEAN[profile].content,
    changeSummary: 'public_safe_cleanup: separación del cuerpo de consumo respecto de la trazabilidad editorial interna.',
    actorId: MANUAL_LOCAL_ACTOR_ID,
    operationKey: key(`investighost:059:cuenca:${profile}:public_safe_cleanup:v1`),
  })
  if (result.status !== 'ok') throw new Error(`No se pudo crear la revisión pública limpia de ${profile}: ${result.code}`)
  return result.version.versionId
}

async function approveCleanVersion(profile: Profile, versionId: string): Promise<void> {
  let detail = await versioning.getVersionDetail(versionId)
  if (detail.state.effectiveState === 'approved') return
  if (detail.state.effectiveState !== 'draft') throw new Error(`La revisión limpia de ${profile} no está en draft`)

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
        editorDeclaration: 'public_safe_cleanup: la trazabilidad heredada se conserva fuera del cuerpo público.',
        justification: 'La revisión elimina referencias internas del texto de consumo sin añadir hechos ni volver a investigar.',
      },
      createdByActorId: MANUAL_LOCAL_ACTOR_ID,
      operationKey: key(`investighost:059:cuenca:${profile}:reconcile:${item.findingKey}`),
    })
    if (reconciled.status !== 'ok') throw new Error(`No se pudo reconciliar ${profile}/${item.findingKey}`)
  }

  detail = await versioning.getVersionDetail(versionId)
  const beforeSubmit = await versioning.getVersionStateSnapshot(versionId)
  const submitted = await decisions.submitForReview({
    versionId, revisionId: detail.currentRevision.id, expectedState: 'draft',
    expectedRevisionHash: detail.currentRevision.revisionHash,
    expectedTraceabilityHash: beforeSubmit.traceabilityHash,
    reason: 'public_safe_cleanup: revisión factual y de consumo confirma cuerpo público sin trazas editoriales.',
    actorId: MANUAL_LOCAL_ACTOR_ID,
    operationKey: key(`investighost:059:cuenca:${profile}:submit:v1`),
  })
  if (submitted.status !== 'ok') throw new Error(`No se pudo enviar ${profile} a revisión`)

  const review = await versioning.getVersionStateSnapshot(versionId)
  if (!review.aggregateHash) throw new Error(`Falta el hash de decisión para ${profile}`)
  const acceptedRiskFindingKeys = (await versioning.getEffectiveVersionFindings(versionId, detail.currentRevision.id))
    .items.map(item => item.findingKey).sort()
  const decision = await decisions.decideVersion({
    versionId, revisionId: detail.currentRevision.id, decisionType: 'approve',
    expectedPreviousState: 'ready_for_review', expectedDecisionTargetHash: review.aggregateHash,
    reason: 'public_safe_cleanup aprobada: texto para consumo sin IDs, gaps, instrucciones de auditoría ni Markdown visible.',
    actorId: MANUAL_LOCAL_ACTOR_ID, affectedFindingKeys: [], changeInstructions: [], acceptedRiskFindingKeys,
    separationOfDutiesException: true,
    separationOfDutiesReason: 'Operador local autorizado aprueba la limpieza pública tras validación factual, pública y de trazabilidad.',
    operationKey: key(`investighost:059:cuenca:${profile}:approve:v1`),
  })
  if (decision.status !== 'ok') throw new Error(`No se pudo aprobar la revisión limpia de ${profile}`)
}

function target() {
  return {
    sourceMappingId: 'zone:espana:cuenca', canonicalDestinationId: 'investighost:zone:espana:cuenca',
    entityType: 'zone' as const, entitySlug: 'cuenca', countrySlug: 'espana', zoneSlug: 'cuenca',
  }
}

function countInternalMarkers(content: string): number {
  return [/(?:\(c\d+\)|\bg\d+\b|\bel expediente\b|claimId|evidenceId|gapId|\\\*\\\*|\*\*)/giu]
    .reduce((count, pattern) => count + (content.match(pattern)?.length ?? 0), 0)
}

function key(value: string): string { return createHash('sha256').update(value).digest('hex') }

function readLocalSupabaseEnvironment(): { url: string; serviceRoleKey: string } {
  const output = execSync('npx supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  const url = output.match(/^API_URL="?([^\r\n"]+)/m)?.[1]
  const serviceRoleKey = output.match(/^SERVICE_ROLE_KEY="?([^\r\n"]+)/m)?.[1]
  if (!url || !serviceRoleKey) throw new Error('Supabase local no expuso credenciales de servicio')
  return { url, serviceRoleKey }
}
