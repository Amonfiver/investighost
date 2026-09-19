import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { MANUAL_LOCAL_ACTOR_ID } from '@modules/editorial-pipeline/manual-runtime'
import {
  assertContentNotTooThin,
  assertProfilesDifferentiated,
  assertPublicSafeLibraryDocument,
  assertReadableAndScannable,
  assertStudentCanonicalProfile,
  RealEditorialLibraryVersionDraftApplicationService,
  RealEditorialLibraryVersioningService,
  SupabaseRealEditorialLibraryVersioningRepository,
} from '@modules/library-versioning'
import { SupabaseRealEditorialPilotRepository } from '@modules/real-pipeline'
import { prepareTrawelEditorialDeliveryV2 } from '@modules/trawel-handoff'
import type { LibraryTrawelApprovedSource } from '@shared/trawel-editorial-handoff-contracts'
import { emptyDestinationVisualContract } from '@shared/destination-visual-contract'

const ENTRIES = { adventure: 'c9683342-5eb6-4d29-91fa-6eeadabe21af', student: 'c2c1bf05-45f4-4b04-bc3f-e4894c909bf4' } as const
const ADVENTURE_VERSION = 'bfba66d3-b26b-4524-9ffe-7b376a3dc4a2'
const EVIDENCE = {
  validClaimCount: 11,
  thematicAreas: ['patrimonio', 'historia', 'paisaje', 'naturaleza', 'cultura', 'arte', 'paleontología'],
  namedPlaces: ['Casas Colgadas', 'puente de San Pablo', 'plaza Mayor', 'torre Mangana', 'arco de Bezudo', 'catedral de Santa María y San Julián', 'túnel de Alfonso VIII', 'Museo de Arte Abstracto Español', 'Serranía de Cuenca', 'Ciudad Encantada', 'torcas de Palancares y Tierra Muerta', 'El Hosquillo', 'Las Hoyas', 'Museo de Paleontología de Castilla-La Mancha'],
} as const

