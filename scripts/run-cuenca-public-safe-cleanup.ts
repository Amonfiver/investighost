import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { MANUAL_LOCAL_ACTOR_ID } from '@modules/editorial-pipeline/manual-runtime'
import {
  assertContentNotTooThin,
  assertProfilesDifferentiated,
  assertPublicSafeLibraryDocument,
  assertReadableAndScannable,
  RealEditorialLibraryVersionDraftApplicationService,
  RealEditorialLibraryVersioningService,
  SupabaseRealEditorialLibraryVersioningRepository,
} from '@modules/library-versioning'
import { SupabaseRealEditorialPilotRepository } from '@modules/real-pipeline'
import { prepareTrawelEditorialDeliveryV2, projectLibraryEntryToTrawelEditorialProfile } from '@modules/trawel-handoff'
import type { LibraryTrawelApprovedSource } from '@shared/trawel-editorial-handoff-contracts'
import { emptyDestinationVisualContract, projectDestinationVisualsForTrawel } from '@shared/destination-visual-contract'

const ENTRIES = { adventure: 'c9683342-5eb6-4d29-91fa-6eeadabe21af', student: 'c2c1bf05-45f4-4b04-bc3f-e4894c909bf4' } as const
const EVIDENCE = {
  validClaimCount: 11,
  thematicAreas: ['patrimonio', 'historia', 'paisaje', 'naturaleza', 'cultura', 'arte', 'paleontología'],
  namedPlaces: ['Casas Colgadas', 'puente de San Pablo', 'plaza Mayor', 'torre Mangana', 'arco de Bezudo', 'catedral de Santa María y San Julián', 'túnel de Alfonso VIII', 'Museo de Arte Abstracto Español', 'Serranía de Cuenca', 'Ciudad Encantada', 'torcas de Palancares y Tierra Muerta', 'El Hosquillo', 'Las Hoyas', 'Museo de Paleontología de Castilla-La Mancha'],
} as const

