# FASE 3A — Dominio editorial canónico

Estado: aprobado técnicamente el 2026-07-21. Fuente ejecutable: `src/shared/editorial-contracts.ts`.

## Alcance y decisión

El caso de uso canónico es una investigación de un destino, independiente de quién la invoque. Recibe una consulta geográfica, perfiles editoriales, idioma, profundidad, opciones, actor e `idempotencyKey`. Devuelve y persiste identidad geográfica, solicitud, ejecución, fuentes, hechos, lugares, actividades, borradores versionados, controles de calidad, uso/coste y eventos.

No existe un discriminador Manual/Automatic, ni tablas, prompts, rutas o estados específicos de Automatic. Manual será el primer invocador. Un orquestador futuro solo podrá crear la misma entrada y observar el mismo resultado.

## Auditoría y matriz de gaps

| Área | Estado al comenzar | Decisión 3A |
|---|---|---|
| Contratos | `contracts.ts` y `types.ts` divergentes; modelo MVP insuficiente | contrato V3 separado, inferido desde Zod y reexportado por la fuente contractual |
| Identidad geográfica | país/región de texto libre | entidad jerárquica, aliases, slug, normalización, procedencia, versión y ambigüedad explícita |
| Solicitud | sin perfiles, destino canónico ni idempotencia | solicitud versionada con actor, snapshot, opciones, perfiles e idempotencia |
| Ejecución | proveedor/estado básico | etapa, prompt/contrato, intentos, costes, tiempos, error, cancelación y recuperación |
| Fuentes | URL/título/score sin ciclo completo | URL normalizada, huella, consulta, ámbito, actualidad, duplicado y estado |
| Hechos | inexistentes como entidad | afirmación durable con fuentes obligatorias, confianza, contradicción, volatilidad y validez |
| Lugares/actividades | DTO editorial sin evidencia | entidades estructuradas con hechos, fuentes, perfiles, duplicidad y ciclo de vida |
| Editorial | un borrador genérico | Aventura y Estudiante como perfiles independientes del mismo resultado, secciones y versiones |
| Revisión | placeholder | review/checks independientes; evidencia, severidad, corrección, regla y resultado tipados |
| Costes | logs volátiles | uso por etapa con unidades, estimación, real, moneda, límite y causa |
| Persistencia | `Map` volátiles | PostgreSQL local; los `Map` solo permanecen como dobles de test durante la transición |
| Trawel/publicación | placeholders históricos | fuera de FASE 3; cero publicación y cero conexión |

## Entidades, ownership y ciclo de vida

| Entidad | Dueño lógico | Nace | Termina o se versiona |
|---|---|---|---|
| GeographicEntity | catálogo geográfico/editor | import/seed o corrección humana | `deprecated`; nunca se recicla ID |
| EditorialResearchRequest | actor solicitante | resolución aceptada + idempotency key | `completed`, `failed` o `cancelled`; versión optimista |
| EditorialResearchRun | pipeline | al iniciar/reanudar una solicitud | completada, reintentable, fallida o cancelada |
| ResearchSource | ejecución | descubrimiento | aceptada, rechazada, duplicada o no disponible |
| ResearchFact | editor/pipeline | estructuración | verificado, disputado o rechazado; versión y validez temporal |
| ResearchPlace/Activity | solicitud | estructuración | aceptado, rechazado o duplicado; versión optimista |
| EditorialDraft/Section | editor | generación por perfil | cambios, aprobación, rechazo o archivo; nunca sobrescritura sin versión |
| QualityReview/Check | RevisIAtor | revisión independiente | inmutable para la versión revisada |
| ProviderUsage | pipeline | operación de proveedor | inmutable; coste real puede completarse de forma controlada |
| ResearchEvent | pipeline/actor | transición o acción | append-only |

## Trazabilidad e invariantes

```text
EditorialSection → ResearchFact → ResearchSource
```

- Un hecho exige al menos una fuente existente.
- Una sección exige al menos un hecho y una fuente existentes.
- Cada perfil solicitado exige un único borrador actual.
- Aventura y Estudiante no pueden compartir una firma editorial idéntica.
- Una solicitud no repite perfiles y tiene una `idempotencyKey` estable.
- Las transiciones de investigación y borrador están cerradas y probadas.
- `ready` no salta directamente a `approved`; requiere revisión.
- La publicación no forma parte del contrato 3A.

## Máquinas de estado cerradas

Investigación:

```text
draft → queued → researching → structuring → validating → completed
                    ↘ retry_pending ↗
ramas: failed, cancelled
```

Borrador:

```text
generating → ready → in_review → approved
                          ↘ changes_requested → generating
                          ↘ rejected
salida: archived
```

Ejecución por etapa: `queued → running → checkpointed|completed`, con `retry_pending`, `failed` y `cancelled`.

RevisIAtor: `passed`, `passed_with_warnings`, `changes_requested`, `blocked` o `rejected`. Ningún resultado equivale a aprobación humana.

## Plan físico para 3B

Tablas previstas:

1. `geographic_entities`, `geographic_aliases`.
2. `editorial_research_requests`, `editorial_research_runs`.
3. `research_sources`, `research_facts`, `research_fact_sources`.
4. `research_places`, `research_place_facts`, `research_place_sources`.
5. `research_activities`, `research_activity_facts`, `research_activity_sources`.
6. `editorial_drafts`, `editorial_sections`, `editorial_section_facts`, `editorial_section_sources`.
7. `quality_reviews`, `quality_checks`.
8. `provider_usage`, `research_events`, `stage_checkpoints`, `execution_locks`.

JSONB queda limitado a opciones/snapshots controlados, metadatos, payload de eventos y snapshots de checkpoint. Relaciones de trazabilidad, ownership, versiones e idempotencia usan columnas y foreign keys.

## Plan de repositorios y migración

- Interfaces neutrales por agregado/capacidad; implementación Supabase local y dobles en memoria de tests.
- Errores tipados para no encontrado, conflicto, estado inválido, lock, presupuesto y proveedor.
- Escrituras compuestas mediante función/transaction PostgreSQL o secuencia recuperable con checkpoint.
- Concurrencia optimista mediante `version`.
- Paginación por cursor/fecha para biblioteca e historial.
- Sustituir `memory-store.ts` solo al cablear el flujo Manual durable; conservar dobles de tests.
- Migración expand-only local en 3B; no se altera la migración histórica de contribuciones.

## Plan de pruebas

- Contratos: entidades, límites, estados e invariantes de trazabilidad/diferenciación.
- Migración estática: tablas, FKs, checks, índices, RLS y grants.
- Repositorios: CRUD, filtros, versión, idempotencia, transacciones y errores.
- Integración local: reset, seed, lectura/escritura real, restart simulado y RLS.
- Pipeline: fixtures, ambigüedad, duplicados, proveedor, hechos, perfiles, RevisIAtor, UI y resiliencia en fases 3C–3I.

## Gate 3A

- Manual queda representable de extremo a extremo.
- Un invocador futuro reutiliza exactamente el mismo input/output.
- No existen estructuras paralelas ni implementación de Automatic.
- Todas las entidades tienen owner y ciclo de vida.
- Fuente→hecho→texto es obligatoria y validada.
- Versionado e idempotencia están definidos.
- No queda una decisión arquitectónica material pendiente para 3B.
- No se requiere proveedor real ni coste para aprobar el pipeline.