const STUDENT = {
  title: 'Cuenca (España): geografía, historia, patrimonio, arte y ciencia',
  content: `## [intro] Introducción
Cuenca, en España, se comprende a partir de una relación especialmente estrecha entre territorio y ciudad. Las hoces de los ríos Júcar y Huécar, la historia de su casco, los monumentos, el arte abstracto, la paleontología y las tradiciones forman un conjunto de temas conectados. Esta guía presenta esas relaciones como conocimiento y permite situar a Cuenca en la geografía, la historia y la cultura mediante un texto autónomo.

## [overview] 1. Geografía y paisaje
Las hoces del Júcar y del Huécar son valles encajados que dan a Cuenca una configuración urbana marcada por el relieve. La ciudad histórica no se entiende como un núcleo aislado: su forma y su imagen están vinculadas a esos cursos de agua y a las paredes rocosas del entorno. Por eso, el reconocimiento de 1996 como Ciudad Patrimonio de la Humanidad abarca el casco histórico y su paisaje natural cercano.

La Serranía de Cuenca prolonga esta relación entre terreno y asentamiento humano. Ciudad Encantada, las torcas de Palancares y Tierra Muerta, El Hosquillo y los ríos permiten reconocer un territorio donde roca, agua, bosque y relieve constituyen temas geográficos distintos pero relacionados.

## [history] 2. Historia
Cuenca fue fundada bajo dominio islámico. Un momento decisivo fue la conquista por Alfonso VIII el 21 de septiembre de 1177, tras nueve meses de asedio. Este hecho ayuda a ordenar una historia en la que el origen de la ciudad y su incorporación a un nuevo poder político explican parte de la memoria asociada al casco histórico.

El túnel de Alfonso VIII conserva ese nombre como referencia histórica. Junto con plaza Mayor, torre Mangana y arco de Bezudo, muestra cómo las ciudades mantienen vínculos entre acontecimientos, nombres y espacios. La historia de Cuenca no se reduce a una cronología: también queda expresada en los lugares que articulan su identidad urbana.

## [heritage] 3. Patrimonio y arquitectura
Las Casas Colgadas son el elemento más reconocible de Cuenca y expresan la relación entre arquitectura y relieve. El puente de San Pablo añade otro punto de conexión entre el casco y el paisaje de las hoces. Plaza Mayor y la catedral de Santa María y San Julián sitúan el peso de los espacios urbanos y religiosos dentro del conjunto histórico.

Torre Mangana, arco de Bezudo y túnel de Alfonso VIII completan un patrimonio formado por edificios, espacios públicos, pasos y referencias históricas. Su importancia no reside solo en la suma de monumentos: juntos permiten entender un casco histórico como una estructura en la que arquitectura, memoria y territorio se influyen mutuamente. La declaración de 1996 resume esa unidad entre ciudad histórica y entorno natural.

## [art_culture] 4. Arte y cultura
El Museo de Arte Abstracto Español abrió en 1966 en las Casas Colgadas. Esta coincidencia entre un edificio patrimonial y una institución dedicada al arte abstracto establece una conexión singular entre historia urbana y creación contemporánea. Fernando Zóbel, Gustavo Torner y Antonio Pérez están vinculados a la escena artística de Cuenca y permiten situar el museo dentro de un contexto cultural más amplio.

La relación entre las Casas Colgadas y el museo muestra que el patrimonio puede conservar usos culturales nuevos sin dejar de remitir a la historia del edificio. Así, el arte abstracto no aparece como un tema separado del casco: forma parte de una lectura en la que arquitectura, colección, artistas e institución se relacionan.

## [nature_science] 5. Naturaleza, geología y ciencia
Ciudad Encantada y las torcas de Palancares y Tierra Muerta se asocian a un paisaje de formas calizas. La Serranía, El Hosquillo y los ríos amplían el estudio del entorno hacia el agua, el bosque, la roca y la diversidad de formas del relieve. Estos elementos permiten explicar por qué la geografía física es una parte central de la identidad de Cuenca.

Las Hoyas añade una escala temporal distinta. Es un yacimiento del Cretácico inferior relacionado con fósiles de plantas, animales y Concavenator. El Museo de Paleontología de Castilla-La Mancha conecta yacimiento, fósil e institución científica. La paleontología muestra que el territorio de Cuenca también contiene información sobre formas de vida antiguas, y no solo sobre el paisaje actual.

## [daily_life] 6. Sociedad, tradiciones y vida cultural
Semana Santa, la procesión de las Turbas y la Semana de Música Religiosa son manifestaciones culturales asociadas a Cuenca. Reúnen tradición, música y espacios urbanos, y muestran que la cultura local incluye prácticas compartidas además de monumentos y museos.

Huertos, artesanía, barrios, restauración y celebraciones aparecen asimismo como referencias de la vida cultural. En conjunto, ayudan a comprender que la identidad de una ciudad se construye mediante patrimonio material, actividades sociales y tradiciones que se mantienen en el tiempo.

## [gastronomy] 7. Gastronomía
Ajoarriero, morteruelo, pisto y resolí son referencias de la gastronomía tradicional de Cuenca. Su valor educativo consiste en incorporarlos al contexto cultural: la cocina, igual que las fiestas o la artesanía, participa en la forma en que una comunidad reconoce y transmite elementos de identidad local.

## [budget] 8. Datos y conceptos clave
- **1177:** conquista de Cuenca por Alfonso VIII el 21 de septiembre, tras nueve meses de asedio.
- **1966:** apertura del Museo de Arte Abstracto Español en las Casas Colgadas.
- **1996:** reconocimiento del casco histórico y su paisaje natural cercano como Ciudad Patrimonio de la Humanidad.
- **Hoces:** los valles encajados de los ríos Júcar y Huécar explican la relación entre relieve y ciudad.
- **Cretácico inferior:** periodo asociado a Las Hoyas, sus fósiles y Concavenator.
- **Fernando Zóbel, Gustavo Torner y Antonio Pérez:** nombres vinculados a la cultura artística de Cuenca.

## [practical] 9. Relaciones para comprender Cuenca
- Geografía y ciudad: las hoces ayudan a explicar la configuración del casco histórico.
- Historia y patrimonio: 1177 aporta contexto a nombres, espacios y memoria urbana.
- Patrimonio y arte: las Casas Colgadas relacionan arquitectura histórica y Museo de Arte Abstracto Español.
- Naturaleza y ciencia: Serranía, formas calizas, Las Hoyas y el Museo de Paleontología conectan territorio y conocimiento científico.
- Sociedad y cultura: música religiosa, Turbas, Semana Santa y gastronomía sitúan las tradiciones dentro de la identidad local.

## [study] 10. Preguntas para aprender
¿Cómo condicionan las hoces del Júcar y del Huécar la relación entre Cuenca y su entorno? ¿Qué aporta la conquista de 1177 para comprender el patrimonio y la memoria de la ciudad? ¿Por qué las Casas Colgadas permiten relacionar relieve, arquitectura y arte abstracto?

¿Qué diferencia existe entre estudiar un paisaje de formas calizas y estudiar los fósiles de Las Hoyas? ¿Cómo conecta el Museo de Paleontología el Cretácico inferior con el conocimiento actual? ¿Qué pueden expresar Semana Santa, las Turbas, la música religiosa y la gastronomía sobre la cultura local?

Estas preguntas organizan una comprensión transversal: geografía, historia, arquitectura, arte, ciencia y tradiciones no son categorías aisladas, sino dimensiones que se explican entre sí.

Las respuestas pueden ordenarse en una red de conceptos. El relieve aporta el marco geográfico; 1177 aporta un eje histórico; los monumentos traducen esa historia en patrimonio; el museo vincula arquitectura y arte; Las Hoyas une territorio y paleontología; y las tradiciones incorporan una dimensión social. Esta organización permite distinguir cada tema sin perder las conexiones que hacen significativa a Cuenca.

También evita oposiciones falsas entre ciudad y naturaleza. El casco histórico depende de un paisaje concreto, y la ciencia paleontológica amplía esa lectura hacia un pasado mucho más antiguo. Cultura y gastronomía completan el marco al mostrar que la identidad local incluye prácticas colectivas, además de edificios, fechas y colecciones.

## [risks] Matices de interpretación
Cuenca reúne elementos de épocas y ámbitos muy distintos: una historia vinculada al dominio islámico y a 1177, patrimonio urbano, arte abstracto, paisaje calizo, paleontología y tradiciones religiosas. Una explicación completa evita reducirla a una sola imagen, a un único monumento o a una sola disciplina. La relación entre esos temas es precisamente una de las claves para comprender el lugar.
`,
} as const

