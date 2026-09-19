import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { MANUAL_LOCAL_ACTOR_ID } from '@modules/editorial-pipeline/manual-runtime'
import {
  assertContentNotTooThin,
  assertProfilesDifferentiated,
  assertPublicSafeLibraryDocument,
  RealEditorialLibraryVersionDraftApplicationService,
  RealEditorialLibraryVersioningService,
  SupabaseRealEditorialLibraryVersioningRepository,
} from '@modules/library-versioning'
import { SupabaseRealEditorialPilotRepository } from '@modules/real-pipeline'
import { prepareTrawelEditorialDeliveryV2, projectLibraryEntryToTrawelEditorialProfile } from '@modules/trawel-handoff'
import type { LibraryTrawelApprovedSource } from '@shared/trawel-editorial-handoff-contracts'
import { emptyDestinationVisualContract, projectDestinationVisualsForTrawel } from '@shared/destination-visual-contract'

const ENTRIES = {
  adventure: 'c9683342-5eb6-4d29-91fa-6eeadabe21af',
  student: 'c2c1bf05-45f4-4b04-bc3f-e4894c909bf4',
} as const

const EVIDENCE = {
  validClaimCount: 11,
  thematicAreas: ['patrimonio', 'historia', 'paisaje', 'naturaleza', 'cultura', 'arte', 'paleontología'],
  namedPlaces: ['Casas Colgadas', 'puente de San Pablo', 'plaza Mayor', 'torre Mangana', 'arco de Bezudo', 'catedral de Santa María y San Julián', 'túnel de Alfonso VIII', 'Museo de Arte Abstracto Español', 'Serranía de Cuenca', 'Ciudad Encantada', 'torcas de Palancares y Tierra Muerta', 'El Hosquillo', 'Las Hoyas', 'Museo de Paleontología de Castilla-La Mancha'],
} as const

