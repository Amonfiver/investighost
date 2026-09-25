# Investighost Content Factory V1 — estado canónico

> Antes de cualquier prompt estructural de Investighost, leer este documento primero. Reauditar únicamente componentes cuya implementación haya cambiado o no esté documentada.

**Actualizado:** 2026-09-26
**Referencia de partida:** `d253f32739ff13b9b17f9d929a2664c022cce436` en `feat/investighost-real-pipeline`; los cambios estructurales posteriores se registran explícitamente en esta tabla.

## Objetivo de producto V1

Investighost transforma un JSON de destinos en resultados editoriales y visuales revisables:

`importación → identidad/dedupe → jobs durables → research → análisis → Student + Adventure → visuales → revisión automática → revisión humana → aprobación → exportación / entrega a Trawel`.

La primera meta operativa es un lote de 10 destinos; la misma arquitectura debe admitir 50 sin rediseño. Investighost es la autoridad editorial y de derechos. Trawel consume, almacena/expone su media pública y presenta; no investiga, no decide derechos ni aprueba editorialmente.

## Decisiones cerradas — no reabrir

- **Library es la frontera editorial:** `candidate/revision → approval → currentApproved → delivery`; conserva identidad, hashes, historial y trazabilidad.
- **Student** es `ENCYCLOPEDIC + ELEGANT + NON_TRAVEL + NON_SCHOOLISH`: explica el destino sin presuponer viaje, estancia ni presencia física.
- **Adventure** invita a viajar: es útil, selecciona y recomienda; no duplica la enciclopedia Student.
- **PUBLIC_SAFE**, profundidad, diferenciación de perfiles, legibilidad y escaneabilidad se validan antes de `currentApproved`.
- Las llamadas de proveedores usan routing, presupuestos, ledger durable e idempotencia; no se deben volver a investigar evidencias válidas sin necesidad.
- **Visuales:** rights fail-closed. `UNKNOWN`, `PENDING` y `REFERENCE_ONLY` nunca son publicables. Investighost decide significado, selección, crédito, provenance y uso público.
- La URL HTTPS pública final de media pertenece a la infraestructura de Trawel en la entrega aprobada. Investighost no necesita operar un host público propio; su storage local es staging/provenance, no la autoridad runtime final.
- Handoff V2 conserva outbox, snapshot inmutable, fingerprint, idempotencia, retries y trazabilidad por perfil. No introducir heurísticas editoriales en Trawel.
- `ONE_DESTINATION_ONE_RESEARCH_CORPUS = TRUE`. Student, Adventure y planificación visual parten de la misma evidencia durable; Adventure no deriva de Student. Una segunda llamada a Tavily sólo puede responder a un gap concreto, nunca repetir investigación completa del destino.
- `STUDENT_DOCUMENT_V1 = TARGET_CONTRACT`. `INVESTIGHOST_OWNS_STUDENT_COMPOSITION = TRUE`, `TRAWEL_DOES_NOT_RECOMPOSE_STUDENT = TRUE`, `STUDENT_VARIABLE_LENGTH = TRUE`, `STUDENT_OPTIONAL_BLOCKS = TRUE` y `NO_EMPTY_EDITORIAL_BLOCKS = TRUE`.
- `ADVENTURE_TARGET = HERO + ADVENTURE + DESTINATION_VISUAL_STORY + PLACES_TO_GO`. Investighost decide el contenido, el orden, los assets, las captions y los derechos; Trawel recibe un package coherente y renderiza pasivamente (`TRAWEL_IS_PASSIVE_RENDERER = TRUE`).

## 085D — preparación para el contrato canónico de Trawel

Esta sección fija el destino de la extensión. No habilita una entrega, no llama proveedores y no sustituye el contrato V2 extendido por una V3. El contrato de Trawel es una entrada fija: Investighost debe preparar y aprobar un único package que contenga `DESTINATION_IDENTITY`, `STUDENT`, `ADVENTURE`, `HERO`, `DESTINATION_VISUAL_STORY`, `PLACES_TO_GO`, `MEDIA`, `CAPTIONS_MICROCOPY` y las identidades de versión aprobadas. No cruzan la frontera corpus, prompts, razonamiento, candidatos, rechazos, URLs temporales ni decisiones internas.

### Mapa factual actual → target

