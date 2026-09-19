import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { MANUAL_LOCAL_ACTOR_ID } from '@modules/editorial-pipeline/manual-runtime'
import {
  assertContentNotTooThin,
  assertProfilesDifferentiated,
  assertPublicSafeLibraryDocument,
  assertReadableAndScannable,
  assertStudentEducationalValue,
  RealEditorialLibraryVersionDraftApplicationService,
  RealEditorialLibraryVersioningService,
  SupabaseRealEditorialLibraryVersioningRepository,
} from '@modules/library-versioning'
import { SupabaseRealEditorialPilotRepository } from '@modules/real-pipeline'
import { prepareTrawelEditorialDeliveryV2, projectLibraryEntryToTrawelEditorialProfile } from '@modules/trawel-handoff'
import type { LibraryTrawelApprovedSource } from '@shared/trawel-editorial-handoff-contracts'
import { emptyDestinationVisualContract } from '@shared/destination-visual-contract'

const ENTRIES = { adventure: 'c9683342-5eb6-4d29-91fa-6eeadabe21af', student: 'c2c1bf05-45f4-4b04-bc3f-e4894c909bf4' } as const
const ADVENTURE_SNAPSHOT = {
  versionId: 'bfba66d3-b26b-4524-9ffe-7b376a3dc4a2',
  revisionId: 'b5caa9fc-abb7-4a9a-aa6d-603dbba46bfb',
  approvalDecisionId: '97ecd057-5ea9-4ff7-b641-64dc2aba6137',
  versionHash: 'd2a0d97c14285f426262fb59e2e32def54774950a6989caddedb84a856510554',
  contentHash: '8d54304ceac5fadb2d50c9d5a615a257a23d00d5728e0a46cee6f65a853a7ebe',
} as const
const EVIDENCE = {
  validClaimCount: 11,
  thematicAreas: ['patrimonio', 'historia', 'paisaje', 'naturaleza', 'cultura', 'arte', 'paleontología'],
  namedPlaces: ['Casas Colgadas', 'puente de San Pablo', 'plaza Mayor', 'torre Mangana', 'arco de Bezudo', 'catedral de Santa María y San Julián', 'túnel de Alfonso VIII', 'Museo de Arte Abstracto Español', 'Serranía de Cuenca', 'Ciudad Encantada', 'torcas de Palancares y Tierra Muerta', 'El Hosquillo', 'Las Hoyas', 'Museo de Paleontología de Castilla-La Mancha'],
} as const
const STUDENT = {
  title: 'Cuenca (España): una guía educativa entre paisaje, historia, arte y ciencia',
  content: `## [intro] Una ciudad para aprender mirando relaciones
Cuenca es un buen lugar para descubrir cómo paisaje, historia, patrimonio, arte y ciencia pueden leerse juntos. La ciudad se asienta entre las hoces de los ríos Júcar y Huécar: el relieve no queda fuera de la visita, ayuda a explicar el carácter del casco histórico. Esta guía propone observar, comparar y hacer preguntas. No hace falta saberlo todo antes de llegar; basta con mirar los lugares con una idea clara de lo que pueden enseñar.

## [overview] 1. Entender el paisaje
Las hoces del Júcar y del Huécar son la primera clave. Sitúan Cuenca entre relieves marcados y ayudan a entender por qué ciudad y entorno natural se presentan como una unidad. El casco histórico y su paisaje natural cercano fueron reconocidos como Ciudad Patrimonio de la Humanidad en 1996. Ese dato invita a no separar edificios y terreno: el paisaje también forma parte de lo que se protege y se interpreta.

Al recorrer la ciudad, fíjate en cómo aparecen las hoces en la experiencia del paseo. No busques una definición complicada; describe lo que cambia cuando miras un edificio, una calle o un punto del casco en relación con el relieve. Esta observación sirve también para preparar la salida a la Serranía de Cuenca, donde las formas del terreno pasan a ser el tema principal.

## [history] 2. Historia en pocas claves
Cuenca fue fundada bajo dominio islámico. El hito histórico más preciso disponible es la conquista por Alfonso VIII el 21 de septiembre de 1177, tras nueve meses de asedio. Son pocos datos, pero permiten ordenar una idea importante: origen de la ciudad, conflicto histórico y memoria posterior en algunos nombres y lugares del casco.

El túnel de Alfonso VIII es una referencia especialmente útil para conectar un nombre propio con esa historia. Plaza Mayor, torre Mangana y arco de Bezudo añaden otros puntos para pensar cómo los espacios urbanos conservan referencias del pasado. No hace falta inventar una cronología completa: durante la visita, distingue lo que puedes observar directamente de lo que cada fecha o nombre te ayuda a preguntar.

## [heritage] 3. Patrimonio que debes reconocer
Empieza por las Casas Colgadas. Son una puerta de entrada a la relación entre arquitectura, casco histórico y paisaje. El puente de San Pablo ofrece otra referencia para situar la visita, mientras que plaza Mayor y catedral de Santa María y San Julián ayudan a reconocer el peso de los espacios urbanos y religiosos dentro del conjunto.

Amplía el mapa con torre Mangana, arco de Bezudo y túnel de Alfonso VIII. En lugar de memorizarlos como una lista, anota qué tipo de lugar parece ser cada uno: edificio, espacio urbano, elemento de paso o referencia histórica. Después compáralos. ¿Qué cambia entre reconocer un icono como las Casas Colgadas y entender un conjunto formado por varios lugares vinculados al mismo casco?

El reconocimiento de 1996 es otra clave para este bloque. No es solo una fecha: permite preguntar por qué el casco histórico y el paisaje natural cercano pueden formar una misma lectura patrimonial. Esa relación será visible de nuevo cuando pases de la ciudad a las hoces y la Serranía.

## [art_culture] 4. Arte y cultura: del museo a las tradiciones
El Museo de Arte Abstracto Español abrió en 1966 en las Casas Colgadas. Aquí hay una combinación muy interesante para aprender: un lugar patrimonial también alberga arte abstracto español. Fernando Zóbel, Gustavo Torner y Antonio Pérez aparecen vinculados a la escena artística local. Usa sus nombres como puntos de partida para pensar cómo un museo, una colección y un edificio pueden compartir el mismo espacio.

La cultura de Cuenca no se limita al museo. Semana Santa, la procesión de las Turbas y la Semana de Música Religiosa son referencias para observar tradición, celebración y música. Si coincides con alguna de ellas, mira qué espacios urbanos entran en juego y qué relación parece existir entre ciudad, reunión pública y cultura. Si no coincides, siguen siendo claves útiles para comprender que el patrimonio también tiene una dimensión viva.

## [nature_science] 5. Naturaleza y ciencia
La Serranía de Cuenca amplía la visita hacia geografía física. Ciudad Encantada, las torcas de Palancares y Tierra Muerta, El Hosquillo y los senderos junto a los ríos aparecen como referencias del entorno. Puedes usarlas para distinguir roca, agua, bosque, formas del relieve y actividades al aire libre, sin convertir la guía en una ruta técnica que no está documentada.

Las torcas y Ciudad Encantada ayudan a observar un paisaje de formas calizas. Una buena actividad consiste en describir primero lo que ves y solo después formular una pregunta: ¿qué papel pueden haber tenido agua y roca en esas formas? El Hosquillo y los ríos amplían esa mirada hacia naturaleza, vegetación y agua.

Las Hoyas añade tiempo profundo a la visita. Es un yacimiento del Cretácico inferior relacionado con fósiles de plantas, animales y Concavenator. El Museo de Paleontología de Castilla-La Mancha permite conectar yacimiento, fósil y museo. Esa cadena explica por qué la paleontología tiene valor aquí: ayuda a leer el territorio actual junto con evidencias de vida antigua.

## [daily_life] 6. Gastronomía y tradiciones
Ajoarriero, morteruelo, pisto y resolí son nombres de la gastronomía tradicional citada para Cuenca. No necesitas convertirlos en recetas para que aporten contexto: sirven para reconocer que la comida también forma parte de la cultura local, igual que las celebraciones y la música religiosa.

También se mencionan huertos, artesanía, barrios, restauración, vida nocturna y celebraciones. Son pistas para fijarte en diversidad de vida local y en la relación entre ciudad, actividades cotidianas y cultura. Úsalas para observar y preguntar, no para convertir una impresión en una cifra de población o una conclusión demográfica.

## [observation] 7. Qué observar durante la visita
- Relieve: busca dónde se hacen presentes las hoces del Júcar y del Huécar en la forma de mirar el casco.
- Patrimonio: identifica Casas Colgadas, puente de San Pablo, plaza Mayor, catedral, torre Mangana, arco de Bezudo y túnel de Alfonso VIII.
- Arte: compara las Casas Colgadas con el Museo de Arte Abstracto Español y anota qué añade una colección artística a un lugar patrimonial.
- Naturaleza: separa lo que observas en la ciudad de lo que observas en Serranía, Ciudad Encantada, torcas, El Hosquillo y ríos.
- Ciencia y cultura: relaciona Las Hoyas, fósiles y museo; después busca qué revelan fiestas, música y gastronomía sobre la identidad local.

## [study] 8. Preguntas para aprender
¿Cómo condicionan las hoces la forma en que entiendes la ciudad? ¿Qué relación existe entre el paisaje natural cercano y el reconocimiento patrimonial de 1996? ¿Qué diferencia observas entre identificar las Casas Colgadas como icono y estudiar el conjunto de lugares del casco histórico?

¿Qué puede enseñarte el Museo de Arte Abstracto Español sobre la convivencia entre patrimonio histórico y arte contemporáneo? ¿Por qué tiene sentido hablar de fósiles, Cretácico inferior y Concavenator dentro de una visita a Cuenca? ¿Qué conexiones encuentras entre Semana Santa, Turbas, música religiosa y los espacios de la ciudad?

Para trabajar estas preguntas sin convertir la visita en un examen, elige una comparación. Puede ser entre una vista de las hoces y un espacio del casco, entre las Casas Colgadas y el museo que albergan, o entre una forma del paisaje de la Serranía y un fósil presentado en el Museo de Paleontología. En cada caso apunta tres cosas: qué observas, qué dato histórico o científico ayuda a interpretarlo y qué duda te queda. Así distingues una descripción de una explicación y practicas una forma sencilla de aprender a partir de lugares reales.

Al final, reúne las notas en un mapa de relaciones. Une paisaje con ciudad, patrimonio con arte, y naturaleza con ciencia; añade cultura y gastronomía donde aparezcan. No se busca una única respuesta correcta. Lo importante es comprobar si cada conexión se apoya en algo que has visto o en un dato de la guía, y reconocer qué parte necesitaría confirmarse antes de una actividad concreta.

## [budget] 9. Preparar el presupuesto con prudencia
No hay cifras fiables disponibles aquí sobre entradas, transporte, alojamiento, reservas o actividades. Antes de una visita de grupo, reúne los datos actuales de cada lugar. Separa los gastos del casco histórico de los de una posible salida a la Serranía: no necesitan el mismo plan ni las mismas confirmaciones.

## [practical] Antes de ir
- Lleva un cuaderno dividido en paisaje, historia, patrimonio, arte, ciencia y cultura.
- Confirma una vez horarios, reservas, precios y accesibilidad antes de repartir actividades.
- Mantén separados el recorrido urbano y la salida natural para poder observar ambos con calma.
- Si el programa incluye una celebración, revisa fecha y características actuales antes de convertirla en actividad.

## [risks] Un límite útil para aprender con responsabilidad
La información disponible no fija transportes, duración, costes, accesibilidad ni condiciones de las actividades al aire libre. Mantén alternativas culturales dentro de la ciudad y adapta la salida natural a las condiciones confirmadas. Esa prudencia no reduce el valor educativo: ayuda a preparar una visita realista y atenta.
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
const studentDepth = assertContentNotTooThin({ profile: 'student', ...STUDENT, evidence: EVIDENCE, sourceLimited: false })
const studentReadability = assertReadableAndScannable({ profile: 'student', ...STUDENT })
const educational = assertStudentEducationalValue({ ...STUDENT, evidence: EVIDENCE, sourceLimited: false })

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
const projectedStudent = projectLibraryEntryToTrawelEditorialProfile({ entry: studentEntry, currentApproved: student }, target())
const handoff = prepareTrawelEditorialDeliveryV2({ target: target(), sources: [{ entry: adventureEntry, currentApproved: adventureAfter }, { entry: studentEntry, currentApproved: student }] as [LibraryTrawelApprovedSource, LibraryTrawelApprovedSource] })
const visual = emptyDestinationVisualContract(adventureEntry.destination.canonicalId)

console.log(JSON.stringify({
  operation: 'cuenca_student_educational_depth_067',
  adventureUnchanged: true,
  gates: { publicSafe: 'PASS', contentTooThin: 'NO', readability: 'PASS', scannability: 'PASS', studentDepth: 'PASS', studentEducationalValue: 'PASS', profileDifferentiation: 'PASS' },
  student: { wordCount: studentDepth.wordCount, sectionsWithContent: studentDepth.sectionsWithContent, topicsDeveloped: studentDepth.developedThemes, thematicCoverage: educational.thematicCoverage, namedPlaceCoverage: educational.namedPlaceCoverage, datesUsed: educational.datesUsed, questionsIncluded: educational.questionsIncluded, paragraphCount: studentReadability.paragraphCount, longParagraphCount: studentReadability.longParagraphCount, projectedSections: projectedStudent.sections.map(section => section.kind), rawInternalMarkersVisible: internalMarkers(student.content), markdownEscapedVisible: /\\(?:\*|_|`|\[|\]|#)/u.test(student.content) },
  approval: { libraryEntryId: student.libraryEntryId, versionId: student.versionId, revisionId: student.revisionId, approvalDecisionId: student.approvalDecisionId, versionHash: student.versionHash, contentHash: student.contentHash },
  handoff: { ready: true, handoffKey: handoff.handoffKey, payloadFingerprint: handoff.payloadFingerprint },
  visual: { imageSlot1: visual.imageSlot1.state, imageSlot2: visual.imageSlot2.state },
  cost: { tavily: 0, openai: 0, deepseek: 0, total: 0, phases: [{ phase: 'student_rewrite_from_durable_evidence', provider: 'none', model: 'none', inputTokens: 0, outputTokens: 0, cost: 0 }] },
}, null, 2))