const CONTENT = {
  adventure: {
    title: 'Cuenca (España): patrimonio, paisaje y rutas para explorar con calma',
    content: `## [intro] Una ciudad que se explora entre hoces
Cuenca propone una combinación poco habitual: un casco histórico levantado entre las hoces de los ríos Júcar y Huécar, patrimonio visible a cada paso y una serranía que amplía el viaje hacia formas kársticas, ríos y actividades al aire libre. La ciudad no se entiende como una colección aislada de monumentos. El relieve forma parte de la experiencia y ayuda a explicar por qué el conjunto histórico y su paisaje natural cercano fueron reconocidos como Ciudad Patrimonio de la Humanidad en 1996.

Para quien viaja con ganas de explorar, el atractivo está en alternar espacios urbanos concretos con el entorno natural citado alrededor de la ciudad. Hay lugares para detenerse en la arquitectura, una escena artística ligada al Museo de Arte Abstracto Español, referencias culturales y gastronómicas, y un territorio donde aparecen la Serranía de Cuenca, la Ciudad Encantada, las torcas y Las Hoyas. El plan funciona mejor si se deja margen: esta guía sugiere un orden de descubrimiento, no tiempos, distancias ni dificultades que no estén confirmados.

## [overview] Patrimonio en un relieve que marca el recorrido
La imagen de Cuenca nace de su emplazamiento entre el Júcar y el Huécar. El casco histórico se sitúa en ese paisaje de hoces, y el entorno natural cercano no queda fuera de la visita: es parte de la identidad del destino. Recorrer la ciudad con esa idea en mente cambia la mirada. Las calles, los edificios religiosos, los puntos patrimoniales y los espacios de paso pertenecen a un conjunto que dialoga con el terreno.

La historia aporta otra capa para la exploración. La ciudad fue fundada bajo dominio islámico y Alfonso VIII la conquistó el 21 de septiembre de 1177 tras nueve meses de asedio. No hace falta convertir el paseo en una lección: basta con usar esa referencia para entender que el casco conserva una memoria histórica además de una presencia visual. La plaza Mayor, la catedral de Santa María y San Julián, la torre Mangana, el arco de Bezudo y el túnel de Alfonso VIII ofrecen nombres concretos desde los que componer una visita atenta.

La ciudad también permite pasar de patrimonio a arte sin cambiar de escenario. El Museo de Arte Abstracto Español abrió en 1966 en las Casas Colgadas, y la escena artística local se relaciona con Fernando Zóbel, Gustavo Torner y Antonio Pérez. Es una buena razón para no mirar las Casas Colgadas solo como icono: aquí reúnen arquitectura, colección y una puerta de entrada al arte español contemporáneo.

## [highlights] Paradas que dan forma a la visita
- **Casas Colgadas y Museo de Arte Abstracto Español.** Son un punto de partida potente porque unen uno de los lugares más reconocibles de Cuenca con un museo abierto en 1966. Conviene reservar tiempo mental para dos lecturas: la del edificio dentro del conjunto histórico y la del arte que alberga.
- **Puente de San Pablo, plaza Mayor y catedral.** Estos nombres permiten organizar el paseo por el casco sin inventar un trazado cerrado. El puente, la plaza Mayor y la catedral de Santa María y San Julián están entre los lugares documentados y ayudan a mantener el foco en el patrimonio visible.
- **Torre Mangana, arco de Bezudo y túnel de Alfonso VIII.** Son hitos para ampliar la exploración más allá de los iconos. Su interés está en que invitan a recorrer y reconocer capas diferentes del casco histórico, desde referencias urbanas hasta la memoria del rey conquistador.
- **Serranía de Cuenca, Ciudad Encantada y torcas.** Fuera de la ciudad, la Serranía reúne paisaje kárstico, la Ciudad Encantada y las torcas de Palancares y Tierra Muerta. Son los nombres que convierten una escapada de naturaleza en una continuación coherente de la visita urbana.
- **Las Hoyas y el Museo de Paleontología de Castilla-La Mancha.** El yacimiento de Las Hoyas, del Cretácico inferior, se relaciona con fósiles de plantas y animales y con Concavenator. El museo añade una escala científica al viaje y da un contrapunto excelente a la arquitectura y al relieve.
- **Cultura local y mesa.** Semana Santa, la procesión de las Turbas y la Semana de Música Religiosa son referencias culturales de Cuenca. En la gastronomía aparecen ajoarriero, morteruelo, pisto y resolí: nombres útiles para reconocer una cocina local sin prometer establecimientos ni menús concretos.

## [route] Un orden prudente: ciudad, paisaje y escapada
Empieza por el casco histórico y deja que el relieve dé sentido a la jornada. Un primer bloque puede reunir Casas Colgadas, Museo de Arte Abstracto Español, puente de San Pablo, plaza Mayor, catedral, torre Mangana, arco de Bezudo y túnel de Alfonso VIII. No es una ruta medida ni pretende indicar el orden exacto de las calles; es una secuencia de exploración que concentra patrimonio, arte e historia en el núcleo urbano.

En un segundo bloque, cambia de escala. La Serranía de Cuenca permite buscar la Ciudad Encantada, las torcas de Palancares y Tierra Muerta, El Hosquillo y los senderos junto a los ríos que aparecen en la información disponible. Caminar, ir en bicicleta y navegar en piragua por las hoces se mencionan como actividades posibles en el entorno, pero la elección concreta debe depender de condiciones verificadas el día de la visita. Sin datos respaldados sobre recorridos, duración o dificultad, lo razonable es escoger una sola línea de exploración natural y no encadenar promesas imposibles.

Si hay una tercera parte del viaje, dedica atención a Las Hoyas y al Museo de Paleontología de Castilla-La Mancha. Esta combinación conecta el paisaje actual con fósiles del Cretácico inferior y evita que la escapada a naturaleza se reduzca a una fotografía. El resultado es un itinerario temático, no una agenda cerrada: ciudad histórica primero, serranía después y paleontología como puente entre territorio y tiempo profundo.

## [practical] Preparar una exploración que deje margen
- Antes de entrar en museos, monumentos o espacios culturales, confirma horarios, precios, reservas y condiciones de accesibilidad actualizados. La guía no fija esos datos porque pueden cambiar.
- Para la Serranía, la Ciudad Encantada, las torcas, El Hosquillo y los senderos junto a los ríos, verifica cómo se accede y qué condiciones están vigentes. Decide la actividad después de conocer el estado del día, no al revés.
- Si te interesan caminar, bicicleta o piragua, busca información reciente sobre la opción elegida antes de contar con ella. No hay indicaciones fiables aquí sobre distancias, desnivel, señalización, empresas o duración.
- Separa el casco histórico de la salida natural en vez de intentar abarcarlo todo. Así podrás disfrutar de los lugares concretos de la ciudad y adaptar la escapada al tiempo real disponible.
- Para la cultura y la gastronomía, usa Semana Santa, Turbas, música religiosa, ajoarriero, morteruelo, pisto y resolí como pistas de interés. Confirma programas, fechas y oferta concreta antes de organizar el viaje alrededor de ellos.

## [risks] Límites operativos que conviene resolver antes de salir
La información disponible no establece horarios, precios, reservas, accesibilidad, transporte local ni duraciones de visita para Cuenca. Tampoco permite fijar una ruta concreta, un punto de inicio, una dificultad o una recomendación de temporada para las actividades de naturaleza. Por eso, una visita responsable debe comprobar esos detalles de forma actualizada antes de desplazarse.

En la serranía y junto a los ríos, trata las condiciones del terreno, el tiempo y la disponibilidad de actividades como variables. No hay una evaluación específica de riesgos que permita dar instrucciones técnicas de seguridad. Mantén el plan flexible, confirma las condiciones locales y elige solo actividades compatibles con la información vigente y con tu experiencia.`,
  },
  student: {
    title: 'Cuenca (España): una guía para estudiar paisaje, historia, arte y cultura',
    content: `## [intro] Una ciudad para aprender mirando relaciones
Cuenca ofrece una visita especialmente útil para estudiar cómo se conectan paisaje, historia, patrimonio, arte y cultura. La ciudad se asienta entre las hoces de los ríos Júcar y Huécar; esa situación permite empezar por una pregunta sencilla: ¿de qué manera condiciona el relieve la forma en que se entiende un casco histórico? El conjunto histórico y su paisaje natural cercano fueron reconocidos como Ciudad Patrimonio de la Humanidad en 1996, de modo que ciudad y entorno deben observarse juntos.

Esta guía no plantea la visita como una lista de cosas que hacer. Propone usar lugares concretos para comprender conceptos. Las Casas Colgadas y el Museo de Arte Abstracto Español permiten relacionar arquitectura y arte; la plaza Mayor, la catedral, la torre Mangana, el arco de Bezudo y el túnel de Alfonso VIII ayudan a ordenar el patrimonio; la Serranía, las torcas y Las Hoyas abren la puerta a geografía y paleontología. El objetivo es volver de Cuenca con preguntas mejor formuladas y conexiones claras entre los lugares visitados.

## [overview] Paisaje, historia y patrimonio como una misma lectura
Las hoces del Júcar y el Huécar son el primer concepto para trabajar. No son un fondo decorativo: sitúan la ciudad en un relieve concreto y explican por qué paisaje y casco histórico se presentan como una unidad patrimonial. Al observar la ciudad, conviene anotar dónde aparece el terreno en la experiencia del paseo y cómo cambia la percepción de los edificios cuando se los relaciona con las hoces.

La segunda capa es histórica. Cuenca fue fundada bajo dominio islámico y fue conquistada por Alfonso VIII el 21 de septiembre de 1177 después de nueve meses de asedio. Esta información permite construir una línea temporal breve pero precisa: fundación en época islámica, conquista de 1177 y reconocimiento patrimonial de 1996. No hace falta añadir etapas no confirmadas para aprovecharla; la tarea educativa es preguntar qué clase de información aporta cada fecha y qué aspectos de la ciudad ayuda a interpretar.

El casco ofrece un vocabulario de observación: Casas Colgadas, puente de San Pablo, plaza Mayor, torre Mangana, arco de Bezudo, catedral de Santa María y San Julián, túnel de Alfonso VIII y Museo de Arte Abstracto Español. En vez de memorizar los nombres como una lista, sitúalos en tres grupos: arquitectura y patrimonio, espacios urbanos y referencias para conectar lugar e historia. Después compara qué se puede observar directamente y qué necesita una explicación histórica adicional.

## [budget] Preparar el presupuesto sin inventar cifras
No hay información fiable disponible aquí sobre precios de entradas, transporte, alojamiento, reservas o costes de actividades. Para una salida de estudio, eso no impide planificar; obliga a hacerlo con prudencia. Reúne los datos actuales de cada museo, monumento, actividad o espacio natural antes de calcular un presupuesto y evita trasladar importes antiguos de una temporada a otra.

También conviene separar los posibles gastos urbanos de los de una escapada a la Serranía. El casco histórico, los museos y las visitas culturales requieren confirmaciones distintas de las de la Ciudad Encantada, las torcas, El Hosquillo o las actividades junto a los ríos. Esta separación es útil para aprender a convertir una idea de visita en un plan responsable sin fingir que los costes están fijados por una guía general.

## [daily_life] Cultura y gastronomía como temas de observación
La Semana Santa, la procesión de las Turbas y la Semana de Música Religiosa aparecen como referencias culturales relevantes en Cuenca. En una visita educativa pueden servir para hablar de tradición, celebración, música y presencia pública de la cultura. No hace falta suponer fechas, recorridos ni programas: lo interesante es identificar qué prácticas forman parte de la vida cultural de un lugar y qué información adicional sería necesaria para asistir a una edición concreta.

La gastronomía abre otra vía de aprendizaje. Ajoarriero, morteruelo, pisto y resolí son nombres citados como parte de la cocina tradicional. Puedes preguntar qué relación existe entre un plato, su nombre y la identidad local, o comparar cómo una tradición culinaria se transmite junto con las fiestas y las historias de una ciudad. Hay observaciones cualitativas sobre huertos, artesanía, barrios, restauración, vida nocturna y celebraciones; úsalas para reconocer diversidad de vida local, no para extraer cifras de población o conclusiones demográficas que no están disponibles.

## [study] Un cuaderno de campo para historia, arte, paisaje y ciencia
Empieza con el paisaje. Desde los lugares del casco, observa la presencia de las hoces del Júcar y del Huécar y escribe tres palabras que describan la relación entre ciudad y relieve. Después responde: ¿por qué tendría sentido que el paisaje natural cercano forme parte de la lectura patrimonial del conjunto histórico? La respuesta no necesita datos nuevos; debe apoyarse en lo que ves y en la idea de que la ciudad está situada entre ambas hoces.

Pasa a la historia. Coloca 1177 y 1996 en una línea temporal. Junto a 1177, anota la conquista por Alfonso VIII tras nueve meses de asedio; junto a 1996, el reconocimiento como Ciudad Patrimonio de la Humanidad. Pregunta qué diferencia hay entre una fecha de conflicto y una fecha de reconocimiento patrimonial. Después busca, en los nombres del casco, cuáles te parecen ligados a memoria histórica: plaza Mayor, catedral, torre Mangana, arco de Bezudo y túnel de Alfonso VIII son buenos puntos de partida para discutir cómo los topónimos y monumentos conservan referencias al pasado.

Para el arte, compara Casas Colgadas y Museo de Arte Abstracto Español. El museo abrió en 1966 en las Casas Colgadas y se vincula a Fernando Zóbel, Gustavo Torner y Antonio Pérez. Formula una hipótesis: ¿cómo cambia la lectura de un edificio cuando, además de formar parte del patrimonio, contiene una colección de arte? No necesitas conocer toda la historia del museo para responder; observa la convivencia entre lugar, fecha y nombres de artistas, y distingue lo que estás viendo de lo que estás interpretando.

La salida a la Serranía permite trabajar geografía física. Ciudad Encantada y torcas de Palancares y Tierra Muerta se mencionan dentro de un paisaje kárstico. Escribe una pregunta para cada forma: una sobre el aspecto del terreno y otra sobre los procesos que podrían explicar una forma kárstica. La actividad no exige poner nombres técnicos sin apoyo; enseña a mirar, describir y preparar una investigación posterior con un objetivo claro. El Hosquillo y los senderos junto a los ríos amplían el mapa de observación hacia bosque, agua y movimiento.

Termina con paleontología. Las Hoyas es un yacimiento del Cretácico inferior relacionado con fósiles de plantas, animales y Concavenator; el Museo de Paleontología de Castilla-La Mancha ayuda a conectar esos restos con una lectura pública de la ciencia. Dibuja una cadena de cuatro términos: paisaje actual, yacimiento, fósiles y museo. Después pregunta cómo puede un museo ayudar a interpretar un territorio que no se comprende solo con mirarlo. Así, una visita a Cuenca se convierte en un pequeño trabajo interdisciplinar y no en una acumulación de fotografías.

## [practical] Preparar una visita de aprendizaje responsable
- Confirma con antelación horarios, reservas, precios y accesibilidad de museos, monumentos y espacios naturales. Son datos variables que deben verificarse antes de asignar actividades a un grupo.
- Lleva un cuaderno de campo con cuatro apartados: paisaje, historia, arte y ciencia. Anota observaciones junto a preguntas, sin convertir lo no confirmado en un hecho.
- Separa la exploración del casco de cualquier salida a la Serranía. Esto permite dedicar atención a los conceptos y adaptar el trabajo exterior a las condiciones reales del día.
- Si el programa coincide con una celebración cultural, confirma su fecha y características actuales antes de usarla como actividad. La Semana Santa, las Turbas y la música religiosa son temas de estudio, no un calendario garantizado.
- Revisa el acceso y las condiciones vigentes antes de considerar caminar, bicicleta o piragua. La guía reconoce esas posibilidades en el entorno, pero no fija recorridos, duración ni dificultad.

## [risks] Límites que deben actualizarse antes de una salida
La información disponible no determina cómo llegar, qué transporte usar, cuánto duran las visitas, cuánto cuestan, si necesitan reserva o qué accesibilidad tiene cada lugar. Tampoco permite prometer una actividad concreta en la Serranía o junto a los ríos. Una buena planificación educativa debe confirmar cada uno de esos aspectos con información vigente antes de convertir la guía en un itinerario de grupo.

En los espacios al aire libre, las condiciones pueden variar y no hay indicaciones específicas suficientes para fijar riesgos, dificultad o temporada. Mantén un programa adaptable, define alternativas culturales dentro de la ciudad y usa la salida natural solo cuando las condiciones confirmadas lo permitan. La prudencia no resta valor didáctico: enseña que comprender un lugar también implica preparar la visita con responsabilidad.`,
  },
} as const

