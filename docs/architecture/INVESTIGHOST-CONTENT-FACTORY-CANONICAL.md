# Investighost Content Factory V1 — estado canónico

> Antes de cualquier prompt estructural de Investighost, leer este documento primero. Reauditar únicamente componentes cuya implementación haya cambiado o no esté documentada.

**Actualizado:** 2026-09-23
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

1. **Executor real phase-addressable.** Usar el owner durable `BATCH_JOB` ya disponible para separar research/análisis/drafts/review del executor monolítico y registrar los delegates reales sin duplicar proveedores o Library.
2. **Flujo visual aprobado a Trawel media.** Acordar/implementar el payload de byte o referencia aprobada y respuesta de URL HTTPS, sin trasladar autoridad editorial a Trawel.
3. **Mesa de revisión de lote.** Lista/estado/coste/warnings; vista Student, Adventure y visuales; approve y redo selectivo.
4. **Exportador JSON V1 y entrega bulk.** Sólo `APPROVED`, dedupe de delivery, resultado por job y retry del fallido.

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

`HUMAN_REVIEW_DESK_V1`: usar la proyección por job para revisar Student,
Adventure, visuales y warnings antes de cualquier aprobación o entrega.
