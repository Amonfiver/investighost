# Plan de esquema PostgreSQL/Supabase — decisión 2C-A

Estado: baselines locales de contribuciones y pipeline editorial ejecutadas y verificadas; el resto continúa como diseño futuro.

## Fuente estructural

Supabase local es la única base del MVP. Las migraciones SQL versionadas deben poder crear un entorno vacío compatible con las tablas que Trawel consume y con las tablas privadas de Investighost. No se diseña ni mantiene un schema SQLite paralelo.

## Clasificación

| Área | Objetos principales | Visibilidad |
|---|---|---|
| Catálogo Trawel compatible | `countries`, `cities`, `destinations`, `destination_sources`, `editorial_contents`, `image_assets`, catálogos de localización | lectura pública solo para estados autorizados; escritura privada |
| Identidad y permisos | perfiles, roles, asignaciones, permisos | privada/RLS |
| Investigación/editorial | requests, runs, sources, results, drafts, revisions, content pieces | privada/RLS |
| Automatic futuro | campaña de investigación, objetivos territoriales y ejecuciones; solo orquestación enlazada al modelo editorial canónico | privada/RLS; diseño posterior a Manual estable |
| Publicación | queue items, attempts, steps, rate config | privada/RLS |
| Contribuciones/moderación | contributions, import jobs, files, attempts, conflicts, batches, decisions | privada/RLS |
| CRM/comunicaciones | organizaciones, contactos, consentimientos, supresión, tareas, campañas, entregas | privada/RLS y fase legal |
| Publicidad/analytics | anunciantes, placements, anuncios, eventos, agregados, informes | privada; proyecciones públicas mínimas |
| Auditoría | audit log, operaciones idempotentes, errores | append-only lógico y acceso restringido |
| Archivos | metadatos PostgreSQL + objetos de Supabase Storage local | buckets/policies según `STORAGE_PLAN.md` |

## Sustitución del modelo local de FASE 2B

`ImportedContribution`, `ContributionImportJob`, `ContributionFile`, `ImportAttempt`, `ImportConflict`, `ImportBatch` y `LocalBackupRecord` se mapearon a PostgreSQL en FASE 2C-B. FASE 2C-C retiró sus tablas/adaptadores SQLite y el file store local. `LocalBackupRecord` conserva evidencia lógica del flujo, pero no sustituye los backups/restauraciones reales de PostgreSQL y Storage.

## Reglas de compatibilidad

- No duplicar tablas Trawel existentes sin comparar primero el DDL real.
- Mantener nombres, tipos, FKs, slugs, enums y estados consumidos por Trawel.
- Crear contenido como `draft`/`review`; `published` exige acción humana.
- Separar datos internos (prompts, costes, notas, PII) de proyecciones públicas.
- Aplicar RLS de denegación por defecto y validar casos negativos.
- Usar migraciones expand/backfill/contract para cambios sobre datos existentes.

## Criterio de aceptación del esquema

`supabase db reset` reconstruye tablas, constraints, índices, RLS, Storage y seeds sintéticos sin SQLite ni pasos manuales ocultos; quedó aprobado en CHECKPOINT 8. La comparación contra Trawel real y toda aplicación remota permanecen bloqueadas hasta autorización humana.

## Esquema ejecutado en FASE 2C-B

La migración `20260714090000_contributions_supabase_local.sql` crea `import_batches`, `contribution_import_jobs`, `imported_contributions`, `contribution_files`, `import_attempts`, `import_conflicts` y `local_backup_records`. Usa UUID, `timestamptz`, FKs, checks de estados/MIME/SHA-256/tamaño, índices e idempotencia. `persist_verified_contribution(jsonb,jsonb)` hace atómica la escritura de payload y metadatos. RLS queda activa, `anon`/`authenticated` sin permisos y solo `service_role` local accede desde Electron main.

## Reserva de diseño Automatic

Este parche no crea ni especifica tablas. El futuro modelo guardará alcance territorial versionado, configuración, progreso, intentos, costes y enlaces a las entidades editoriales comunes; queda prohibido crear tablas `manual_*`/`automatic_*` o copiar resultados. Sus nombres, constraints, RLS e índices se decidirán por SDD cuando se hayan cerrado los gates Manual. No se presume ninguna tabla territorial nueva ni ningún campo de Trawel.

## Esquema editorial ejecutado en FASE 3B

La migración `20260721010000_editorial_pipeline.sql` añadió, sin alterar las tablas de contribuciones: `geographic_entities`, `geographic_aliases`, `editorial_research_requests`, `editorial_research_runs`, `research_sources`, `research_facts` y sus joins, `research_places`/`research_activities` y joins, `editorial_drafts`, `editorial_sections` y joins, `quality_reviews`, `quality_checks`, `provider_usage`, `research_events`, `stage_checkpoints` y `execution_locks`.

Las 23 tablas usan UUID, FKs, checks, índices de consulta, RLS, timestamps, idempotencia y versión optimista. JSONB queda restringido a opciones/snapshots/metadatos/eventos/checkpoints justificados. `supabase db reset`, lint de base y una integración de ida/vuelta aprobaron el esquema exclusivamente local. No se crearon tablas Manual/Automatic ni objetos Trawel.