const environment = readLocalSupabaseEnvironment()
const client = createClient(environment.url, environment.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
const versioning = new SupabaseRealEditorialLibraryVersioningRepository(client)
const drafts = new RealEditorialLibraryVersionDraftApplicationService(versioning, versioning, versioning)
const decisions = new RealEditorialLibraryVersioningService(versioning)
const entries = await new SupabaseRealEditorialPilotRepository(client).listLibraryEntries({ destination: 'Cuenca', origin: 'real_editorial_pilot' })
const adventureBefore = await versioning.getCurrentApprovedVersion(ENTRIES.adventure)
assertAdventureUnchanged(adventureBefore)
const depth = assertContentNotTooThin({ profile: 'student', ...STUDENT, evidence: EVIDENCE, sourceLimited: false })
const readability = assertReadableAndScannable({ profile: 'student', ...STUDENT })
const canonical = assertStudentCanonicalProfile({ ...STUDENT, evidence: EVIDENCE, sourceLimited: false })

const versionId = await createStudentVersion()
await approveStudentVersion(versionId)
const adventureAfter = await versioning.getCurrentApprovedVersion(ENTRIES.adventure)
assertAdventureUnchanged(adventureAfter)
const student = await versioning.getCurrentApprovedVersion(ENTRIES.student)
assertPublicSafeLibraryDocument(student.title, student.content)
assertProfilesDifferentiated({ title: adventureAfter.title, content: adventureAfter.content }, { title: student.title, content: student.content })
const adventureEntry = entries.find(entry => entry.entryId === ENTRIES.adventure)
const studentEntry = entries.find(entry => entry.entryId === ENTRIES.student)
if (!adventureEntry || !studentEntry) throw new Error('Faltan entradas de Biblioteca Cuenca')
const handoff = prepareTrawelEditorialDeliveryV2({ target: target(), sources: [{ entry: adventureEntry, currentApproved: adventureAfter }, { entry: studentEntry, currentApproved: student }] as [LibraryTrawelApprovedSource, LibraryTrawelApprovedSource] })
const visual = emptyDestinationVisualContract(adventureEntry.destination.canonicalId)

console.log(JSON.stringify({
  operation: 'cuenca_student_canonical_069',
  adventureUnchanged: true,
  gates: { publicSafe: 'PASS', contentTooThin: 'NO', readability: 'PASS', scannability: 'PASS', studentDepth: 'PASS', studentEducationalValue: 'PASS', studentNonTravel: 'PASS', studentInformationalValue: 'PASS', studentEducationalStructure: 'PASS', profileDifferentiation: 'PASS' },
  student: { wordCount: depth.wordCount, sections: 12, topicsDeveloped: depth.developedThemes, thematicCoverage: canonical.thematicCoverage, namedPlaceCoverage: canonical.namedPlaceCoverage, datesUsed: canonical.datesUsed, questionsIncluded: canonical.questionsIncluded, paragraphCount: readability.paragraphCount, longParagraphCount: readability.longParagraphCount, travelLanguage: canonical.travelLanguage, rawInternalMarkersVisible: internalMarkers(student.content), markdownEscapedVisible: /\\(?:\*|_|`|\[|\]|#)/u.test(student.content) },
  approval: { libraryEntryId: student.libraryEntryId, versionId: student.versionId, revisionId: student.revisionId, approvalDecisionId: student.approvalDecisionId, versionHash: student.versionHash, contentHash: student.contentHash },
  handoff: { ready: true, handoffKey: handoff.handoffKey, payloadFingerprint: handoff.payloadFingerprint },
  visual: { imageSlot1: visual.imageSlot1.state, imageSlot2: visual.imageSlot2.state },
  cost: { tavily: 0, openai: 0, deepseek: 0, total: 0, phases: [{ phase: 'student_canonical_rewrite_from_durable_evidence', provider: 'none', model: 'none', inputTokens: 0, outputTokens: 0, cost: 0 }] },
}, null, 2))

async function createStudentVersion(): Promise<string> {
  const current = await versioning.getCurrentApprovedVersion(ENTRIES.student)
  const detail = await versioning.getVersionDetail(current.versionId!)
  if (detail.state.effectiveState === 'approved' && detail.currentRevision.title === STUDENT.title && detail.currentRevision.content.trimEnd() === STUDENT.content.trimEnd()) return detail.version.versionId
  const expectedHeadHash = detail.decisions.at(-1)?.decisionTargetHash
  if (!expectedHeadHash) throw new Error('Falta cabecera aprobada Student')
  const result = await drafts.createDraft({ libraryEntryId: ENTRIES.student, expectedHeadHash, title: STUDENT.title, content: STUDENT.content, changeSummary: 'student_canonical_069: convierte Student en un perfil explicativo, educativo y no turístico basado en investigación durable.', actorId: MANUAL_LOCAL_ACTOR_ID, operationKey: key('investighost:069:cuenca:student:canonical:v1') })
  if (result.status !== 'ok') throw new Error(`No se pudo crear Student: ${result.code}`)
  return result.version.versionId
}

async function approveStudentVersion(versionId: string): Promise<void> {
  let detail = await versioning.getVersionDetail(versionId)
  if (detail.state.effectiveState === 'approved') return
  if (detail.state.effectiveState !== 'draft') throw new Error('Student no está en draft')
  for (const item of (await versioning.getEffectiveVersionFindings(versionId, detail.currentRevision.id)).items) {
    if (!item.isBaseline) continue
    const state = await versioning.getVersionStateSnapshot(versionId)
    const reconciled = await decisions.reconcileFindings({ versionId, revisionId: detail.currentRevision.id, expectedState: 'draft', expectedRevisionHash: detail.currentRevision.revisionHash, expectedTraceabilityHash: state.traceabilityHash, finding: { findingKey: item.findingKey, sourceFindingType: item.sourceFindingType, sourceFindingId: item.sourceFindingId, origin: item.origin, disposition: 'accepted_risk', claimRelation: item.claimRelation, supportStatus: item.supportStatus, subjectText: item.subjectText, diffAnchor: null, claimIds: item.claimIds, evidenceReferences: item.evidenceReferences, sourceIds: item.sourceIds, editorDeclaration: 'student_canonical_069: la trazabilidad se conserva fuera del texto público.', justification: 'La revisión reordena hechos ya aprobados como conocimiento educativo, sin investigación nueva ni contenido turístico.' }, createdByActorId: MANUAL_LOCAL_ACTOR_ID, operationKey: key(`investighost:069:cuenca:student:reconcile:${item.findingKey}`) })
    if (reconciled.status !== 'ok') throw new Error(`No se pudo reconciliar Student/${item.findingKey}`)
  }
  detail = await versioning.getVersionDetail(versionId)
  const state = await versioning.getVersionStateSnapshot(versionId)
  const submitted = await decisions.submitForReview({ versionId, revisionId: detail.currentRevision.id, expectedState: 'draft', expectedRevisionHash: detail.currentRevision.revisionHash, expectedTraceabilityHash: state.traceabilityHash, reason: 'student_canonical_069: perfil educativo, informativo, no turístico y público.', actorId: MANUAL_LOCAL_ACTOR_ID, operationKey: key('investighost:069:cuenca:student:submit:v1') })
  if (submitted.status !== 'ok') throw new Error('No se pudo enviar Student a revisión')
  const review = await versioning.getVersionStateSnapshot(versionId)
  if (!review.aggregateHash) throw new Error('Falta hash de decisión Student')
  const acceptedRiskFindingKeys = (await versioning.getEffectiveVersionFindings(versionId, detail.currentRevision.id)).items.map(item => item.findingKey).sort()
  const decision = await decisions.decideVersion({ versionId, revisionId: detail.currentRevision.id, decisionType: 'approve', expectedPreviousState: 'ready_for_review', expectedDecisionTargetHash: review.aggregateHash, reason: 'student_canonical_069 aprobada: explica Cuenca como conocimiento, sin planificación de viaje.', actorId: MANUAL_LOCAL_ACTOR_ID, affectedFindingKeys: [], changeInstructions: [], acceptedRiskFindingKeys, separationOfDutiesException: true, separationOfDutiesReason: 'Operador local autorizado aprueba Student tras validar política no turística, valor informativo, estructura educativa y seguridad pública.', operationKey: key('investighost:069:cuenca:student:approve:v1') })
  if (decision.status !== 'ok') throw new Error('No se pudo aprobar Student')
}

function assertAdventureUnchanged(current: { versionId: string | null }): void { if (current.versionId !== ADVENTURE_VERSION) throw new Error('Adventure cambió') }
function target() { return { sourceMappingId: 'zone:espana:cuenca', canonicalDestinationId: 'investighost:zone:espana:cuenca', entityType: 'zone' as const, entitySlug: 'cuenca', countrySlug: 'espana', zoneSlug: 'cuenca' } }
function key(value: string): string { return createHash('sha256').update(value).digest('hex') }
function internalMarkers(content: string): number { return content.match(/(?:\(c\d+\)|\bg\d+\b|\b(?:expediente|dossier)\b|claimId|evidenceId|gapId)/giu)?.length ?? 0 }
function readLocalSupabaseEnvironment(): { url: string; serviceRoleKey: string } { const output = execSync('npx supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); const url = output.match(/^API_URL="?([^\r\n"]+)/m)?.[1]; const serviceRoleKey = output.match(/^SERVICE_ROLE_KEY="?([^\r\n"]+)/m)?.[1]; if (!url || !serviceRoleKey) throw new Error('Supabase local no expuso credenciales de servicio'); return { url, serviceRoleKey } }
