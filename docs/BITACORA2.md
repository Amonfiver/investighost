# BITACORA2.md

## Resumen de BITACORA.md

Investighost nació como app local Electron/React/TypeScript para investigar destinos y preparar contenido para Trawel. Se construyeron una UI de investigación, IPC seguro básico, persistencia temporal en memoria, contratos MVP, un esquema Drizzle no activado, cola editorial en memoria y arquitectura multi-proveedor. Kimi se integró como analista/redactor y Brave como búsqueda de snippets; el flujo mock permanece explícito cuando faltan proveedores. Siguen pendientes persistencia real, revisión/edición, publicación Trawel, cloud/multiusuario y el resto de dominios. La auditoría de 2026-07-11 confirma además lint rojo, ausencia de tests, packaging fallido y arranque dev roto.

---

## Sesión 18 — FASE 0: auditoría completa del estado actual

### Fecha

2026-07-11

### Objetivo

Ejecutar exclusivamente la FASE 0 del prompt maestro: determinar qué existe, funciona, es placeholder, está roto y falta; comparar todo el proyecto con la visión completa y dejar roadmap y brechas, sin modificar funcionalidad.

### Archivos tocados

- `docs/INVESTIGHOST_FULL_AUDIT.md` — creado.
- `docs/INVESTIGHOST_GAP_MATRIX.md` — creado.
- `docs/ROADMAP.md` — creado.
- `docs/BITACORA2.md` — creado por superar `BITACORA.md` las 1000 líneas.

### Comprobaciones

- `npm run lint`: falla con 15 errores de variables no usadas.
- `npx tsc --noEmit`: pasa.
- `npm test`: falla porque no existe script ni suite.
- `npm run build`: TypeScript/Vite pasan; `electron-builder` falla al crear symlinks de winCodeSign en Windows.
- `npm run dev`: Vite/main/preload compilan, pero Electron cae con `app.isPackaged` sobre `app` indefinido.

### Estado final

Auditoría documental completada. No se tocó código, arquitectura, dependencias, `package.json`, migraciones ni datos. El proyecto es un prototipo parcial, no un producto operativo. FASE 0 queda en PAUSA HUMANA 0.

### Problemas

- Arranque dev roto.
- Lint rojo y tests inexistentes.
- Persistencia solo en memoria.
- Packaging no completado.
- La mayoría de dominios del prompt no existe.

### Siguiente paso

Esperar aprobación humana de la auditoría. Después, y solo con aprobación, iniciar FASE 1A de estabilización y contratos; no avanzar automáticamente.

---

## Sesión 19 — FASE 1A: estabilización y contratos de la fundación

### Fecha

2026-07-11

### Objetivo

Estabilizar la base técnica sin añadir funcionalidad de producto: corregir arranque Electron y lint, crear una suite mínima, alinear el contrato mínimo de estados y verificar todos los comandos obligatorios.

### Archivos tocados

