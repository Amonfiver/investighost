# Investighost Content Factory V1 — estado canónico

> Antes de cualquier prompt estructural de Investighost, leer este documento primero. Reauditar únicamente componentes cuya implementación haya cambiado o no esté documentada.

**Actualizado:** 2026-09-22
**Referencia de código auditada:** `2af389ef88e4fe24b293d341b9285dd3e4d5bf16` en `feat/investighost-real-pipeline`.

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
| Identidad geográfica | DONE | Resolución, snapshots y contratos durables; Cuenca tiene identidad canónica. | Integrarla en el importador de destinos. |
| Research real | PARTIAL | Tavily, sources, evidence, rondas, ledger, recuperación y pipeline real de piloto. | Orquestación genérica de lote y aislamiento de jobs. |
| Analysis | PARTIAL | Routing DeepSeek, outputs durables, costes y recuperación de análisis. | Convertir la política de piloto en ejecución por destino. |
| Student | PARTIAL | Canon, bloques V2, gates y versiones aprobadas de referencia. | Generación/regeneración genérica desde un job de lote. |
| Adventure | PARTIAL | Generación, gates, Library y revisiones aprobadas de referencia. | Generación/regeneración genérica desde un job de lote. |
| Revisión automática | PARTIAL | Quality review, PUBLIC_SAFE y gates de estructura/editorial. | Política única de “ready for human review” y corrección automática acotada. |
| Library/currentApproved | DONE | Repositorios Supabase, versiones, comparación, aprobación, hashes y paginación. | Filtros y vistas de operación por lote. |
| Handoff textual V2 | DONE | Payload saneado, outbox durable, replay/idempotencia, retry y deliveries por perfil. | Acción por lote y pantalla de estado. |
| Descubrimiento visual | DONE | Adapter Wikimedia Commons, candidatos durables, metadata, autor≠uploader y clasificación de licencias. | Ejecutarlo desde job de lote y exponerlo a revisión humana. |
| Rights y selección visual | DONE | Fail-closed, quality gates, selección determinista hero/highlight/gallery, checksum y package contracts. | Puente de media aprobada hacia storage HTTPS de Trawel. |
| Storage visual local | PARTIAL | Staging privado, SHA-256, dedupe y esquemas/buckets locales aplicados. | No usar su URL HTTP como media pública; adaptar promoción/entrega al receptor media de Trawel. |
| Revisión humana | PARTIAL | UI individual para Library/piloto: leer, aprobar, pedir cambios y reabrir. | Mesa de lote, visuales, redo selectivo, bulk approve y delivery. |
| Importación de contribuciones | DONE / NO REUSE DIRECT | Batches, jobs, retry y repositorio Supabase para contribuciones remotas. | Es un patrón, no un importador de destinos ni una cola editorial. |
| Cola editorial de lote | MISSING | El real pipeline persiste un piloto y checkpoints; existe patrón de jobs de contribuciones. | Batch, job por destino, fases, lease, retry, resume y concurrencia. |
| Exportación JSON | MISSING | Existen contratos serializables y snapshots de handoff. | Exportador V1 de lote y UI. |

## Arquitectura vigente

### Editorial y durabilidad

- `src/modules/real-pipeline/`: pipeline real duradero, research/análisis, preflight, budgets, ledger, recuperación y persistencia de piloto.
- `src/modules/editorial-pipeline/`: generación de perfiles y quality review.
- `src/modules/library-versioning/`: versiones, sanitización pública, comparación, decisiones y `currentApproved`.
- `src/modules/trawel-handoff/`: proyección V2, outbox/delivery durable, repositorios Supabase y reconciliación.
- `src/modules/contributions/`: patrón reutilizable de batch/job/retry; no es la cola editorial de destinos.

El runtime real actual es **single-pilot first**: políticas fijadas a pilotos, concurrencia `1`, regeneraciones/publicaciones bloqueadas en preflight y sin worker de batch editorial. Sus contratos de coste sí contienen ámbitos task/batch/day, por lo que se reutilizan al crear el lote verdadero.

### Visuales

- `src/shared/destination-visual-media-contract.ts`: assets, packages, roles, modos y rights status.
- `src/modules/visual-acquisition/`: Wikimedia, candidatos, selección, descarga/validación, staging, checksum, dedupe y promoción.
- Migraciones visuales 074–077 ya aplicadas localmente; buckets locales `visual-staging-private` (privado) e `images-approved` (público) existen para desarrollo.
- El asset aprobado actual exige URL HTTPS. La ruta local de Supabase era HTTP, por lo que el E2E real de Cuenca no se ejecutó: fue una parada correcta, no un fallo de rights.

La orientación correcta para V1 es mantener candidates, rights, selección y provenance en Investighost, y adaptar el paso de promoción/handoff para que Trawel almacene el byte aprobado y devuelva/registre su URL HTTPS estable. No se debe usar la URL HTTP local ni crear hosting alternativo en Investighost.

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

1. **Modelo de lote de destinos e importador JSON.** Normalizar identidad, deduplicar dentro/fuera del lote y clasificar ambiguos/actualizables.
2. **Cola editorial durable por destino.** Lease, fase, retry, resume, aislamiento de fallo, presupuesto acumulado y límite de concurrencia.
3. **Adaptador de ejecución genérico.** Conectar research/análisis/generación/review/Library al job, dejando el piloto fijo como fixture, no como camino de producción.
4. **Flujo visual aprobado a Trawel media.** Acordar/implementar el payload de byte o referencia aprobada y respuesta de URL HTTPS, sin trasladar autoridad editorial a Trawel.
5. **Mesa de revisión de lote.** Lista/estado/coste/warnings; vista Student, Adventure y visuales; approve y redo selectivo.
6. **Exportador JSON V1 y entrega bulk.** Sólo `APPROVED`, dedupe de delivery, resultado por job y retry del fallido.

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
| 2 | Worker editorial genérico con concurrencia 1, reuso de research/Library/cost ledger, aislamiento/retry/resume; preparar visual job y contrato de media con Trawel. |
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

Implementar el **modelo durable de lote de destinos**: importación JSON, normalización/deduplicación y jobs editoriales por destino. Es la base que permite conectar el resto sin reabrir módulos ya cerrados.