const CONTENT = {
  adventure: {
    title: 'Cuenca (España): patrimonio, paisaje y una escapada para explorar',
    content: `## [intro] Por qué ir a Cuenca
Cuenca reúne tres viajes en uno: un casco histórico entre las hoces del Júcar y el Huécar, arte abstracto dentro de las Casas Colgadas y una serranía de formas calizas, torcas y ríos. Es una buena elección si te gusta alternar calles con personalidad, patrimonio visible y una escapada de naturaleza. El conjunto histórico y su paisaje cercano fueron reconocidos como Ciudad Patrimonio de la Humanidad en 1996: aquí el relieve no es un fondo, forma parte de lo que vienes a descubrir.

## [overview] Una ciudad para mirar de cerca y ampliar hacia la sierra
La mejor manera de entender Cuenca es dejar que el paisaje ordene la visita. Las hoces enmarcan el casco y dan sentido a sus edificios, sus espacios urbanos y sus puntos de paso. La ciudad fue fundada bajo dominio islámico y Alfonso VIII la conquistó el 21 de septiembre de 1177, tras nueve meses de asedio: una referencia breve pero útil para mirar el patrimonio con otra perspectiva.

También hay un motivo claro para venir por el arte. El Museo de Arte Abstracto Español abrió en 1966 en las Casas Colgadas y se vincula a Fernando Zóbel, Gustavo Torner y Antonio Pérez. Guarda esta combinación para un momento sin prisas: es uno de esos lugares donde arquitectura, paisaje y colección se refuerzan entre sí.

## [highlights] No te pierdas
- Casas Colgadas y Museo de Arte Abstracto Español: el gran icono de Cuenca gana interés al reunir patrimonio y una colección de arte abstracto español en el mismo lugar.
- Puente de San Pablo, plaza Mayor y catedral: una terna muy útil para centrar el paseo por el casco histórico y reconocer algunos de sus espacios más citados.
- Torre Mangana, arco de Bezudo y túnel de Alfonso VIII: tres paradas para ir más allá de la postal y buscar referencias urbanas e históricas con nombre propio.
- Serranía de Cuenca, Ciudad Encantada y torcas: la extensión natural para quien quiere cambiar piedra urbana por formaciones, bosque y relieve calizo.
- Las Hoyas y Museo de Paleontología de Castilla-La Mancha: una combinación poco común para enlazar fósiles, Cretácico inferior y Concavenator con el paisaje que rodea la ciudad.
- Semana Santa, Turbas y Semana de Música Religiosa: pistas culturales para completar la visita si coinciden con el momento del viaje.

## [route] Un plan recomendado sin forzar el reloj
Para una visita corta, prioriza el casco histórico: Casas Colgadas, Museo de Arte Abstracto Español, puente de San Pablo, plaza Mayor, catedral, torre Mangana, arco de Bezudo y túnel de Alfonso VIII forman un núcleo muy reconocible. No hace falta convertirlo en una carrera; el interés está en alternar arquitectura, historia y paisaje.

Si dispones de más tiempo, reserva una parte del viaje para la Serranía de Cuenca. Ciudad Encantada, torcas de Palancares y Tierra Muerta, El Hosquillo y los senderos junto a los ríos permiten ampliar la escala. Caminar, bicicleta y piragua aparecen entre las posibilidades del entorno, pero elige solo una línea de actividad después de revisar sus condiciones reales.

Para una extensión distinta, apunta Las Hoyas y el Museo de Paleontología de Castilla-La Mancha. Es una manera especialmente interesante de pasar del relieve actual a los fósiles de plantas, animales y Concavenator, sin repetir el mismo tipo de visita.

## [interests] Si te gusta
- Patrimonio y fotografía: busca el diálogo entre el casco histórico, las hoces y las Casas Colgadas.
- Arte: combina las Casas Colgadas con el Museo de Arte Abstracto Español y sus vínculos con Zóbel, Torner y Antonio Pérez.
- Naturaleza: deja espacio para Serranía, Ciudad Encantada, torcas, ríos y El Hosquillo.
- Ciencia: Las Hoyas y el museo paleontológico aportan una lectura del Cretácico inferior.
- Cultura y sabores: reconoce Semana Santa, Turbas, música religiosa, ajoarriero, morteruelo, pisto y resolí sin convertir la visita en un catálogo.

## [practical] Antes de ir
- Agrupa en una sola comprobación horarios, precios, reservas y accesibilidad de museos, monumentos y espacios culturales.
- Para la Serranía y las actividades junto a los ríos, revisa el acceso y las condiciones del día antes de decidir el plan.
- No des por hechas distancias, duración, dificultad, señalización, transporte o servicios: esta guía no los fija.
- Si el viaje gira en torno a una fiesta, música o gastronomía, comprueba fechas y oferta concreta antes de organizarlo.

## [risks] Un límite sencillo: plan flexible
No hay datos operativos suficientes para prometer una ruta concreta, una dificultad, una temporada, una duración o un coste. Trata esos aspectos como decisiones del momento y confirma la información vigente antes de salir al entorno natural.

El resultado puede seguir siendo una escapada muy completa: casco histórico para empezar, serranía para ampliar y paleontología o cultura para elegir según tus intereses.`,
  },
  student: {
    title: 'Cuenca (España): claves para aprender entre paisaje, historia y arte',
    content: `## [intro] Una ciudad para entender mirando
Cuenca permite ver con claridad cómo un paisaje puede influir en una ciudad. Está situada entre las hoces del Júcar y el Huécar, y su casco histórico no se separa del entorno natural cercano. Por eso es un destino excelente para relacionar geografía, historia, patrimonio, arte y ciencia sin tener que tratarlos como temas aislados.

## [overview] Cinco claves para entender Cuenca
- Paisaje: las hoces del Júcar y el Huécar ayudan a explicar el carácter de una ciudad asentada entre relieves marcados.
- Historia: Cuenca fue fundada bajo dominio islámico y Alfonso VIII la conquistó el 21 de septiembre de 1177 tras nueve meses de asedio.
- Patrimonio: el casco histórico y el paisaje natural cercano fueron reconocidos como Ciudad Patrimonio de la Humanidad en 1996.
- Arte: el Museo de Arte Abstracto Español abrió en 1966 en las Casas Colgadas y se vincula a Fernando Zóbel, Gustavo Torner y Antonio Pérez.
- Ciencia: Las Hoyas, del Cretácico inferior, y el Museo de Paleontología permiten conectar fósiles, plantas, animales y Concavenator.

## [budget] Planificar sin inventar cifras
No hay cifras fiables aquí para entradas, transporte, alojamiento, reservas o actividades. Para una salida de estudio, reúne esos datos actuales antes de calcular el presupuesto. Separa la parte urbana de una posible escapada a la Serranía: no requieren las mismas confirmaciones ni tienen por qué formar un único plan.

## [daily_life] Cultura que se puede reconocer
Semana Santa, la procesión de las Turbas y la Semana de Música Religiosa son referencias útiles para hablar de tradición, celebración y música. Ajoarriero, morteruelo, pisto y resolí permiten abrir otra conversación: cómo una cocina local se relaciona con la identidad de un lugar.

También aparecen huertos, artesanía, barrios, restauración, vida nocturna y celebraciones. Úsalos como pistas para observar vida local y diversidad cultural, no como base para sacar cifras de población o conclusiones demográficas que no están disponibles.

## [study] Qué observar y cómo ponerte a prueba
Empieza por el relieve. Desde el casco, fíjate en la presencia de las hoces y escribe tres palabras para describir la relación entre ciudad y paisaje. Pregúntate: ¿cómo cambia la forma de una ciudad al asentarse entre dos hoces? ¿Por qué tendría sentido que el paisaje cercano forme parte de la lectura patrimonial?

Después ordena tres fechas: la fundación bajo dominio islámico, la conquista de 1177 y el reconocimiento patrimonial de 1996. No necesitas una cronología enorme. Basta con distinguir qué cuenta cada fecha: origen de la ciudad, conflicto histórico y reconocimiento de un conjunto formado por ciudad y paisaje.

Para observar el casco, busca Casas Colgadas, puente de San Pablo, plaza Mayor, torre Mangana, arco de Bezudo, catedral de Santa María y San Julián y túnel de Alfonso VIII. Divide tus notas en arquitectura, espacio urbano e historia. ¿Qué puedes describir directamente? ¿Qué preguntas necesitas responder después para comprender mejor cada lugar?

El arte añade otra capa. Compara las Casas Colgadas con el Museo de Arte Abstracto Español: el museo abrió allí en 1966. ¿Qué cambia cuando un edificio patrimonial también contiene una colección de arte? Relaciona esa pregunta con Zóbel, Torner y Antonio Pérez, sin confundir el nombre de un artista con una respuesta completa.

Por último, conecta naturaleza y ciencia. Ciudad Encantada, torcas de Palancares y Tierra Muerta, El Hosquillo y los senderos junto a los ríos ayudan a observar formas del relieve y agua. Las Hoyas y el museo paleontológico permiten seguir la cadena paisaje, yacimiento, fósil y museo. ¿Cómo ayuda un museo a interpretar un territorio que no se comprende solo con mirarlo?

## [practical] Prepara la visita para aprender más
- Lleva un cuaderno con cuatro apartados: paisaje, historia, arte y ciencia.
- Confirma una vez los horarios, reservas, precios y accesibilidad antes de repartir tareas o actividades.
- Separa el casco histórico de cualquier salida a la Serranía para poder observar ambos con calma.
- Si coincides con una celebración cultural, revisa fecha y características actuales antes de incluirla en el plan.

## [risks] La prudencia también enseña
La información disponible no fija transportes, duración, costes, accesibilidad ni condiciones de actividades al aire libre. No convierte eso en un problema de aprendizaje: es una ocasión para preparar una visita responsable, con alternativas culturales dentro de la ciudad si el plan natural no encaja ese día.
`,
  },
} as const

