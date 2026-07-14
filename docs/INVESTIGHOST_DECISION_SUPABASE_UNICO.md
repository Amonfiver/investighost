# Decisión arquitectónica: Supabase local como persistencia única

Fecha: 2026-07-12  
Estado: aprobada para FASE 2C-A; vinculante para el MVP.

## Decisión

Supabase local será el entorno principal de desarrollo y la única persistencia del MVP de Investighost. PostgreSQL/Supabase es la única tecnología de base de datos y Supabase Storage local almacena los archivos. SQLite se elimina del objetivo: no será fallback, caché, outbox, cola, repositorio ni modo offline.

El entorno local debe reproducirse mediante migraciones SQL versionadas y conservar compatibilidad estructural con el Supabase que Trawel usa en producción. El proyecto real de Trawel permanece totalmente desconectado hasta una aprobación humana explícita y específica.

## Motivos

- Evitar dos modelos, dos historiales de migración y resolución innecesaria de conflictos.
- Probar desde el principio PostgreSQL, RLS, Auth y Storage del stack final.
- Reducir divergencias entre desarrollo y las tablas que Trawel consume.
- Simplificar durabilidad, auditoría, backup y recuperación.
- Evitar que contribuciones y PII dependan de una única copia en un equipo local.
- El MVP no tiene un requisito offline aprobado.

## Ventajas

- Una sola fuente operativa y un solo contrato de persistencia.
- Migraciones reproducibles y auditables.
- Tests más representativos del entorno final.
- Menos adaptadores, sincronización, estados ambiguos y dependencias nativas.
- Storage y metadatos gobernados conjuntamente.

## Riesgos

- La app local dependerá de que Docker/Supabase local esté disponible.
- La retirada toca código ya implementado en FASE 2B y requiere pruebas de regresión.
- El schema documental de Trawel puede diferir del real.
- Migrar prematuramente hacia producción podría afectar Trawel si fallan los bloqueos.
- RLS, seeds, backups y Storage local aumentan el trabajo inicial de infraestructura.

## Consecuencias

- No se diseñarán nuevas funciones sobre SQLite/Drizzle.
- No habrá modo offline en el MVP. Una necesidad futura abrirá una fase separada con decisión y aceptación propias.
- Jobs, reintentos, idempotencia, conflictos y auditoría vivirán en PostgreSQL.
- Los archivos usarán Storage local y sus metadatos PostgreSQL.
- Las migraciones SQL versionadas serán la fuente estructural; ningún setup manual será canónico.

## Código SQLite que debe retirarse o reemplazarse

En la siguiente fase técnica, no en 2C-A:

- dependencias `better-sqlite3`, Drizzle SQLite y tipos/config asociados;
- `drizzle.config.ts`, schema y migraciones SQLite;
- inicialización SQLite en Electron y rutas bajo `userData`;
- repositorios SQLite de contribuciones, backup local y file store propio;
- adaptadores de caché/outbox/offline y tests ligados a ABI SQLite;
- scripts, variables y documentación operativa que activen SQLite.

Las interfaces de repositorio podrán conservarse si no filtran detalles SQLite.

## Lógica reutilizable de FASE 2B

- contratos Zod y estados de importación;
- procesamiento aislado por registro y lotes parciales;
- normalización, tamaño, MIME y SHA-256;
- idempotency keys y deduplicación;
- backoff acotado y reintento individual;
- no borrar origen antes de persistencia, archivos y checksum verificados;
- auditoría de intentos/errores y resumen de UI;
- adaptador remoto mock para pruebas.

## Plan de transición

1. Congelar nuevas ampliaciones SQLite y aprobar esta documentación.
2. Inventariar usos runtime, dependencias, tests y datos locales existentes.
3. Crear/validar migraciones de Supabase local para las entidades necesarias.
4. Configurar Storage local, policies y fixtures sintéticos.
5. Implementar repositorios PostgreSQL/Storage conservando contratos reutilizables.
6. Migrar el runtime y las pruebas al nuevo backend local.
7. Probar reinicio, importación parcial, checksums, reintentos, idempotencia, backup y restauración.
8. Retirar código, dependencias, configuración y artefactos SQLite.
9. Ejecutar búsqueda residual y todos los gates.
10. Detenerse antes de cualquier conexión remota.

## Criterio de eliminación correcta

La dependencia se considera eliminada cuando:

- `package.json` y lockfile no incluyen runtime SQLite/Drizzle SQLite;
- no hay imports, inicialización, repositorios, schemas, migraciones ni rutas SQLite activas;
- Supabase local se reconstruye desde cero con migraciones versionadas;
- datos y archivos necesarios sobreviven reinicios mediante PostgreSQL/Storage;
- importación, checksums, reintentos e idempotencia pasan sus pruebas;
- la documentación viva no prescribe SQLite;
- lint, typecheck, tests y build pasan.

Las menciones en prompts, auditorías, bitácoras y este documento pueden permanecer como historia explícita.

## Política estricta de no producción

- No conectar, consultar, migrar, insertar, actualizar ni borrar en Trawel producción.
- No almacenar URL, anon key ni service role productivas en `.env`, Electron, scripts o repositorio.
- No copiar PII, archivos privados ni datos reales al entorno local.
- Toda acción futura sobre producción exige autorización humana explícita, credenciales seguras, project ref verificado, backup/restauración, diff, plan de reversión y prueba previa en entorno autorizado.
- Una aprobación para diseñar o trabajar en local nunca implica aprobación para producción.

## Aplicación técnica — FASE 2C-B

La decisión ya está activa para contribuciones: runtime, repositorio y archivos usan exclusivamente Supabase local. La migración y seed permiten reconstrucción total. SQLite queda inactivo en este módulo, sin fallback. Sus archivos y dependencias residuales se conservan temporalmente por compatibilidad con otros módulos históricos y se retirarán en la siguiente subfase controlada.