| Componente | Estado actual comprobado | Clasificación 085D | Extensión necesaria |
|---|---|---|---|
| Research | `ControlledRealWorkflow` conserva `RealResearchDossier` (fuentes con contenido), evidencia y `RealMasterKnowledge` en `master_knowledge/final`; Tavily trabaja en hasta dos rondas gobernadas y la segunda sólo nace de un gap analizado. | NEEDS_EXTENSION | Taxonomía/coverage explícita de identidad, cultura, visual entities y gaps de `STAY/EAT/DRINK/NIGHTLIFE`; conservar el corpus único como input formal de Student, Adventure y visual planning. |
| Analysis | DeepSeek analiza cada ronda, crea knowledge/coverage/gaps y gobierna la investigación focalizada. | ALREADY_ALIGNED | Exponer una planificación común que materialice los intents y gaps del contrato, sin crear un análisis paralelo. |
| Student | Runtime real entrega `IntelligenceDraft` con `title`, `content` y `schemaVersion`; el generador histórico persiste `EditorialDraft + EditorialSection` V2 con plantilla fija. Library versiona texto/revisión. | LEGACY_TO_REPLACE | Adaptador/versionado durable a `student-document-v1`: `headline`, `lead[]`, `blocks[]` ordenados, `FIGURE`, referencias y trazabilidad de assets; mantener lectura de historial V2. |
| Adventure | Runtime real entrega un `IntelligenceDraft` textual y Library lo versiona. | NEEDS_EXTENSION | Documento/copy Adventure estructurado y package `HERO + ADVENTURE + DESTINATION_VISUAL_STORY + PLACES_TO_GO`; no deriva de Student. |
| Visuales | Paquete durable con candidates, rights fail-closed, staging, checksum y selecciones `hero/highlight/gallery` por modo. | NEEDS_EXTENSION | Intents concretos desde contenido, mapping a Hero/Visual Story/Figures/Places, aprobación de media y copy únicamente después de seleccionar asset. |
| Places | `ResearchPlace` es genérico y no expresa las cuatro categorías ni el item final del consumidor. | MISSING | Modelo evidence-backed y selección final `STAY/EAT/DRINK/NIGHTLIFE`; supplemental research focalizado sólo para el gap de categoría. |
| Review | Mesa de lote enseña Student, Adventure, paquete visual, warnings y trazabilidad; aprobar exige ambas revisiones, visual package y auto-review. | NEEDS_EXTENSION | Mostrar/revisar explícitamente StudentDocument, Hero, Visual Story, Places, media y package atómico antes de aprobar. |
| Library | Candidate/revision/approval/currentApproved son durables; el batch crea candidates y su aprobación usa Library. | NEEDS_EXTENSION | Versionar cada componente estructurado y vincularlo a la misma aprobación/package; conservar el historial textual existente. |
| Handoff | V2 actual proyecta dos perfiles textuales y una colección visual anterior; tiene outbox e idempotencia. | LEGACY_TO_REPLACE | Conservar V2 extendido como envelope y añadir la proyección exacta de los ingredientes/IDs ya aprobados, después del upload de media; no ejecutar delivery en esta fase. |

### Research corpus y routing

El flujo de lote actual es `IDENTITY → RESEARCH → ANALYSIS → STUDENT → ADVENTURE → VISUALS → AUTO_REVIEW`. `RESEARCH` persiste el resultado gobernado en `master_knowledge/final`; `ANALYSIS` reutiliza ese artefacto y no abre una llamada independiente. Student y Adventure cargan ambos ese mismo artefacto y pasan su `masterKnowledge` al motor DeepSeek. El delegate visual actual **no** consume el corpus: formula consultas genéricas por categoría/rol con el nombre del destino. Por tanto, `STUDENT_READS = master_knowledge/final`, `ADVENTURE_READS = master_knowledge/final`, `VISUAL_PIPELINE_READS = destination identity + generic category/role`.

El corpus durable ya retiene fuentes con URL, título, publisher, fecha, hash y contenido, evidencia vinculada a fuentes, knowledge claims, coverage, contradicciones y gaps. Es suficiente como base durable, pero sus categorías actuales no garantizan cobertura formal de todos los ingredientes de Trawel ni de entidades de búsqueda visual. El siguiente cambio debe ampliar el análisis/coverage y no crear un corpus gigante ni una segunda ruta Tavily. Gaps admisibles incluyen `MISSING_STAY_EVIDENCE`, `MISSING_EAT_EVIDENCE`, `MISSING_NIGHTLIFE_EVIDENCE` y `MISSING_VISUAL_ENTITY_EVIDENCE`.

### Contratos target que deben implementar los adaptadores

- **StudentDocumentV1:** `version: "student-document-v1"`, `headline`, `lead[]` y `blocks[]` autoritativo. Los únicos bloques iniciales son `PARAGRAPH`, `HEADING`, `FIGURE`, `LIST`, `KEY_FACTS`, `CALLOUT`, `TIMELINE` y `REFERENCES`. `FIGURE` sólo entra después de seleccionar un asset aprobado y conserva `assetId`, placement `INLINE|WIDE`, alt y caption opcional. No se rellenan bloques vacíos ni se impone longitud fija.
- **Adventure:** copy breve visual-first, selectivo y evidence-backed, más Hero (`heroAssetId`, title, shortCopy, `presentationTone`, `textPlacement`, kicker/caption/CTA opcionales), un único `DESTINATION_VISUAL_STORY` ordenado y un único `PLACES_TO_GO` ordenado.
- **Places:** item final con `category` `STAY|EAT|DRINK|NIGHTLIFE`, nombre, orden, descripción, razón, y sólo los opcionales aprobados (área, asset, caption, tono, dirección, URL, coordenadas). No se inventan establecimientos ni zonas.
- **Media/copy:** antes del handoff, cada asset debe tener bytes, checksum, MIME, dimensiones, alt, crédito, fuente, licencia, rights status `APPROVED_FOR_PUBLIC_USE` y focal point opcional. Captions, alt contextual, short copy y CTA se generan después de la selección concreta.
- **Handoff V2 extended:** subir primero media aprobada al endpoint interno de Trawel, recibir `trawelMediaId`, y sólo entonces construir el payload V2 que referencia esos IDs y las revisiones `CURRENT_APPROVED` del mismo package. La preparación será idempotente y atómica; no se entrega media ni destinos reales durante 085D.