- `src/main/index.ts`
- `src/modules/publishing/index.ts`
- `src/services/ai/providers.ts`
- `src/services/ai/research.ts`
- `src/utils/validation.ts`
- `scripts/dev.mjs`
- `tests/validation.test.ts`
- `tests/helpers.test.ts`
- `vitest.config.ts`
- `package.json` y `package-lock.json`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONES.md`
- `docs/ROADMAP.md`
- `docs/BITACORA2.md`

### Fallos reproducidos y causas

- Lint: 15 parámetros/destructuraciones no usados en placeholders.
- Tests: faltaban script, runner y archivos de prueba.
- Dev: `ELECTRON_RUN_AS_NODE=1` heredado hacía que Electron se ejecutara como Node y no expusiera `app`.
- Packaging: Windows impide crear los symlinks incluidos en `winCodeSign`.

### Cambios

- Import nombrado del API Electron.
- Lanzador que limpia `ELECTRON_RUN_AS_NODE` solo para el hijo de Vite.
- Parámetros placeholder marcados con `void` e iteración de proveedores simplificada, sin desactivar ESLint.
- Scripts `typecheck` y `test`, Vitest 2 y configuración aislada.
- 21 tests para entrada, estados y utilidades.
- `ResearchStatusSchema` alineado con la unión TypeScript actual.
- Sin cambios en aislamiento Electron, producto, APIs externas ni persistencia.

### Verificación

- `npm run lint`: pasa, 0 errores.
- `npm run typecheck`: pasa.
- `npm test`: pasan 2 archivos y 21 tests.
- `npm run dev`: pasa; npm y Electron seguían vivos tras 12 segundos, sin stderr. Se detuvieron deliberadamente tras verificar.
- `npm run build`: TypeScript y Vite pasan; `electron-builder` falla por privilegios de symlinks al extraer `winCodeSign`.

### Riesgos pendientes

- Packaging Windows aún no genera instalador en este entorno.
- `npm install` reporta 27 vulnerabilidades transitivas: 2 low, 9 moderate, 14 high y 2 critical. Requieren auditoría específica, no `audit fix --force` automático.
- La suite mínima no cubre IPC, main, proveedores ni E2E.
- Persistencia sigue en memoria y los contratos completos quedan para FASE 1B.

### Estado final

FASE 1A completada dentro de alcance. Arranque dev, lint, typecheck y tests quedan verdes. Build compilado; packaging bloqueado por el entorno Windows y documentado.

### Siguiente paso

PAUSA HUMANA. Tras aprobación, ejecutar únicamente FASE 1B — contratos y arquitectura canónica; no iniciar migraciones, Supabase ni dominios nuevos.

---

## Sesión 20 — FASE 1B: contratos y arquitectura canónica

### Fecha y objetivo

2026-07-11. Cerrar dominios, estados, roles, fronteras, seguridad y handoff Trawel antes de persistencia real.

### Archivos tocados

- Nuevos: `src/shared/contracts.ts`, `tests/contracts.test.ts`, `DOMAIN_MODEL.md`, `LOCAL_CLOUD_DATA_BOUNDARIES.md`, `ROLES_AND_PERMISSIONS.md`, `STATE_MACHINES.md`, `TRAWEL_HANDOFF_CONTRACT.md`, `SECURITY_AND_PRIVACY.md` y `ACCEPTANCE_TESTS.md`.
- Actualizados: `src/shared/types.ts`, `src/utils/validation.ts`, `src/services/db/schema.ts`, `tests/validation.test.ts`, `SPEC.md`, `ARCHITECTURE.md`, `DECISIONES.md`, `ROADMAP.md` y `BITACORA2.md`.

### Cambios

- 29 entidades con contratos Zod, ownership, sensibilidad, retención y ubicación.
- Estados independientes, RBAC de ocho roles y permisos atómicos.
- Frontera SQLite/Supabase/Trawel y datos exclusivamente internos.
- Handoff Trawel 1.0 con draft obligatorio, resolución de IDs, idempotencia, deduplicación y errores parciales.
- Invariantes de aprobación editorial/legal, anuncios y URLs HTTPS.
- Sustituido el estado heredado `unpublished` por `failed`, `paused`, `archived`.

### Alcance respetado

Sin Supabase/Auth, migraciones, datos reales, APIs nuevas, lógica CRM/campañas/anuncios/analytics ni publicación Trawel.

### Verificación

- `npm run lint`: pasa.
- `npm run typecheck`: pasa.
- `npm test`: pasan 3 archivos y 39 tests.
- `npm run build:vite`: pasa; renderer, main y preload compilados. No se ejecutó empaquetado, según alcance.

### Siguiente paso

PAUSA HUMANA 1: decidir Supabase, usuarios/roles, correo/remitente, política legal/retención, analytics y cifrado local. Solo después autorizar FASE 2.

---

## Sesión 21 — FASE 2A: diseño de persistencia segura

### Fecha y objetivo

2026-07-12. Aplicar la actualización V2 y diseñar persistencia, Supabase dev, tablas, repositorios, Auth/RLS, Storage, sincronización y migraciones sin crear proyectos, conectar APIs, ejecutar SQL ni tocar producción.

### Decisión vinculante aplicada

Una única base Supabase productiva compartida por Trawel e Investighost; un proyecto Supabase separado solo para desarrollo; SQLite como caché/offline parcial. La publicación es una transición controlada dentro de la base compartida, no transferencia entre bases productivas.

### Archivos creados

- `docs/PERSISTENCE_ARCHITECTURE.md`
- `docs/DATABASE_SCHEMA_PLAN.md`
- `docs/SUPABASE_DEV_ENVIRONMENT_PLAN.md`
- `docs/RLS_AND_AUTH_PLAN.md`
- `docs/STORAGE_PLAN.md`
- `docs/SQLITE_SYNC_STRATEGY.md`
- `docs/MIGRATION_STRATEGY.md`

### Archivos actualizados

- `docs/SPEC.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONES.md`, `docs/ROADMAP.md`
- `docs/ACCEPTANCE_TESTS.md`, `docs/SECURITY_AND_PRIVACY.md`
- `docs/LOCAL_CLOUD_DATA_BOUNDARIES.md`, `docs/DOMAIN_MODEL.md`, `docs/TRAWEL_HANDOFF_CONTRACT.md`
- `docs/BITACORA2.md`

### Cambios

- Clasificación de tablas públicas existentes, privadas propuestas, vistas, Storage y SQLite local.
- RBAC/RLS de denegación por defecto para anon, authenticated y ocho roles.
- Seis buckets lógicos con privacidad, validación, promoción y retención.
- Sync basada en UUID, versión, outbox, idempotencia, tombstones y conflictos humanos.
- Catálogo ordenado de 15 migraciones, todas **NO EJECUTADAS**, con rollback lógico, riesgos y compatibilidad.
- Protecciones dev/prod: variables y scripts separados, allowlist, banner, ausencia de service role en Electron y backup previo.

### Alcance respetado

No se creó Supabase, no se solicitaron/guardaron claves, no se creó ni ejecutó SQL, no se conectaron APIs, no se copiaron datos, no se implementaron dominios ni publicación y no se tocó producción. `src/services/db/schema.ts` quedó sin modificar como esquema SQLite legado pendiente de sustitución controlada.

### Verificación

- `npm run lint`: pasa, 0 errores y 0 warnings.
- `npm run typecheck`: pasa.
- `npm test`: pasan 3 archivos y 39 tests.
- `npm run build:vite`: pasa; renderer, main y preload compilados.

### Riesgos y decisiones pendientes

Confirmar organización, región y nombre dev; autorizar export solo DDL; auditar schema/RLS/buckets productivos reales; cerrar MFA/sesiones, retenciones/cifrado, antivirus y backups. La referencia Trawel es documental y debe contrastarse antes de SQL.

### Estado y siguiente paso

FASE 2A completada documentalmente y en PAUSA HUMANA 2A. Tras aceptación humana: confirmar organización/región/nombre, crear de forma controlada el proyecto Supabase dev y capturar baseline solo de esquema; no conectar producción ni avanzar a dominios.

---

## Sesión 22 — FASE 2B: motor local de importación verificada

### Fecha y objetivo

2026-07-12. Aplicar el parche arquitectónico Trawel→Investighost e implementar una importación local incremental, idempotente y aislada por registro usando exclusivamente una fuente mock.

### Archivos principales

- Contratos/schema: `src/shared/contracts.ts`, `src/services/db/schema.ts`.
- Motor: nuevos archivos en `src/modules/contributions/` para interfaces, integridad, cola, repositorios, archivos, retry, backup, mock, servicio y runtime.
- Electron/UI: `src/main/index.ts`, `src/main/preload.ts`, `src/vite-env.d.ts`, `src/renderer/App.tsx`, `src/renderer/App.css`.
- Tests: `tests/contribution-import.test.ts`, `tests/contribution-schema.test.ts`, `vitest.config.ts`.
- Documentos vivos de persistencia, sync, schema, RLS, Storage, migraciones, estados, aceptación, seguridad, roadmap, decisiones y esta bitácora.

### Implementación

- Siete entidades locales: ImportedContribution, ContributionImportJob, ContributionFile, ImportAttempt, ImportConflict, ImportBatch y LocalBackupRecord.
- Estados `pending`, `downloading`, `verifying`, `imported`, `deleting_remote`, `completed`, `retry_pending`, `failed`.
- Zod, normalización estable, tamaño y SHA-256 para payload/archivos.
- Nombres locales UUID, allowlist MIME, límite 20 MB y defensa contra path traversal.
- Persistencia SQLite/Drizzle, archivos fuera de SQLite, WAL/FKs e índices.
- Idempotencia por `remote_id` y `trawel:{remote_id}:v{version}`.
- Backoff por registro: inmediato, 30 s, 2 min, 10 min y después manual.
- Backup local verificado antes de solicitar borrado; borrado solo mock en esta fase.
- IPC limitado y UI “Descargar pendientes” con resumen, estados, error y retry individual.

### Incidencia controlada

`better-sqlite3` está compilado para ABI Electron 130 y el Node 22 de Vitest usa ABI 127. No se reinstalaron dependencias. Los tests usan el repositorio en memoria y file store temporal; `npm run dev` y una consulta con Electron/Node 20 verificaron el repositorio SQLite real y sus siete tablas.

### Verificación

- `npm run lint`: pasa.
- `npm run typecheck`: pasa.
- `npm test`: pasan 5 archivos y 55 tests.
- `npm run build:vite`: pasa; renderer, main y preload.
- `npm run dev`: la app permaneció activa durante la prueba, inicializó SQLite en `userData` y se detuvo deliberadamente; cero procesos residuales.
- Runtime Electron: confirmó `contribution_files`, `contribution_import_jobs`, `import_attempts`, `import_batches`, `import_conflicts`, `imported_contributions`, `local_backup_records`.

### Alcance respetado

Sin Supabase, claves, SQL remoto, producción, datos reales, publicación, CRM, campañas, anuncios ni analytics. No se hizo commit ni push.

### Riesgos y siguiente paso

Antes de borrado real faltan restauración probada, rotación/retención, cifrado o ACL local, antivirus/magic bytes más robusto, contrato remoto dev y Auth/RLS. FASE 2B queda en PAUSA HUMANA 2B. El siguiente bloque propuesto es FASE 2C: crear Supabase dev y probar únicamente allí el buzón/recibo/borrado con datos ficticios y autorización separada.

---

## Sesión 23 — FASE 2C-A: Supabase local como persistencia única

### Fecha y objetivo

2026-07-12. Reorientar exclusivamente la documentación: Supabase local/PostgreSQL pasa a ser la única persistencia del MVP, Storage local gestiona archivos y SQLite queda fuera del alcance funcional. Sin modificar código, tests ni SQL.

### Documentos

- Creado `INVESTIGHOST_DECISION_SUPABASE_UNICO.md`.
- Actualizados `ARCHITECTURE.md`, `DECISIONES.md`, `ROADMAP.md`, `PERSISTENCE_ARCHITECTURE.md`, `DATABASE_SCHEMA_PLAN.md`, `SQLITE_SYNC_STRATEGY.md`, `MIGRATION_STRATEGY.md`, `STORAGE_PLAN.md`, `SECURITY_AND_PRIVACY.md`, `STATE_MACHINES.md`, `ACCEPTANCE_TESTS.md` y esta bitácora.
- La auditoría residual amplió la actualización a `SPEC.md`, `LOCAL_CLOUD_DATA_BOUNDARIES.md` y `DOMAIN_MODEL.md` para eliminar prescripciones vivas contradictorias.

### Decisiones y reutilización

- Un solo motor de persistencia: PostgreSQL/Supabase local, reproducido por migraciones SQL versionadas.
- Sin SQLite como fallback, caché, outbox, cola u offline. Un modo offline futuro exige fase independiente.
- SHA-256, Zod, MIME/tamaño, idempotencia, reintentos, aislamiento por registro, estados y borrado condicionado de FASE 2B siguen vigentes sobre PostgreSQL/Storage.
- El código SQLite existente se conserva solo porque 2C-A prohíbe modificar TypeScript, Electron, tests y SQL; se retirará en 2C-B.
- Producción Trawel permanece totalmente desconectada.

### Estado

FASE 2C-A queda en PAUSA HUMANA 2C-A. Siguiente fase recomendada: 2C-B, sustitución técnica controlada de SQLite por Supabase local, con datos sintéticos y sin conexión remota.

### Verificación

- `npm run lint`: pasa, 0 errores y 0 warnings.
- `npm run typecheck`: pasa.
- `npm test`: pasan 5 archivos y 55 tests.
- `npm run build`: TypeScript, renderer, main y preload compilan; `electron-builder` falla al extraer `winCodeSign` porque Windows no concede privilegio para crear los symlinks `libcrypto.dylib` y `libssl.dylib`. Es el bloqueo de entorno ya conocido; no se modificó configuración ni código para eludirlo.

---

## Sesión 24 — FASE 2C-B: primera sustitución técnica de SQLite

### Fecha y auditoría inicial

2026-07-14. `runtime.ts` instanciaba `SqliteContributionLocalRepository`; `sqlite-repository.ts` creaba las siete tablas, `file-store.ts` escribía archivos locales y `backup.ts` copiaba DB/archivos. Los tests de importación usaban memoria y filesystem; el test de schema dependía de Drizzle SQLite. Zod, SHA-256, MIME/tamaño, cola, idempotencia, retry, aislamiento, conflictos, continuidad y mock remoto eran reutilizables sin SQLite.

### Implementación

- Migración versionada para siete tablas, UUID, `timestamptz`, FKs, checks, índices, RLS y función transaccional.
- Bucket privado `investighost-contributions`, 20 MiB y allowlist JPEG/PNG/WebP/PDF.
- Seed idempotente y sintético: sin archivo, con archivo, pendiente, retry y lote parcial.
- Cliente oficial Supabase centralizado; URL solo loopback y service role solo en Electron main.
- Repositorio PostgreSQL, Storage privado y checkpoint durable sustituyen el runtime SQLite; no hay fallback.
- UI conserva flujo y muestra conexión/desconexión. Adaptador remoto continúa mock.
- SQLite legado permanece inactivo en contribuciones; dependencias, Drizzle schemas y adaptadores quedan pendientes porque otros módulos/historia aún los referencian.

### Verificación

- `npx supabase db reset`: pasa repetidamente desde cero; migración y seed aplicados.
- Integración Supabase local: 7 archivos, 63 tests, todos pasan; persiste y lee contribución sintética.
- `npm run lint`: pasa.
- `npm run typecheck`: pasa.
- `npm test`: 62 pasan y la integración opt-in queda omitida sin Docker.
- `npm run build`: TypeScript/Vite/main/preload pasan; packaging falla únicamente por el bloqueo conocido de symlinks `winCodeSign` en Windows.
- `npx supabase status`: entorno local activo; pooler, imgproxy y edge runtime siguen detenidos deliberadamente.

### Riesgos y siguiente paso

El checkpoint durable no sustituye una política externa de backup/restauración de volúmenes PostgreSQL/Storage; el borrado real sigue prohibido y el remoto es mock. Quedan `better-sqlite3`, Drizzle SQLite, repositorio/file store/backup legados y referencias en módulos ajenos. Próxima subfase recomendada: 2C-C, retirada residual controlada y prueba formal de backup/restauración, sin conectar producción.

### Estado

FASE 2C-B completada. Producción no se conectó; no se usaron datos reales; no se hizo commit ni push. PAUSA HUMANA 2C-B.

---

## Sesión 25 — Parche arquitectónico documental del modo Automatic

### Fecha y objetivo

2026-07-14. Incorporar el rumbo de Automatic sin programarlo, sin alterar el orden inmediato de la hoja de ruta y sin duplicar el pipeline Manual ni la integración Trawel.

### Documentos

- Creado `INVESTIGHOST_PARCHE_ARQUITECTONICO_MODO_AUTOMATIC.md` como referencia equivalente al adjunto recibido.
- Actualizados `ROADMAP.md`, `ARCHITECTURE.md`, `DOMAIN_MODEL.md`, `STATE_MACHINES.md`, `DATABASE_SCHEMA_PLAN.md`, `PERSISTENCE_ARCHITECTURE.md`, `ACCEPTANCE_TESTS.md`, `DECISIONES.md`, `SPEC.md` y `TRAWEL_DATABASE_REFERENCE_FOR_INVESTIGHOST.txt`.
- No se modificaron TypeScript, React, Electron, tests, dependencias, configuración Supabase, migraciones ni SQL.

### Consolidación

- Manual invoca una vez el pipeline canónico; Automatic será un orquestador futuro del mismo flujo.
- Se prohíben prompts, contratos, validadores, resultados, tablas, estados, mappers o publicación paralelos.
- “Campaña de investigación” queda separada semánticamente de campañas de correo de F10.
- Las entidades/estados del adjunto quedan orientativos hasta su futura fase SDD.
- Supabase local sigue siendo la única persistencia y toda mención histórica de SQLite queda subordinada a Decisión 15.
- Trawel recibe únicamente contenido aprobado mediante mapper, contrato y cola comunes; no se alteró ninguna referencia de esquema.

### Posición y siguiente paso

Automatic queda después de finalizar 2C, completar Manual extremo a extremo, consolidar contratos y probar calidad, trazabilidad, recuperación, retry e idempotencia. Primero será secuencial y luego podrá añadir concurrencia limitada. El siguiente paso inmediato permanece FASE 2C-C: retirada residual SQLite y backup/restauración PostgreSQL/Storage, sin producción.

### Estado

Parche exclusivamente documental validado. `npm run lint` y `npm run typecheck` pasan; `npm test` pasa con 62 tests y omite la integración opt-in; TypeScript/Vite/main/preload compilan y el empaquetado falla únicamente por el bloqueo conocido de symlinks de `winCodeSign` en Windows. Sin commit ni push. PAUSA HUMANA PARCHE AUTOMATIC.

---

## Sesión 26 — FASE 2C-C: retirada SQLite, recuperación y gates finales

### Fecha y alcance

2026-07-16. Completar exclusivamente FASE 2C-C: retirar el legado operativo SQLite/Drizzle, verificar backup y restauración reales de PostgreSQL y Storage local y cerrar los gates técnicos. Todo se realizó con datos sintéticos, sin conectar producción o Trawel y sin implementar Manual ni Automatic.

### Archivos técnicos

- **Eliminados:** `database/.gitkeep`, `drizzle.config.ts`, `drizzle/migrations/.gitkeep`, `src/modules/contributions/backup.ts`, `src/modules/contributions/file-store.ts`, `src/modules/contributions/sqlite-repository.ts`, `src/modules/persistence/index.ts`, `src/services/db/index.ts` y `src/services/db/schema.ts`.
- **Modificados:** `.gitignore`, `package.json`, `package-lock.json`, `src/modules/contributions/index.ts`, `src/modules/persistence/memory-store.ts`, `src/modules/publishing/queue.ts`, `src/services/ai/index.ts`, `tests/contribution-import.test.ts` y `vite.config.ts`.
- **Creado:** `tests/support/contribution-doubles.ts`, con dobles exclusivamente en memoria para contratos neutrales de tests.
- No se modificó la migración Supabase ni el seed durante esta subfase.

### Dependencias retiradas

Se eliminaron `better-sqlite3`, `@types/better-sqlite3`, `drizzle-orm` y `drizzle-kit`, además de 77 entradas transitivas asociadas al árbol anterior —entre ellas bindings/prebuild, libsql, brocli, esbuild-kit y utilidades relacionadas—. `npm ls --depth=0` terminó sin dependencias directas faltantes o inválidas y no se reintrodujo SQLite o Drizzle.

`npm install` con npm 11.6.2 normalizó metadatos `peer` del lockfile: 24 inserciones y 42 eliminaciones, sin añadir/eliminar paquetes y sin cambiar versiones, URLs `resolved` o integridades de dependencias conservadas. Se aceptó como normalización técnica no funcional.

### PostgreSQL — aprobado en CHECKPOINT 5

- Dump real custom `-Fc` de 30046 bytes, creado fuera del repositorio.
- SHA-256 calculado y verificado antes de restaurar.
- Restauración real en un contenedor PostgreSQL aislado.
- Verificados siete tablas, conteos, 46 constraints, cinco FKs, 19 índices, dos funciones, siete triggers, RLS en siete tablas, cero secuencias y relación/marcador sintéticos.
- El dump cubre `public`; no incluye Auth, objetos Storage, Vault, roles globales ni todas las ACL/ownership de la plataforma.
- Contenedor, dump, marcadores y scripts temporales eliminados al terminar.

### Storage — aprobado en CHECKPOINT 7

- PNG sintético válido de 68 bytes y bucket `investighost-contributions` privado.
- Backup binario por API, manifiesto normalizado y restauración real por API en una ruta separada.
- SHA-256 del original, backup y restaurado idénticos; también coincidieron los tres tamaños, MIME y metadatos.
- Acceso autorizado correcto; acceso anon y público rechazados.
- Objetos, backup, restauración, manifiesto, binarios y scripts temporales limpiados completamente.
- La prueba cubre un objeto sintético sin concurrencia; no constituye un snapshot global de Storage.

### Auditoría técnica final — aprobada en CHECKPOINT 8

- `npm run typecheck`: pasa antes y después del reset.
- `npm run lint`: pasa antes y después, cero warnings.
- Tests generales: 62/62; la integración opt-in es el único skip de la ejecución general.
- Integración Supabase local: 1/1 antes y después; suite total 63/63.
- `npx supabase db reset`: pasa; reconstruye migración, seed, siete tablas, 46 constraints, cinco FKs, 19 índices, dos funciones, siete triggers, RLS en siete tablas y cero secuencias.
- Conteos reconstruidos: `3 / 4 / 2 / 1 / 1 / 0 / 1`; bucket privado, 20 MiB, JPEG/PNG/WebP/PDF y cero objetos.
- Búsqueda residual: no queda SQLite/Drizzle operativo, otra base, fallback, file store local, outbox o caché durable alternativa.
- TypeScript, Vite, Electron main/preload y empaquetado hasta `release\win-unpacked\Investighost.exe` pasan.
- El build falla únicamente al crear los symlinks `libcrypto.dylib` y `libssl.dylib` de `winCodeSign`, limitación preexistente no corregida.

### Seguridad y limitaciones conocidas

- Producción y Trawel permanecieron desconectados; no se usaron credenciales remotas ni datos personales.
- No se ejecutaron `supabase link` ni `supabase db push`; todas las URLs de integración fueron loopback.
- La service role utilizada fue exclusivamente local y no se expuso al renderer.
- `npm install` informó 23 vulnerabilidades: 2 bajas, 6 moderadas, 13 altas y 2 críticas. No se ejecutó `npm audit fix`.
- Electron conserva icono por defecto y el fallo conocido de symlinks `winCodeSign`.
- Docker puede publicar PostgreSQL en más interfaces aunque las pruebas usaron loopback; revisar bindings/firewall antes de datos reales.
- `SupabaseDurabilityCheckpointService` no es un backup real y `supabase db reset` no sustituye backup/restauración.
- Los stores de investigación, cola editorial, mocks y logs/cachés permanecen en memoria para fases futuras.
- Las referencias SQLite en prompts, auditorías y entradas anteriores se conservan como historia explícita, no como arquitectura vigente.

### Estado

FASE 2C-C queda técnicamente completada y documentada, pendiente de revisión humana final. Sin commit ni push. No se inicia Manual, no se implementa Automatic y no se avanza a ninguna conexión productiva.

---

## Sesión 27 — Formalización V3 y FASE 3A

### Fecha y objetivo

2026-07-21. Formalizar íntegramente la Hoja de Ruta Canónica V3 y cerrar el dominio editorial antes de crear persistencia física.

### Preflight

- Rama `feat/investighost-reinvencion`, base `996e098`, upstream 0/0 y árbol limpio.
- Los 38 falsos cambios LF/CRLF se restauraron con autorización; blobs exactos a `HEAD`, sin untracked.
- Prompt Maestro V3: 1.820 líneas; Hoja V3: 458 líneas.
- 21 fuentes internas obligatorias: 5.601 líneas, leídas íntegramente.
- Gates base: typecheck, lint, 62/62 tests y build Vite/main/preload aprobados.
- Docker Desktop estaba detenido; Supabase local no fue necesario para el gate documental/contractual 3A.

### Cambios

- Formalizada V3 en `INVESTIGHOST_HOJA_DE_RUTA_CANONICA_V3.md` con fecha real.
- Creado `src/shared/editorial-contracts.ts` y reexportado desde la fuente contractual.
- Definidos identidad geográfica, solicitud, ejecución, fuentes, hechos, lugares, actividades, perfiles, secciones, calidad, uso/costes y eventos.
- Cerradas máquinas de estado, ownership, ciclos de vida, trazabilidad, versionado e idempotencia.
- Creado `FASE_3A_DOMAIN_DESIGN.md` con matriz de gaps y planes de tablas, migración, repositorios y tests.
- Creado `FASE_3_EXECUTION_REPORT.md` como informe acumulado 3A–3J.
- Actualizados arquitectura, dominio, estados, schema, decisiones, aceptación, roadmap y bitácora.

### Verificación

- Tests específicos del dominio editorial: 5/5.
- Typecheck tras consolidar contratos: aprobado.
- Gates completos se ejecutan antes del commit lógico.

### Seguridad y alcance

Sin credenciales remotas, producción, Trawel, migraciones, proveedor real, Automatic ni publicación. Siguiente fase: 3B, migración y repositorios exclusivamente sobre Supabase local.