type Profile = keyof typeof ENTRIES
const environment = readLocalSupabaseEnvironment()
const client = createClient(environment.url, environment.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
const versioning = new SupabaseRealEditorialLibraryVersioningRepository(client)
const drafts = new RealEditorialLibraryVersionDraftApplicationService(versioning, versioning, versioning)
const decisions = new RealEditorialLibraryVersioningService(versioning)
const entries = await new SupabaseRealEditorialPilotRepository(client).listLibraryEntries({ destination: 'Cuenca', origin: 'real_editorial_pilot' })
const depth = Object.fromEntries((['adventure', 'student'] as const).map(profile => [profile, assertContentNotTooThin({ profile, ...CONTENT[profile], evidence: EVIDENCE, sourceLimited: false })])) as Record<Profile, ReturnType<typeof assertContentNotTooThin>>
const readability = Object.fromEntries((['adventure', 'student'] as const).map(profile => [profile, assertReadableAndScannable({ profile, ...CONTENT[profile] })])) as Record<Profile, ReturnType<typeof assertReadableAndScannable>>
assertProfilesDifferentiated(CONTENT.adventure, CONTENT.student)

const approved = await Promise.all((['adventure', 'student'] as const).map(async profile => {
  const versionId = await createReadableVersion(profile)
  await approveReadableVersion(profile, versionId)
  const current = await versioning.getCurrentApprovedVersion(ENTRIES[profile])
  assertPublicSafeLibraryDocument(current.title, current.content)
  const entry = entries.find(candidate => candidate.entryId === ENTRIES[profile])
  if (!entry) throw new Error(`Falta la entrada de Biblioteca ${profile}`)
  return { profile, current, entry, projected: projectLibraryEntryToTrawelEditorialProfile({ entry, currentApproved: current }, target()) }
}))
const handoff = prepareTrawelEditorialDeliveryV2({ target: target(), sources: approved.map(item => ({ entry: item.entry, currentApproved: item.current })) as [LibraryTrawelApprovedSource, LibraryTrawelApprovedSource] })
const visual = emptyDestinationVisualContract(approved[0].entry.destination.canonicalId)
const visualV2 = projectDestinationVisualsForTrawel(visual)

console.log(JSON.stringify({
  operation: 'cuenca_readability_and_scannability_065',
  gates: { publicSafe: 'PASS', contentTooThin: 'NO', profileDifferentiation: 'PASS', readability: 'PASS', scannability: 'PASS' },
  profiles: approved.map(item => ({ profile: item.profile, wordCount: depth[item.profile].wordCount, paragraphs: readability[item.profile].paragraphCount, highlights: item.profile === 'adventure' ? item.projected.highlights?.length ?? 0 : 0, sectionsWithContent: depth[item.profile].sectionsWithContent, developedThemes: depth[item.profile].developedThemes, rawInternalMarkersVisible: internalMarkers(item.current.content), markdownEscapedVisible: /\\(?:\*|_|`|\[|\]|#)/u.test(item.current.content) })),
  approved: approved.map(item => ({ profile: item.profile, libraryEntryId: item.current.libraryEntryId, versionId: item.current.versionId, revisionId: item.current.revisionId, approvalDecisionId: item.current.approvalDecisionId, versionHash: item.current.versionHash, contentHash: item.current.contentHash })),
  handoff: { ready: true, handoffKey: handoff.handoffKey, payloadFingerprint: handoff.payloadFingerprint },
  visual: { imageSlot1: visual.imageSlot1.state, imageSlot2: visual.imageSlot2.state, unchanged: true, v2Compatible: visualV2.imageSlot1.state === 'EMPTY' && visualV2.imageSlot2.state === 'EMPTY' },
  cost: { tavily: 0, openai: 0, deepseek: 0, total: 0, phases: [{ phase: 'editorial_rewrite_from_durable_evidence', provider: 'none', model: 'none', inputTokens: 0, outputTokens: 0, cost: 0 }] },
}, null, 2))

async function createReadableVersion(profile: Profile): Promise<string> {
  const current = await versioning.getCurrentApprovedVersion(ENTRIES[profile])
  const detail = current.versionId === null ? null : await versioning.getVersionDetail(current.versionId)
  if (detail?.state.effectiveState === 'approved' && detail.currentRevision.title === CONTENT[profile].title && detail.currentRevision.content.trimEnd() === CONTENT[profile].content.trimEnd()) return detail.version.versionId
  const expectedHeadHash = detail?.decisions.at(-1)?.decisionTargetHash
  if (!expectedHeadHash) throw new Error(`Falta la cabecera aprobada de ${profile}`)
  const result = await drafts.createDraft({ libraryEntryId: ENTRIES[profile], expectedHeadHash, title: CONTENT[profile].title, content: CONTENT[profile].content, changeSummary: 'readability_and_scannability: reorganiza hechos ya aprobados para lectura digital, jerarquía y recomendaciones claras.', actorId: MANUAL_LOCAL_ACTOR_ID, operationKey: key(`investighost:065:cuenca:${profile}:readability_scannability:v1`) })
  if (result.status !== 'ok') throw new Error(`No se pudo crear la revisión legible de ${profile}: ${result.code}`)
  return result.version.versionId
}

async function approveReadableVersion(profile: Profile, versionId: string): Promise<void> {
  let detail = await versioning.getVersionDetail(versionId)
  if (detail.state.effectiveState === 'approved') return
  if (detail.state.effectiveState !== 'draft') throw new Error(`La revisión legible de ${profile} no está en draft`)
  for (const item of (await versioning.getEffectiveVersionFindings(versionId, detail.currentRevision.id)).items) {
    if (!item.isBaseline) continue
    const state = await versioning.getVersionStateSnapshot(versionId)
    const reconciled = await decisions.reconcileFindings({ versionId, revisionId: detail.currentRevision.id, expectedState: 'draft', expectedRevisionHash: detail.currentRevision.revisionHash, expectedTraceabilityHash: state.traceabilityHash, finding: { findingKey: item.findingKey, sourceFindingType: item.sourceFindingType, sourceFindingId: item.sourceFindingId, origin: item.origin, disposition: 'accepted_risk', claimRelation: item.claimRelation, supportStatus: item.supportStatus, subjectText: item.subjectText, diffAnchor: null, claimIds: item.claimIds, evidenceReferences: item.evidenceReferences, sourceIds: item.sourceIds, editorDeclaration: 'readability_and_scannability: se conserva la trazabilidad fuera del texto público.', justification: 'La revisión reorganiza y condensa contenido ya aprobado; no añade hechos ni investigación.' }, createdByActorId: MANUAL_LOCAL_ACTOR_ID, operationKey: key(`investighost:065:cuenca:${profile}:reconcile:${item.findingKey}`) })
    if (reconciled.status !== 'ok') throw new Error(`No se pudo reconciliar ${profile}/${item.findingKey}`)
  }
  detail = await versioning.getVersionDetail(versionId)
  const state = await versioning.getVersionStateSnapshot(versionId)
  const submitted = await decisions.submitForReview({ versionId, revisionId: detail.currentRevision.id, expectedState: 'draft', expectedRevisionHash: detail.currentRevision.revisionHash, expectedTraceabilityHash: state.traceabilityHash, reason: 'readability_and_scannability: validación pública, factual, de profundidad y de lectura digital superada.', actorId: MANUAL_LOCAL_ACTOR_ID, operationKey: key(`investighost:065:cuenca:${profile}:submit:v1`) })
  if (submitted.status !== 'ok') throw new Error(`No se pudo enviar ${profile} a revisión`)
  const review = await versioning.getVersionStateSnapshot(versionId)
  if (!review.aggregateHash) throw new Error(`Falta el hash de decisión para ${profile}`)
  const acceptedRiskFindingKeys = (await versioning.getEffectiveVersionFindings(versionId, detail.currentRevision.id)).items.map(item => item.findingKey).sort()
  const decision = await decisions.decideVersion({ versionId, revisionId: detail.currentRevision.id, decisionType: 'approve', expectedPreviousState: 'ready_for_review', expectedDecisionTargetHash: review.aggregateHash, reason: 'readability_and_scannability aprobada: cuerpo público denso, escaneable y sin Markdown escapado visible.', actorId: MANUAL_LOCAL_ACTOR_ID, affectedFindingKeys: [], changeInstructions: [], acceptedRiskFindingKeys, separationOfDutiesException: true, separationOfDutiesReason: 'Operador local autorizado aprueba tras validar factualidad, seguridad pública, profundidad, diferenciación y lectura.', operationKey: key(`investighost:065:cuenca:${profile}:approve:v1`) })
  if (decision.status !== 'ok') throw new Error(`No se pudo aprobar ${profile}`)
}

function target() { return { sourceMappingId: 'zone:espana:cuenca', canonicalDestinationId: 'investighost:zone:espana:cuenca', entityType: 'zone' as const, entitySlug: 'cuenca', countrySlug: 'espana', zoneSlug: 'cuenca' } }
function key(value: string): string { return createHash('sha256').update(value).digest('hex') }
function internalMarkers(content: string): number { return content.match(/(?:\(c\d+\)|\bg\d+\b|\b(?:expediente|dossier)\b|claimId|evidenceId|gapId)/giu)?.length ?? 0 }
function readLocalSupabaseEnvironment(): { url: string; serviceRoleKey: string } { const output = execSync('npx supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); const url = output.match(/^API_URL="?([^\r\n"]+)/m)?.[1]; const serviceRoleKey = output.match(/^SERVICE_ROLE_KEY="?([^\r\n"]+)/m)?.[1]; if (!url || !serviceRoleKey) throw new Error('Supabase local no expuso credenciales de servicio'); return { url, serviceRoleKey } }