### Redo y R7

Los scopes `STUDENT`, `ADVENTURE`, `VISUALS` y `EDITORIAL` conservan research/análisis y sólo invalidan sus artefactos dependientes. La implementación actual propaga guidance y una instrucción de variación, preserva la revisión previa y añade `REDO_OUTPUT_TOO_SIMILAR_TO_PREVIOUS` cuando la superposición léxica alcanza el umbral. Esto es un warning de auto-review, no un gate que fuerce una salida materialmente distinta.

`VERY_DIFFERENT_IMPLEMENTED = PARTIAL` (guidance, estrategia y warning); `VERY_DIFFERENT_TESTED = PARTIAL` (contrato unitario y smoke durable determinista que espera el warning); `VERY_DIFFERENT_HUMAN_SMOKE = NOT_RECORDED`; `R7_IMPLEMENTED = NO`, `R7_TESTED = NO`, `R7_SMOKE_APPROVED = NO`. Sigue abierto el gap: hacer que `VERY_DIFFERENT_IS_A_CONSTRAINT_NOT_A_SUGGESTION = TRUE`, con criterio medible/gate y smoke humano aprobado, sin mezclarlo accidentalmente con el cambio de contrato Trawel.

### 085E — incremento vertical estructurado

`src/shared/structured-editorial-package-contracts.ts` implementa los contratos internos validados para `StudentDocumentV1`, bloques ordenados, figure `INTENT|RESOLVED`, `AdventurePackageV1`, Hero, Visual Story único, Places, visual intents, gaps focalizados y contexto de captions post-selección. `structured-visual-intent-adapter.ts` traduce esos intents al request existente de Wikimedia sin buscar, seleccionar ni relajar derechos. Ningún schema obliga longitud, headings, figuras, referencias o categorías sin evidencia; sí rechaza bloques vacíos, Places sin evidencia, órdenes duplicados, intents huérfanos y packages aprobados con media pendiente.

`StructuredEditorialPackageV1` es un snapshot coherente de una ejecución/destino y referencia las revisiones reales Student y Adventure de Library. `StructuredEditorialPackageArtifactService` lo guarda versionado y append-only como `editorial_package/structured/v1` en los artifacts existentes; la migración `20260926090000_structured_editorial_package_v1.sql` añade únicamente los tipos de artifact necesarios. No altera, convierte ni borra el historial textual de Library. El read model de Review Desk conoce el package estructurado y lo expone como metadata de revisión; la aprobación atómica del package y el reemplazo del generador textual quedan pendientes.

El boundary `composeStructuredEditorialPackage` exige nombrar el mismo `masterKnowledgeArtifactId` común. No ejecuta providers ni contiene lógica de destino. La ejecución real continúa produciendo drafts textuales hasta `COMPLETE_STRUCTURED_GENERATION`; por ello `STRUCTURED_CONTRACTS = DONE`, `STRUCTURED_DURABILITY = DONE`, `REVIEW_PACKAGE_AWARENESS = PARTIAL`, `LIBRARY_STRUCTURED_CURRENT_APPROVED = PENDING`, `STRUCTURED_GENERATION_RUNTIME = PENDING`, `MEDIA_INGRESS = PENDING` y `HANDOFF_V2_EXTENDED = PENDING`.

## Lo construido y su estado

