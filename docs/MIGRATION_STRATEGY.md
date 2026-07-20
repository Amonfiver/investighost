# Estrategia de migraciones PostgreSQL/Supabase — decisión 2C-A

Estado: estrategia vigente. La primera migración local está ejecutada y verificada; no se conectó ningún proyecto remoto.

## Mecanismo único

Las migraciones SQL versionadas de Supabase son la fuente reproducible del esquema del MVP. Deben reconstruir Supabase local desde cero, revisarse en Git y aplicarse primero solo al entorno local. Drizzle/SQLite no mantiene un historial paralelo.

## Secuencia de transición

1. Inventariar tablas, dependencias y rutas runtime SQLite sin retirarlas todavía.
2. Capturar y contrastar el DDL relevante de Trawel únicamente cuando haya autorización de lectura.
3. Consolidar una baseline local compatible, sin datos productivos.
4. Crear migraciones pequeñas para identidad, investigación, editorial, publicación, moderación, CRM, campañas, publicidad, analytics, auditoría, RLS, Storage y vistas.
5. Convertir las siete entidades de contribuciones de FASE 2B a PostgreSQL y sus archivos a Storage local.
6. Implementar repositorios Supabase y migrar solo fixtures/datos locales sintéticos que sean útiles; no existe obligación de convertir bases SQLite de desarrollo.
7. Cambiar runtime y pruebas a Supabase local.
8. Retirar dependencias, configuración, schemas, repositorios y archivos SQLite.
9. Verificar reset desde cero, reinicio, integridad, idempotencia, RLS, backup/restauración y gates del proyecto.

## Orden lógico propuesto

1. extensiones y enums;
2. usuarios y roles;
3. investigación;
4. editorial y revisión;
5. publicación;
6. moderación y contribuciones;
7. CRM;
8. campañas;
9. publicidad;
10. analytics;
11. auditoría e idempotencia;
12. RLS y grants;
13. Storage;
14. vistas públicas compatibles con Trawel;
15. seeds ficticios exclusivos de local.

Cada migración futura documentará propósito, dependencias, riesgo, locks, compatibilidad Trawel y rollback lógico/forward. Cambios destructivos usarán expand/backfill/contract.

## Producción

No se ejecutará un comando de migración contra una URL ambigua. Producción requerirá credenciales fuera de Electron, project ref allowlisted, diff revisado, backup y restauración probados, ventana, plan de reversión y aprobación humana explícita. Hasta entonces no se conecta ni se toca el Supabase real de Trawel.

## Salida de la transición — verificada en FASE 2C-C

La condición se cumplió en FASE 2C-C: la búsqueda no encontró dependencias ni referencias runtime activas, Supabase local se reconstruyó con migración y seed, los flujos conservaron durabilidad y pasaron los gates aplicables.

## Primera migración ejecutada

`supabase/migrations/20260714090000_contributions_supabase_local.sql` es exclusivamente local. Se verificó desde cero con `npx supabase db reset`; `supabase/seed.sql` es repetible tras cada reset. Están prohibidos `supabase link`, `db push` y URLs alojadas. La integración se ejecuta con `RUN_SUPABASE_INTEGRATION=true` y credenciales de `npx supabase status -o env`.

## Segunda migración ejecutada — FASE 3B

`supabase/migrations/20260721010000_editorial_pipeline.sql` crea las 23 tablas normalizadas del pipeline editorial, triggers de actualización, RLS/grants y funciones de lock. El mismo reset local aplicó ambas migraciones y cargó el catálogo territorial sintético; `supabase db lint --level warning` no encontró errores. La integración opt-in persistió, reconstruyó y eliminó un agregado editorial completo. No se aplicó ningún cambio remoto.

## Evidencia de FASE 2C-C

El CHECKPOINT 8 aprobó de nuevo `supabase db reset`: la migración creó siete tablas, 46 constraints, cinco FKs, 19 índices, dos funciones, siete triggers, RLS en siete tablas y cero secuencias; el seed reconstruyó los conteos sintéticos esperados y el bucket privado. Las migraciones Supabase son la única fuente estructural y no existe historial paralelo SQLite/Drizzle.

No se ejecutaron `supabase link` ni `supabase db push`, no se guardó project ref remoto y no se conectó producción. El reset es una prueba de reconstrucción reproducible, no un mecanismo de backup.
