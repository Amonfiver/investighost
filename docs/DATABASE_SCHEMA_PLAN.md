# Plan de esquema de datos — FASE 2A

Estado: propuesta lógica, **NO EJECUTADA**. Los nombres exactos deben contrastarse con un dump solo de esquema del Supabase productivo antes de generar SQL definitivo.

## Tablas públicas compartidas existentes

| Entidad | Tabla | Uso de Investighost | Regla |
|---|---|---|---|
| País | `public.countries` | resolver por `slug` | no crear/cambiar estado automáticamente |
| Ciudad/zona | `public.cities` | upsert controlado por `country_id, slug` | mantener no pública hasta aprobación |
| Destino | `public.destinations` | draft y posterior transición humana | unique propuesto `country_id, city_id, slug` |
| Fuente | `public.destination_sources` | evidencia por destino | deduplicar URL canónica por destino |
| Editorial | `public.editorial_contents` | proyección genérica draft/review | evitar duplicados por entidad/modo/versión |
| Imagen | `public.image_assets` | metadatos de imagen aprobada | no asumir renderizado Trawel |
| Catálogo | `public.location_countries`, `public.location_cities` | selectores | no confundir con catálogo editorial |

Las constraints propuestas sobre tablas existentes solo se añadirán si la auditoría del esquema real demuestra que no rompen datos actuales.

## Tablas privadas propuestas

Prefijo lógico `investighost_private`; todas llevan UUID, timestamps UTC y RLS.

| Dominio | Tablas propuestas | Notas principales |
|---|---|---|
| Identidad/RBAC | `profiles`, `roles`, `permissions`, `user_roles`, `role_permissions` | `profiles.auth_user_id → auth.users.id`; multirol |
| Investigación | `research_requests`, `research_runs`, `research_sources`, `research_results`, `provider_usage_logs` | JSONB rico solo donde el submodelo no requiera consulta; coste/tokens privados |
| Editorial | `editorial_drafts`, `editorial_draft_sections`, `editorial_revisions`, `content_pieces` | versiones inmutables; puntero a versión actual |
| Publicación | `publication_queue_items`, `publication_attempts`, `publication_attempt_steps`, `publishing_rate_configs` | keys únicas, payload hash y respuesta saneada |
| Moderación | `user_contributions`, `user_photos`, `moderation_decisions` | PII privada; foto enlazada a Storage |
| CRM | `organizations`, `contacts`, `contact_tags`, `tags`, `consent_records`, `suppression_entries`, `crm_tasks` | diseño únicamente; implementación F8 |
| Comunicaciones | `communications`, `communication_events` | sin envíos en 2A; webhooks futuros |
| Campañas | `campaigns`, `campaign_audiences`, `campaign_audience_members`, `campaign_deliveries` | bloqueadas por pausa legal |
| Publicidad | `advertisers`, `ad_placements`, `advertisements`, `ad_bookings`, `renewal_reminders` | placements pendientes de Trawel |
| Analytics | `analytics_events`, `analytics_aggregates`, `commercial_reports` | contrato/proveedor pendientes; evitar PII |
| Auditoría | `audit_logs`, `sync_devices`, `sync_operations` | append-only; outbox correlacionada |

No se crean todavía estas capacidades de negocio. El listado reserva límites, dependencias y nombres para migraciones posteriores.

## Vistas públicas propuestas

- `public.trawel_published_cities`: ciudades autorizadas con campos públicos.
- `public.trawel_published_destinations`: solo `status = 'published'` y relaciones válidas.
- `public.trawel_published_editorial_contents`: solo `status = 'published'`.
- `public.trawel_published_image_assets`: solo imágenes `published` con licencia/alt completos.
- `public.trawel_active_advertisements`: futuro; solo anuncios aprobados, en fecha y placement válido.

Antes de adoptarlas se comprobará si Trawel puede cambiar sus consultas; mientras tanto sus filtros server-side siguen siendo obligatorios.

## SQLite local propuesto

| Tabla | Contenido | Retención inicial |
|---|---|---|
| `local_metadata` | schema version, device UUID, entorno no secreto | vida de instalación |
| `local_preferences` | preferencias no sensibles | hasta reset |
| `draft_workspaces` | borradores offline y base version | sync + 30 días |
| `research_cache` | paquetes/sources necesarios para reanudar | 30 días |
| `entity_cache` | proyección mínima de entidades cloud | 30 días desde acceso |
| `sync_outbox` | mutaciones pendientes e idempotency key | hasta ACK + 7 días |
| `sync_conflicts` | referencias y versiones, sin payload PII libre | resolución + 30 días |
| `audit_buffer` | eventos mínimos pendientes | hasta ACK + 7 días |
| `file_upload_queue` | rutas locales temporales y hash | subida/cancelación + 7 días |
| `import_batches` | resumen y resultado de cada descarga | historial operativo |
| `contribution_import_jobs` | cola, estado, hashes, tamaños, retry e idempotencia | historial + política legal |
| `imported_contributions` | payload normalizado local autoritativo tras importación | finalidad + plazo |
| `contribution_files` | metadatos/rutas relativas de archivos externos a SQLite | acompaña al registro |
| `import_attempts` | intento y error por operación/registro | auditoría operativa |
| `import_conflicts` | diferencias de hash/tamaño/versiones | hasta resolución + plazo |
| `local_backup_records` | manifiestos de backups locales | rotación aprobada |

No local: roles autoritativos, suppression list, CRM general, campañas/audiencias, secretos, service role ni analytics bruto. Excepción vinculante: contribuciones descargadas y sus datos necesarios de moderación viven localmente; exigen minimización, carpeta controlada, backup y retención específica antes de usar datos reales.

## Constraints transversales propuestas

- FKs explícitas y acciones `ON DELETE` conservadoras (`restrict` o soft-delete).
- índices en FKs, estados, `updated_at`, propietarios y fechas de cola.
- checks de rangos, fechas, moneda y estados; uniques para slugs, asignaciones RBAC e idempotencia.
- `updated_at` server-side y `version` incrementada atómicamente.
- auditoría, revisiones y consentimientos sin borrado físico ordinario; rectificación/anominización según política.