| Área | Estado | Hecho comprobado | Falta para factory V1 |
|---|---|---|---|
| Identidad geográfica | DONE | Resolución, snapshots y contratos durables; Cuenca tiene identidad canónica. | Reutilizada por el importador cuando el país se puede canonizar. |
| Research real | PARTIAL | Tavily, sources, evidence, rondas, ledger, recuperación y pipeline real de piloto. `generic-real-editorial-execution.ts` aporta contexto/mission/metadata sin enum; `real_editorial_executions` permite owner durable `BATCH_JOB`. | Ejecutar las rondas reales por fase sobre ese owner. |
| Analysis | PARTIAL | Routing DeepSeek, outputs durables, costes y recuperación de análisis; metadata y artifacts soportan owner-neutral. | Separar el executor monolítico por fases sin duplicar providers. |
| Student | PARTIAL | Canon, bloques V2, gates y versiones aprobadas de referencia. | Generación/regeneración genérica desde un job de lote. |
| Adventure | PARTIAL | Generación, gates, Library y revisiones aprobadas de referencia. | Generación/regeneración genérica desde un job de lote. |
| Revisión automática | PARTIAL | Quality review, PUBLIC_SAFE y gates de estructura/editorial. | Política única de “ready for human review” y corrección automática acotada. |
| Library/currentApproved | DONE | Repositorios Supabase, versiones, comparación, aprobación, hashes y paginación. | Filtros y vistas de operación por lote. |
| Handoff textual V2 | DONE | Payload saneado, outbox durable, replay/idempotencia, retry y deliveries por perfil. | Acción por lote y pantalla de estado. |
| Descubrimiento visual | DONE | Adapter Wikimedia Commons, candidatos durables, metadata, autor≠uploader y clasificación de licencias. | Ejecutarlo desde job de lote y exponerlo a revisión humana. |
| Rights y selección visual | DONE | Fail-closed, quality gates, selección determinista hero/highlight/gallery, checksum y package contracts. | Puente de media aprobada hacia storage HTTPS de Trawel. |
| Storage visual local | DONE FOR REVIEW | Staging privado, SHA-256, dedupe y package `PENDING/PARTIAL` para revisión humana sin URL pública. | No usar su URL HTTP como media pública; adaptar promoción/entrega al receptor media de Trawel. |
| Revisión humana | PARTIAL | UI individual para Library/piloto: leer, aprobar, pedir cambios y reabrir. | Mesa de lote, visuales, redo selectivo, bulk approve y delivery. |
| Importación de contribuciones | DONE / NO REUSE DIRECT | Batches, jobs, retry y repositorio Supabase para contribuciones remotas. | Sigue siendo un patrón separado, no la cola editorial. |
| Importación JSON de destinos | DONE | JSON V1 hasta 50 filas, errores por fila, fingerprint estable e IPC/UI de importación. | El worker editorial del siguiente paso. |
| Batch identity y dedupe | DONE | `editorial_destination_batches`, fingerprint de multiset, normalización, dedupe interno y lookup de Library/delivery/jobs activos. | Resolución humana de ambigüedad en la futura mesa. |
| Cola editorial de lote | DONE | `EditorialBatchWorker` reclama un job con lease durable, procesa una sola concurrencia y persiste fase, artefactos, intentos, error y coste. | Conectar la composición autorizada de servicios reales antes del smoke pagado. |
| Retry y resume | DONE | Reintento conserva la fase; fases completadas no se repiten y los leases stale vuelven a `QUEUED`. | Redo selectivo de producto en la mesa humana. |
| Exportación JSON | MISSING | Existen contratos serializables y snapshots de handoff. | Exportador V1 de lote y UI. |

## Arquitectura vigente

### Editorial y durabilidad

- `src/modules/real-pipeline/`: pipeline real duradero, research/análisis, preflight, budgets, ledger, recuperación y persistencia de piloto.
- `src/modules/editorial-pipeline/`: generación de perfiles y quality review.
- `src/modules/library-versioning/`: versiones, sanitización pública, comparación, decisiones y `currentApproved`.
- `src/modules/trawel-handoff/`: proyección V2, outbox/delivery durable, repositorios Supabase y reconciliación.
- `src/modules/contributions/`: patrón reutilizable de batch/job/retry; no es la cola editorial de destinos.

El runtime real actual es **single-pilot first**: políticas fijadas a pilotos, concurrencia `1`, regeneraciones/publicaciones bloqueadas en preflight y sin worker de batch editorial. Sus contratos de coste sí contienen ámbitos task/batch/day, por lo que se reutilizan al crear el lote verdadero.

La extracción 084B abrió una frontera compartida en
`src/modules/real-pipeline/generic-real-editorial-execution.ts`:
`GenericEditorialDestination`, `GenericRealEditorialExecutionContext`, misión
y metadata de ledger owner-neutral, además de una API por fase. El adaptador de
piloto conserva el comportamiento de Morella, Albarracín y Cuenca. **No está
terminada todavía la ejecución real de un `BATCH_JOB`:** los artifacts,
checkpoints y reservas Supabase siguen con FK `pilot/run`, y el workflow actual
itera research+analysis dentro de una ejecución monolítica. No registrar
fixtures como delegates de runtime ni simular proveedores para salvar este
gap.

084C añadió la migración `20260923120000_generic_real_editorial_execution_v1.sql`:
`real_editorial_executions` identifica un owner `PILOT | BATCH_JOB`; los
artifacts, reservations y provider calls existentes admiten ese owner mediante
`execution_owner_id`, con checks que impiden mezclarlo con el scope histórico
`pilot/run`. El adapter Supabase asociado reutiliza las mismas tablas y RPCs de
ledger; un smoke transaccional local verificó artifact, reserva, inicio y
conciliación para `BATCH_JOB` y revirtió sus filas. Aún falta mover el executor
real phase-addressable sobre esa persistencia y conectarlo al runtime del
worker. Hasta entonces el runtime debe continuar fail-closed.