type Profile = keyof typeof ENTRIES
const environment = readLocalSupabaseEnvironment()
const client = createClient(environment.url, environment.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
const versioning = new SupabaseRealEditorialLibraryVersioningRepository(client)
const drafts = new RealEditorialLibraryVersionDraftApplicationService(versioning, versioning, versioning)
const decisions = new RealEditorialLibraryVersioningService(versioning)
const entries = await new SupabaseRealEditorialPilotRepository(client).listLibraryEntries({ destination: 'Cuenca', origin: 'real_editorial_pilot' })
const assessments = Object.fromEntries((['adventure', 'student'] as const).map(profile => [profile, assertContentNotTooThin({ profile, ...CONTENT[profile], evidence: EVIDENCE, sourceLimited: false })])) as Record<Profile, ReturnType<typeof assertContentNotTooThin>>
assertProfilesDifferentiated(CONTENT.adventure, CONTENT.student)

const approved = await Promise.all((['adventure', 'student'] as const).map(async profile => {
  const versionId = await createDepthVersion(profile)
  await approveDepthVersion(profile, versionId)
  const current = await versioning.getCurrentApprovedVersion(ENTRIES[profile])
  assertPublicSafeLibraryDocument(current.title, current.content)
  const entry = entries.find(candidate => candidate.entryId === ENTRIES[profile])
  if (!entry) throw new Error(`Falta la entrada de Biblioteca ${profile}`)
  return { profile, current, entry, projected: projectLibraryEntryToTrawelEditorialProfile({ entry, currentApproved: current }, target()) }
}))
const handoff = prepareTrawelEditorialDeliveryV2({ target: target(), sources: approved.map(item => ({ entry: item.entry, currentApproved: item.current })) as [LibraryTrawelApprovedSource, LibraryTrawelApprovedSource] })
const visualState = emptyDestinationVisualContract(approved[0].entry.destination.canonicalId)
const visualV2Capability = projectDestinationVisualsForTrawel(visualState)
const ingressSecretAvailable = Boolean(process.env.TRAWEL_INGRESS_SECRET?.trim())

console.log(JSON.stringify({
  operation: 'cuenca_editorial_depth_and_profile_differentiation_062',
  evidenceAvailable: { validClaims: EVIDENCE.validClaimCount, themes: EVIDENCE.thematicAreas.length, namedPlaces: EVIDENCE.namedPlaces.length },
  policy: { publicSafe: 'PASS', contentTooThin: 'NO', profileDifferentiation: 'PASS', sourceLimited: 'NO' },
  profiles: approved.map(item => ({ profile: item.profile, wordCount: assessments[item.profile].wordCount, sectionsWithContent: assessments[item.profile].sectionsWithContent, developedThemes: assessments[item.profile].developedThemes, rawInternalMarkersVisible: countInternalMarkers(item.current.content), markdownEscapedVisible: /\\(?:\*|_|`|\[|\]|#)/u.test(item.current.content) })),
  approved: approved.map(item => ({ profile: item.profile, libraryEntryId: item.current.libraryEntryId, versionId: item.current.versionId, revisionId: item.current.revisionId, approvalDecisionId: item.current.approvalDecisionId, versionHash: item.current.versionHash, contentHash: item.current.contentHash })),
  handoff: { ready: true, mappingId: handoff.mappingId, canonicalDestinationId: handoff.canonicalDestinationId, handoffKey: handoff.handoffKey, payloadFingerprint: handoff.payloadFingerprint, ingressSecretAvailable, delivery: ingressSecretAvailable ? 'NOT_SENT:OUT_OF_SCOPE' : 'NOT_SENT:TRAWEL_INGRESS_SECRET_MISSING' },
  visualContract: { imageSlot1: visualState.imageSlot1.state, imageSlot2: visualState.imageSlot2.state, unchanged: true, v2Compatible: visualV2Capability.imageSlot1.state === 'EMPTY' && visualV2Capability.imageSlot2.state === 'EMPTY' },
  cost: { tavily: 0, openai: 0, deepseek: 0, total: 0, phases: [{ phase: 'editorial_depth_reuse', provider: 'none', model: 'none', inputTokens: 0, outputTokens: 0, cost: 0 }] },
}, null, 2))

async function createDepthVersion(profile: Profile): Promise<string> {
  const current = await versioning.getCurrentApprovedVersion(ENTRIES[profile])
  const detail = current.versionId === null ? null : await versioning.getVersionDetail(current.versionId)
  if (
    detail?.state.effectiveState === 'approved'
    && detail.currentRevision.title === CONTENT[profile].title
    && detail.currentRevision.content.trimEnd() === CONTENT[profile].content.trimEnd()
  ) return detail.version.versionId
  const expectedHeadHash = detail?.decisions.at(-1)?.decisionTargetHash
  if (!expectedHeadHash) throw new Error(`Falta la cabecera aprobada de ${profile}`)
  const result = await drafts.createDraft({ libraryEntryId: ENTRIES[profile], expectedHeadHash, title: CONTENT[profile].title, content: CONTENT[profile].content, changeSummary: 'editorial_depth_and_profile_differentiation: reutiliza evidencia durable válida con cuerpo público rico y perfiles diferenciados.', actorId: MANUAL_LOCAL_ACTOR_ID, operationKey: key(`investighost:062:cuenca:${profile}:editorial_depth:v1`) })
  if (result.status !== 'ok') throw new Error(`No se pudo crear la revisión enriquecida de ${profile}: ${result.code}`)
  return result.version.versionId
}

async function approveDepthVersion(profile: Profile, versionId: string): Promise<void> {
  let detail = await versioning.getVersionDetail(versionId)
  if (detail.state.effectiveState === 'approved') return
  if (detail.state.effectiveState !== 'draft') throw new Error(`La revisión enriquecida de ${profile} no está en draft`)
  for (const item of (await versioning.getEffectiveVersionFindings(versionId, detail.currentRevision.id)).items) {
    if (!item.isBaseline) continue
    const state = await versioning.getVersionStateSnapshot(versionId)
    const reconciled = await decisions.reconcileFindings({ versionId, revisionId: detail.currentRevision.id, expectedState: 'draft', expectedRevisionHash: detail.currentRevision.revisionHash, expectedTraceabilityHash: state.traceabilityHash, finding: { findingKey: item.findingKey, sourceFindingType: item.sourceFindingType, sourceFindingId: item.sourceFindingId, origin: item.origin, disposition: 'accepted_risk', claimRelation: item.claimRelation, supportStatus: item.supportStatus, subjectText: item.subjectText, diffAnchor: null, claimIds: item.claimIds, evidenceReferences: item.evidenceReferences, sourceIds: item.sourceIds, editorDeclaration: 'editorial_depth_and_profile_differentiation: se conserva trazabilidad heredada fuera del cuerpo público.', justification: 'La revisión amplía únicamente la explicación y organización de hechos ya respaldados; no incorpora investigación ni hechos nuevos.' }, createdByActorId: MANUAL_LOCAL_ACTOR_ID, operationKey: key(`investighost:062:cuenca:${profile}:reconcile:${item.findingKey}`) })
    if (reconciled.status !== 'ok') throw new Error(`No se pudo reconciliar ${profile}/${item.findingKey}`)
  }
  detail = await versioning.getVersionDetail(versionId)
  const beforeSubmit = await versioning.getVersionStateSnapshot(versionId)
  const submitted = await decisions.submitForReview({ versionId, revisionId: detail.currentRevision.id, expectedState: 'draft', expectedRevisionHash: detail.currentRevision.revisionHash, expectedTraceabilityHash: beforeSubmit.traceabilityHash, reason: 'editorial_depth_and_profile_differentiation: revisión factual, pública y de profundidad confirma uso completo de la evidencia durable disponible.', actorId: MANUAL_LOCAL_ACTOR_ID, operationKey: key(`investighost:062:cuenca:${profile}:submit:v1`) })
  if (submitted.status !== 'ok') throw new Error(`No se pudo enviar ${profile} a revisión`)
  const review = await versioning.getVersionStateSnapshot(versionId)
  if (!review.aggregateHash) throw new Error(`Falta el hash de decisión para ${profile}`)
  const acceptedRiskFindingKeys = (await versioning.getEffectiveVersionFindings(versionId, detail.currentRevision.id)).items.map(item => item.findingKey).sort()
  const decision = await decisions.decideVersion({ versionId, revisionId: detail.currentRevision.id, decisionType: 'approve', expectedPreviousState: 'ready_for_review', expectedDecisionTargetHash: review.aggregateHash, reason: 'editorial_depth_and_profile_differentiation aprobada: contenido público rico, prudente y diferenciado sin trazas internas visibles.', actorId: MANUAL_LOCAL_ACTOR_ID, affectedFindingKeys: [], changeInstructions: [], acceptedRiskFindingKeys, separationOfDutiesException: true, separationOfDutiesReason: 'Operador local autorizado aprueba la revisión tras validación factual, pública, de profundidad y diferenciación de perfiles.', operationKey: key(`investighost:062:cuenca:${profile}:approve:v1`) })
  if (decision.status !== 'ok') throw new Error(`No se pudo aprobar ${profile}`)
}

function target() { return { sourceMappingId: 'zone:espana:cuenca', canonicalDestinationId: 'investighost:zone:espana:cuenca', entityType: 'zone' as const, entitySlug: 'cuenca', countrySlug: 'espana', zoneSlug: 'cuenca' } }
function key(value: string): string { return createHash('sha256').update(value).digest('hex') }
function countInternalMarkers(content: string): number { return [/(?:\(c\d+\)|\bg\d+\b|\b(?:expediente|dossier)\b|claimId|evidenceId|gapId)/giu].reduce((count, pattern) => count + (content.match(pattern)?.length ?? 0), 0) }
function readLocalSupabaseEnvironment(): { url: string; serviceRoleKey: string } { const output = execSync('npx supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); const url = output.match(/^API_URL="?([^\r\n"]+)/m)?.[1]; const serviceRoleKey = output.match(/^SERVICE_ROLE_KEY="?([^\r\n"]+)/m)?.[1]; if (!url || !serviceRoleKey) throw new Error('Supabase local no expuso credenciales de servicio'); return { url, serviceRoleKey } }