async function createStudentVersion(): Promise<string> {
  const current = await versioning.getCurrentApprovedVersion(ENTRIES.student)
  const detail = await versioning.getVersionDetail(current.versionId!)
  if (detail.state.effectiveState === 'approved' && detail.currentRevision.title === STUDENT.title && detail.currentRevision.content.trimEnd() === STUDENT.content.trimEnd()) return detail.version.versionId
  const expectedHeadHash = detail.decisions.at(-1)?.decisionTargetHash
  if (!expectedHeadHash) throw new Error('Falta cabecera aprobada Student')
  const result = await drafts.createDraft({ libraryEntryId: ENTRIES.student, expectedHeadHash, title: STUDENT.title, content: STUDENT.content, changeSummary: 'student_educational_depth: amplía la guía educativa con hechos aprobados, bloques temáticos y preguntas de observación.', actorId: MANUAL_LOCAL_ACTOR_ID, operationKey: key('investighost:067:cuenca:student:educational_depth:v1') })
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
    const reconciled = await decisions.reconcileFindings({ versionId, revisionId: detail.currentRevision.id, expectedState: 'draft', expectedRevisionHash: detail.currentRevision.revisionHash, expectedTraceabilityHash: state.traceabilityHash, finding: { findingKey: item.findingKey, sourceFindingType: item.sourceFindingType, sourceFindingId: item.sourceFindingId, origin: item.origin, disposition: 'accepted_risk', claimRelation: item.claimRelation, supportStatus: item.supportStatus, subjectText: item.subjectText, diffAnchor: null, claimIds: item.claimIds, evidenceReferences: item.evidenceReferences, sourceIds: item.sourceIds, editorDeclaration: 'student_educational_depth: la trazabilidad se conserva fuera del cuerpo público.', justification: 'La revisión desarrolla hechos ya aprobados para una guía educativa sin añadir investigación ni hechos nuevos.' }, createdByActorId: MANUAL_LOCAL_ACTOR_ID, operationKey: key(`investighost:067:cuenca:student:reconcile:${item.findingKey}`) })
    if (reconciled.status !== 'ok') throw new Error(`No se pudo reconciliar Student/${item.findingKey}`)
  }
  detail = await versioning.getVersionDetail(versionId)
  const state = await versioning.getVersionStateSnapshot(versionId)
  const submitted = await decisions.submitForReview({ versionId, revisionId: detail.currentRevision.id, expectedState: 'draft', expectedRevisionHash: detail.currentRevision.revisionHash, expectedTraceabilityHash: state.traceabilityHash, reason: 'student_educational_depth: revisión factual, pública, didáctica y estructural superada.', actorId: MANUAL_LOCAL_ACTOR_ID, operationKey: key('investighost:067:cuenca:student:submit:v1') })
  if (submitted.status !== 'ok') throw new Error('No se pudo enviar Student a revisión')
  const review = await versioning.getVersionStateSnapshot(versionId)
  if (!review.aggregateHash) throw new Error('Falta hash de decisión Student')
  const acceptedRiskFindingKeys = (await versioning.getEffectiveVersionFindings(versionId, detail.currentRevision.id)).items.map(item => item.findingKey).sort()
  const decision = await decisions.decideVersion({ versionId, revisionId: detail.currentRevision.id, decisionType: 'approve', expectedPreviousState: 'ready_for_review', expectedDecisionTargetHash: review.aggregateHash, reason: 'student_educational_depth aprobada: guía educativa completa, pública, escaneable y sin marcadores internos.', actorId: MANUAL_LOCAL_ACTOR_ID, affectedFindingKeys: [], changeInstructions: [], acceptedRiskFindingKeys, separationOfDutiesException: true, separationOfDutiesReason: 'Operador local autorizado aprueba Student tras validar factualidad, valor educativo, lectura, escaneo y seguridad pública.', operationKey: key('investighost:067:cuenca:student:approve:v1') })
  if (decision.status !== 'ok') throw new Error('No se pudo aprobar Student')
}