La primera extracción de 084D hizo explícitas las fronteras del core de
redacción: `FullRealEditorialPipeline` expone research, analysis, Student,
Adventure y review; `execute()` conserva el wrapper de compatibilidad para los
pilotos. Research mantiene intencionadamente su ciclo gobernado de
research+analysis por rondas: el análisis determina si se autoriza una segunda
consulta, por lo que no se duplica ni se convierte en una llamada independiente
sin checkpoint. Student y Adventure se pueden ejecutar de forma independiente
con motores enrutables por etapa y su replay conserva los operation keys. Esto
**no cierra aún** el batch real: falta adaptar la persistencia de perfiles y el
transfer a Library, que actualmente sólo crea entradas a partir de un piloto ya
aprobado. Los delegates de producción siguen fail-closed hasta que esa frontera
compartida exista.

084E abrió esa frontera sin crear otra Library: las migraciones
`20260923130000_shared_library_batch_candidates_v1.sql` y
`20260923140000_library_versioning_batch_candidate_origin_v1.sql` permiten un
origen inmutable `real_editorial_batch_job` en
`real_editorial_library_entries`. El servicio
`BatchSharedLibraryTransition` crea dicho origen y aplica el mismo comando
normal de versionado para obtener `libraryEntryId`, `versionId` y `revisionId`.
No crea `currentApproved`, no publica y conserva el linaje
`BATCH_JOB → execution → artifact → Library`. La rama de pilotos preserva su
hash de origen y sus validaciones históricas. Falta conectar el executor real
phase-addressable a esa transición antes de registrar delegates de producción.

084G añadió `DurableGenericRealEditorialExecution`: un executor concreto
owner-neutral que compone el workflow real gobernado, `FullRealEditorialPipeline`,
el ledger genérico y los artifacts/checkpoints de `real_editorial_executions`.
Sus fases `RESEARCH`, `ANALYSIS`, `STUDENT`, `ADVENTURE` y `REVIEW` reutilizan
la misma lógica de providers, perfiles y revisión; para `BATCH_JOB` materializa
Student y Adventure mediante `BatchSharedLibraryTransition`, sin crear
`currentApproved`. El loop gobernado se conserva: `RESEARCH` completa sus
rondas de retrieval+analysis y `ANALYSIS` expone su resultado durable sin abrir
una segunda ruta de análisis. Esta clase no reemplaza todavía el adaptador de
pilotos histórico ni se ha registrado como delegate de producción: falta una
composición de runtime probada con providers reales configurados, el delegate
visual y un E2E durable del worker. El runtime continúa fail-closed hasta que
esa composición exista; no usar fixtures en producción.

084I añadió la capability separada
`INVESTIGHOST_REAL_BATCH_EXECUTION_TOKEN`. `LiveProviderAccessInput` distingue
ahora `ready_for_real_batch_execution` de los preflights de piloto y exige un
owner `BATCH_JOB` con job, lote, destino y policy; los tokens de piloto no se
aceptan para batch ni a la inversa. `BatchExecutionContextMapper` transforma
un job con geografía canónica en `GenericRealEditorialExecutionContext` usando
la policy genérica `factory-batch-real-v1` y los límites durables del lote.
El proceso principal registra automáticamente
`ProductionBatchEditorialPhasePort`: compone el executor owner-neutral, la
Library compartida y el adapter visual Wikimedia/staging. La capability y la
configuración del Provider Center se comprueban antes de obtener clientes o
hacer red; sin ellas falla cerrado.

084J verificó el camino durable completo en Supabase local con Granada y sin
red externa: el worker real y la composición de producción recorren
`IDENTITY → RESEARCH → ANALYSIS → STUDENT → ADVENTURE → VISUALS → AUTO_REVIEW
→ READY_FOR_REVIEW`. Los únicos doubles están en los bordes Tavily/inteligencia
y Wikimedia/bytes; repositories, ledger, executor owner-neutral, Library,
staging visual y review son los de producción. El harness comprueba retry desde
Adventure, reanudación desde Student en una nueva instancia, aislamiento con
concurrencia 1, presupuesto antes del provider, idempotencia, ausencia de
approval/delivery y la proyección de lectura por job. Por tanto
`BATCH_RUNTIME_COMPOSITION = DONE`, `BATCH_REAL_DELEGATES = DONE`,
`VISUAL_BATCH_DELEGATE = DONE`, `GRANADA_DURABLE_E2E = PASS` y
`READY_FOR_REVIEW_PIPELINE = DONE`.

085 añade la primera mesa humana operativa: Nueva investigación crea un batch
de un único destino, Lotes abre el detalle por job y la mesa lee las revisiones
pre-aprobación, el paquete visual y el auto-review. La aprobación humana usa
las transacciones existentes de Library para Student y Adventure y sólo
después cambia el job a `APPROVED`; no crea delivery. Adventure se presenta
visual-first con hero, highlights y galería, sin acoplar la UI a un proveedor.
El redo selectivo sigue pendiente: el executor durable reutiliza por diseño el
artifact de perfil existente y aún no expone una operación canónica de nueva
revisión/regeneración por perfil.

