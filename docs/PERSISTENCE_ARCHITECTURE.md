# Arquitectura de persistencia — FASE 2A

Estado: diseño aprobado para revisión; sin conexión ni migraciones ejecutadas.

## Decisión canónica

Producción usa un único proyecto Supabase compartido por Trawel e Investighost. Trawel consume exclusivamente filas y vistas autorizadas; Investighost opera contenido privado y público mediante Auth, RLS y funciones privilegiadas. El proyecto Supabase de desarrollo reproduce estructura, nunca PII real. SQLite es caché/offline parcial y no es fuente multiusuario.

```text
Renderer → preload/IPC validado → repositorios del proceso principal
                                      ├─ LocalRepository → SQLite (cache/outbox/drafts)
                                      └─ CloudRepository → Supabase Auth + Postgres/RLS
                                                               ├─ public: catálogo compartido
                                                               ├─ investighost_private: operación privada
                                                               └─ Storage/funciones privilegiadas
Trawel → vistas/RLS públicas → filas published/active del mismo Supabase productivo
```

## Límites y repositorios

- `Repository` recibe y devuelve contratos canónicos; Zod valida en entrada, lectura y escritura.
- `LocalRepository` solo maneja tablas locales enumeradas en `DATABASE_SCHEMA_PLAN.md`.
- `CloudRepository` usa la sesión `authenticated` y RLS; nunca una service role desde Electron.
- `PrivilegedOperationsRepository` llama en fases futuras a Edge Functions para publicar, gestionar secretos o tareas programadas; no existe implementación en 2A.
- Las transacciones cloud conservan invariantes por constraints y funciones; la UI no es una frontera de seguridad.
- UUID se genera antes de trabajar offline. UTC, `version bigint`, `created_at`, `updated_at` y, donde proceda, `deleted_at`/tombstone permiten sincronización.
- Auditoría cloud es append-only. Los payloads sensibles se resumen o hashean; no se almacenan secretos.

## Superficies de datos

- `public`: tablas Trawel existentes (`countries`, `cities`, `destinations`, `destination_sources`, `editorial_contents`, `image_assets` y catálogos). No se duplican.
- `investighost_private`: investigación, editorial interna, colas, moderación, CRM, campañas, publicidad, analytics, auditoría y RBAC. El nombre final del esquema debe validarse contra producción antes de migrar.
- Vistas públicas: proyecciones de filas `published`/`active`, sin PII ni metadatos internos. Su adopción por Trawel se valida en FASE 6.
- SQLite: datos temporales del operador, outbox e índices de caché; nunca service role, consentimiento, listas de marketing ni PII por defecto.

## Compatibilidad y estado actual

`src/services/db/schema.ts` representa el prototipo SQLite previo: no tiene FKs, constraints de enum, campos de actor/versionado ni tablas canónicas completas. Se conserva como evidencia y no se convierte mecánicamente en Postgres. Los contratos Zod de `src/shared/contracts.ts` guían el diseño lógico; antes de implementación se requiere una tabla de correspondencia contrato↔DDL revisada.

## Invariantes

1. Denegación por defecto; acceso explícito por permiso y fila.
2. Un contenido no entra en cola sin aprobación trazable.
3. Trawel no ve draft, revisión, PII, prompts, costes ni auditoría interna.
4. Idempotency key única y hash estable para cada intento de publicación.
5. Conflictos editoriales crean versión/revisión; no hay last-write-wins silencioso.
6. Producción permanece bloqueada hasta backup, revisión de diff, autorización y allowlist.