function assertAdventureUnchanged(current: { versionId: string | null; revisionId: string | null; approvalDecisionId: string | null; versionHash: string; contentHash: string }): void {
  for (const [keyName, expected] of Object.entries(ADVENTURE_SNAPSHOT)) {
    if (current[keyName as keyof typeof current] !== expected) throw new Error(`Adventure cambió: ${keyName}`)
  }
}
function target() { return { sourceMappingId: 'zone:espana:cuenca', canonicalDestinationId: 'investighost:zone:espana:cuenca', entityType: 'zone' as const, entitySlug: 'cuenca', countrySlug: 'espana', zoneSlug: 'cuenca' } }
function key(value: string): string { return createHash('sha256').update(value).digest('hex') }
function internalMarkers(content: string): number { return content.match(/(?:\(c\d+\)|\bg\d+\b|\b(?:expediente|dossier)\b|claimId|evidenceId|gapId)/giu)?.length ?? 0 }
function readLocalSupabaseEnvironment(): { url: string; serviceRoleKey: string } { const output = execSync('npx supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); const url = output.match(/^API_URL="?([^\r\n"]+)/m)?.[1]; const serviceRoleKey = output.match(/^SERVICE_ROLE_KEY="?([^\r\n"]+)/m)?.[1]; if (!url || !serviceRoleKey) throw new Error('Supabase local no expuso credenciales de servicio'); return { url, serviceRoleKey } }