085A completó el flujo de navegación de producción: Nueva investigación reúne
destino individual y lote JSON; Producción/Lotes abre detalle de lote, cada
job abre su detalle operativo y los jobs `READY_FOR_REVIEW` enlazan a la mesa
humana sin efectos de ejecución. `BATCH_NAVIGATION_UI = DONE` y
`UNIFIED_NEW_INVESTIGATION_ENTRY = DONE`.

085B simplifica esa superficie sin cambiar el dominio: el menú diario muestra
Nueva investigación, Producción, Biblioteca y Proveedores; Contribuciones y
Pipeline real siguen disponibles como rutas internas, pero quedan fuera de la
navegación principal. Nueva investigación denomina el archivo como lote,
mantiene los presupuestos en opciones avanzadas y restringe el selector a
`.json`. La frontera de importación conserva la validación durable de JSON y
esquema antes de cualquier escritura, y muestra errores de usuario sin crear
lotes parciales. Estados, fases y costes se traducen sólo en presentación.
`USER_FACING_NAVIGATION_V1 = DONE`, `USER_FRIENDLY_STATUS_LABELS = DONE` y
`STRICT_BATCH_FILE_VALIDATION = DONE`.

085C añade el comando durable `requestRedo(jobId, scope)` sobre el mismo
worker batch y la misma ejecución owner-neutral. `STUDENT`, `ADVENTURE`,
`VISUALS` y `EDITORIAL` guardan la solicitud humana y sus referencias previas,
invalidan sólo checkpoints/refs del alcance y conservan investigación, análisis,
ledger, revisiones y paquetes históricos. Cada regeneración usa una identidad
de tarea propia para el ledger y checkpoints propios, sin repetir Research ni
Analysis. La transición `READY_FOR_REVIEW → REDO_REQUIRED → PROCESSING →
READY_FOR_REVIEW` es idempotente; aprobación y redo compiten sobre la misma
transición condicional. No hay aprobación ni delivery automáticos.
`SELECTIVE_REDO_V1 = DONE`, `REDO_STUDENT = DONE`, `REDO_ADVENTURE = DONE`,
`REDO_VISUALS = DONE`, `REDO_EDITORIAL = DONE` y
`APPROVE_REDO_EXCLUSION = DONE`.

085C-R fija la frontera de lectura de Biblioteca: el reader legado de
contenido aprobado consulta únicamente entradas `real_editorial_pilot` con
`approved_unpublished / approved / ready_for_library / unpublished` antes de
validar su contrato estricto. Los candidates y revisiones pre-aprobación de
`BATCH_JOB`, incluidos los de redo, se leen exclusivamente desde Producción,
Review Desk y los read models de versionado; no se convierten en aprobación ni
pueden tumbar la proyección aprobada. Los metadatos nulos que son legítimos en
`currentApproved.originV1` permanecen explícitos en ese contrato distinto.
`LIBRARY_VISIBLE = APPROVED_LEGACY_PROJECTION`; `currentApproved` sigue siendo
el read model de versionado para una línea de Library, y
`PREAPPROVAL = PRODUCTION_AND_REVIEW_DESK`.

085C-R2 incorpora una ayuda exclusiva de desarrollo para el smoke humano de
redo. Sólo una aplicación Electron no empaquetada, arrancada con
`INVESTIGHOST_FACTORY_SMOKE_MODE=true`, puede usar doubles deterministas y
sin red; además, el lote debe tener la marca durable interna `smoke_fixture`.
La composición normal continúa requiriendo la capability batch y no puede
usar ese camino para un job sin marca. El read model de revisión expone la
última operación de redo y su motivo para trazabilidad, mientras Producción
presenta feedback y fases humanas de rehacer. `SMOKE_MODE !=
PRODUCTION_AUTHORIZATION`.

Para un smoke local se siembra un fixture marcado con
`RUN_SUPABASE_INTEGRATION=true` y `KEEP_FACTORY_REDO_SMOKE=true` ejecutando el
caso `selectively redoes 'Student'` del E2E durable; después se arranca la
aplicación de desarrollo con `INVESTIGHOST_FACTORY_SMOKE_MODE=true`. Ninguna
de esas variables se usa en una aplicación empaquetada ni habilita un lote
normal.

085C-R6 mantiene el read model de Producción y el detalle de destino vivo
sólo mientras un job está en `REDO_REQUIRED` o `PROCESSING`: refresca cada
1,5 segundos y se detiene en un estado terminal, mostrando estado, intentos,
coste e incidencia durable sin navegación manual. Durante ese intervalo las
acciones incompatibles permanecen bloqueadas. El seed retenido por
`KEEP_FACTORY_REDO_SMOKE=true` usa un presupuesto finito de fixture (2 EUR por
destino y 4 EUR por lote) únicamente cuando el seed no recibe límites
explícitos; conserva ledger y gates, no afecta a lotes normales y no genera
gasto ni llamadas de providers reales.

