# Plan de esquema PostgreSQL/Supabase — decisión 2C-A

Estado: diseño; SQL no modificado ni ejecutado en esta fase.

## Fuente estructural

Supabase local es la única base del MVP. Las migraciones SQL versionadas deben poder crear un entorno vacío compatible con las tablas que Trawel consume y con las tablas privadas de Investighost. No se diseña ni mantiene un schema SQLite paralelo.

## Clasificación

| Área | Objetos principales | Visibilidad |
|---|---|---|
| Catálogo Trawel compatible | `countries`, `cities`, `destinations`, `destination_sources`, `editorial_contents`, `image_assets`, catálogos de localización | lectura pública solo para estados autorizados; escritura privada |
| Identidad y permisos | perfiles, roles, asignaciones, permisos | privada/RLS |
| Investigación/editorial | requests, runs, sources, results, drafts, revisions, content pieces | privada/RLS |
| Publicación | queue items, attempts, steps, rate config | privada/RLS |
| Contribuciones/moderación | contributions, import jobs, files, attempts, conflicts, batches, decisions | privada/RLS |
| CRM/comunicaciones | organizaciones, contactos, consentimientos, supresión, tareas, campañas, entregas | privada/RLS y fase legal |
| Publicidad/analytics | anunciantes, placements, anuncios, eventos, agregados, informes | privada; proyecciones públicas mínimas |
| Auditoría | audit log, operaciones idempotentes, errores | append-only lógico y acceso restringido |
| Archivos | metadatos PostgreSQL + objetos de Supabase Storage local | buckets/policies según `STORAGE_PLAN.md` |

## Sustitución del modelo local de FASE 2B

`ImportedContribution`, `ContributionImportJob`, `ContributionFile`, `ImportAttempt`, `ImportConflict`, `ImportBatch` y `LocalBackupRecord` son conceptos reutilizables, pero sus tablas SQLite no son canónicas. En la fase técnica se mapearán a PostgreSQL; `LocalBackupRecord` se reemplazará por evidencia de backup/restauración del entorno Supabase y los paths locales por bucket/path de Storage.

## Reglas de compatibilidad

- No duplicar tablas Trawel existentes sin comparar primero el DDL real.
- Mantener nombres, tipos, FKs, slugs, enums y estados consumidos por Trawel.
- Crear contenido como `draft`/`review`; `published` exige acción humana.
- Separar datos internos (prompts, costes, notas, PII) de proyecciones públicas.
- Aplicar RLS de denegación por defecto y validar casos negativos.
- Usar migraciones expand/backfill/contract para cambios sobre datos existentes.

## Criterio de aceptación del esquema

Un `supabase db reset` futuro deberá reconstruir tablas, constraints, índices, RLS, Storage y seeds sintéticos sin SQLite ni pasos manuales ocultos. La comparación contra Trawel real y toda aplicación remota permanecen bloqueadas hasta autorización humana.