085C-R4 formaliza que `REDO_MUST_NOT_BE_BLIND_RERUN = TRUE`. Toda solicitud
de redo puede persistir guidance estructurado por alcance, comentario y la
referencia de la revisión previa. Student, Adventure y Editorial reciben ese
contexto como `HUMAN_REDO_GUIDANCE` en el boundary real del generador, con una
política de variación centralizada que mantiene invariantes factuales; la
salida casi idéntica con variación muy distinta queda advertida en auto-review.
Visuales usa sus controles en descubrimiento, ranking, variedad y exclusión de
candidatos del paquete previo sin relajar derechos ni procedencia. Los
controles y la referencia anterior se proyectan en Trazabilidad sin exponer
parámetros de provider. `REDO_EDITORIAL_CONTROLS = REQUIRED`,
`REDO_REASON_AS_GENERATION_GUIDANCE = REQUIRED`,
`REDO_PREVIOUS_VERSION_CONTEXT = REQUIRED`, `REDO_VARIATION_POLICY = REQUIRED`,
`REDO_CONTROLS_PERSISTED = REQUIRED` y
`REDO_CONTROLS_VISIBLE_IN_TRACEABILITY = REQUIRED`.

### Visuales

- `src/shared/destination-visual-media-contract.ts`: assets, packages, roles, modos y rights status.
- `src/modules/visual-acquisition/`: Wikimedia, candidatos, selección, descarga/validación, staging, checksum, dedupe y promoción.
- Migraciones visuales 074–077 ya aplicadas localmente; buckets locales `visual-staging-private` (privado) e `images-approved` (público) existen para desarrollo.
- El asset aprobado actual exige URL HTTPS. La ruta local de Supabase era HTTP, por lo que el E2E real de Cuenca no se ejecutó: fue una parada correcta, no un fallo de rights.

La orientación correcta para V1 es mantener candidates, rights, selección y provenance en Investighost. `prepareDestinationForHumanVisualReview` deja bytes y metadata en staging privado con package `PARTIAL`; no atribuye `APPROVED_FOR_PUBLIC_USE` ni URL pública. El paso posterior de promoción/handoff permitirá que Trawel almacene el byte aprobado y devuelva/registre su URL HTTPS estable. No se debe usar la URL HTTP local ni crear hosting alternativo en Investighost.

## Qué conservar, adaptar y no usar del Visual Bridge 074–077

| Decisión | Elementos |
|---|---|
| KEEP | Modelo de asset/package, roles `HERO/HIGHLIGHT/GALLERY`, modos Adventure/Student/BOTH, candidates Commons, licencia normalizada, autor real, quality gates, staging privado, byte validation, SHA-256/dedupe, selección determinista, provenance y payload saneado. |
| ADAPT | La promoción `images-approved → publicUrl HTTPS`, `APPROVED` y package final: deben completarse contra el flujo autorizado de media de Trawel, preservando asset/checksum/rights/selection e idempotencia. También hace falta una vista humana de hero/highlights/gallery y redo selectivo. |
| DO NOT USE | `getPublicUrl` HTTP local como URL canónica, signed URLs efímeras, hosting manual por destino, deploy de frontend por destino, o cualquier bypass de rights para completar cuota visual. |

## Estados de producto que debe introducir el batch

Cada destino tendrá un job independiente: `QUEUED → RESEARCHING → ANALYZING → WRITING → VISUALS → AUTOMATIC_REVIEW → READY_FOR_HUMAN_REVIEW → APPROVED → DELIVERING → DELIVERED`, con `REDO_REQUIRED` y `FAILED` como salidas recuperables. Los nombres definitivos pueden variar, pero cada estado debe guardar fase, intento, error, timestamps, coste y artefactos reutilizables.

Un fallo nunca debe detener otros jobs. La concurrencia inicial recomendada es **1**; subir a **2–3** solo tras el smoke de 10 destinos y respetando presupuestos/rate limits.

## Gaps que bloquean Factory V1, en orden

1. **Alinear el modelo editorial interno al contrato V2 extendido de Trawel.** Introducir los adapters/versiones durables de StudentDocumentV1, Adventure package, Hero, Visual Story y Places sin perder historial textual ni crear un pipeline paralelo.
2. **Planificación visual evidence-backed.** Sustituir las consultas genéricas por intents concretos derivados de corpus/análisis y mapear selecciones existentes a figures, Hero, Visual Story y Places.
3. **Places con evidencia y gaps focalizados.** Modelar y revisar los cuatro cajones cerrados; las únicas nuevas llamadas Tavily permitidas son las de una carencia categorizada, no una investigación completa repetida.
4. **Package approval y media ingress.** Ampliar Review Desk y Library para aprobar la composición completa; después implementar el upload idempotente de bytes aprobados y la referencia `trawelMediaId` antes del handoff V2.
5. **VERY_DIFFERENT R7.** Convertir el warning actual en una restricción/gate verificable y cerrar su smoke humano como trabajo separado o explícitamente secuenciado.

## Contratos mínimos pendientes

### JSON de entrada

```json
{
  "batch": { "name": "España - 50 destinos turísticos" },
  "destinations": [
    { "name": "Granada", "country": "España", "region": "Andalucía" }
  ]
}
```

El import debe producir: recibidos, nuevos, duplicados exactos, reutilizables/actualizables y ambiguos. No recibe investigación del usuario.

### JSON de exportación V1

Versión, metadata de lote, identidad por destino, estado/fase/intentos, Student/Adventure aprobados o revisión actual, paquete visual y selecciones, warnings/review, fuentes públicas permitidas, coste/ledger resumido y delivery status. Excluir secretos, tokens, prompts privados, raw metadata de provider y notas internas de rights.

### Media aprobada hacia Trawel

El siguiente diseño debe cerrar un único contrato idempotente: Investighost entrega asset aprobado (checksum, MIME, dimensiones, bytes o referencia de staging autorizada, credit/licencia/source público, alt, caption opcional, role/category/modes/selection); Trawel persiste media HTTPS y devuelve/asocia la URL final. La respuesta debe quedar ligada al asset/package/handoff fingerprint para replay sin duplicados.

## UI actual y destino V1

La aplicación Electron ya muestra Library, investigación manual, contribuciones, proveedores, configuración del pipeline real y una pantalla de piloto/revisión individual. No muestra dashboard de batch, importación de destinos, lista de jobs, revisión visual, redo selectivo, bulk approval, exportación o “Enviar aprobados”.

Para V1 no se rediseña el frontend: se añaden una pantalla de lote, un detalle de destino con pestañas reutilizando la presentación de Library, y acciones mínimas de aprobar/rehacer/retry/enviar/exportar.

## Control de coste y recuperación

El ledger existente registra proveedor/modelo/uso/coste y aplica límites task/batch/day para el pipeline real. Al crear batch se debe fijar `MAX_COST_PER_DESTINATION` y `MAX_COST_PER_BATCH` como presupuesto durable; un reintento consume una nueva reserva trazable. El batch y cada job deben persistir suficiente estado para sobrevivir cierre de app, reinicio de máquina y reanudación al día siguiente.

## Plan de cuatro días

| Día | Resultado de salida |
|---|---|
| 1 | Batch domain + import JSON + normalización/dedupe + jobs durables + lista mínima de estados. |
| 2 | Worker editorial genérico con concurrencia 1, reuso de artefactos/Library/cost ledger, aislamiento/retry/resume; la composición real queda bajo autorización explícita y no llama proveedores desde pruebas. |
| 3 | Mesa de revisión de lote: Student/Adventure/visuales, warnings, redo selectivo, approval; export JSON V1 y bulk delivery sobre outbox V2. |
| 4 | `REAL_BATCH_SMOKE_10`, correcciones estrictamente bloqueantes, replay/restart/cost checks y cierre operativo. |

## Deferir explícitamente después de V1

- Rediseño visual premium del frontend, photos/UI polish y carruseles avanzados.
- Proveedores visuales alternativos, ranking con ML/CV, búsqueda pagada y paralelismo alto.
- Más de 50 destinos, scheduler distribuido, queues externas y autoescalado.
- Refactors no bloqueantes, nueva arquitectura de Library o de Trawel.
- Bulk approval sofisticado, analítica avanzada, reglas comerciales, experiencias de viajeros y cualquier Business Layer.

## Criterio de terminado

`INVESTIGHOST_CONTENT_FACTORY_V1 = DONE` cuando un usuario pueda importar 10 destinos reales, ver dedupe/ambigüedad, iniciar un lote durable, procesar cada destino sin intervención individual, continuar tras fallos, producir Student y Adventure válidos, producir/seleccionar visuales con rights fail-closed, llegar a revisión humana, rehacer sólo contenido o visuales, aprobar, exportar el lote, enviar únicamente aprobados a Trawel, registrar y reintentar deliveries, reanudar tras reinicio y mantener límites/costes trazables.

## Smoke de cierre: REAL_BATCH_SMOKE_10

Entrada: JSON de 10 destinos nuevos reales, con un duplicado controlado y una condición de fallo/retry deliberada no destructiva.
Pasos: importar, clasificar, ejecutar con concurrencia 1, detener/reanudar una vez, revisar resultados, rehacer selectivamente un destino, aprobar parcialmente, exportar todos/approved/failed, enviar approved y repetir un delivery.
PASS: jobs aislados, no duplicados, costes bajo límites, artefactos y Library trazables, visuales rights-safe, export sin secretos, delivery idempotente y estados finales visibles.

## Próximo paso único

`ALIGN_INVESTIGHOST_FACTORY_TO_TRAWEL_CONTRACT`: implementar, con providers
desactivados, el primer incremento vertical de contratos internos y adapters
durables para `StudentDocumentV1`, el package Adventure/hero/visual story,
Places evidence-backed y el package de aprobación atómica. Debe reutilizar el
corpus único y el visual pipeline existente; no debe tocar Trawel, entregar
destinos, ejecutar producción masiva ni volver a auditar Trawel. El prompt
debe declarar por separado si R7 se aborda después como `CLOSE_VERY_DIFFERENT_R7`.
