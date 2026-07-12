# Estrategia de migraciones PostgreSQL/Supabase — decisión 2C-A

Estado: plan documental. Ninguna migración se crea, cambia o ejecuta en esta fase.

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

## Salida de la transición

SQLite queda eliminado solo cuando búsqueda de dependencias y referencias runtime no encuentre uso activo, Supabase local se reconstruya con migraciones, los flujos sean durables tras reinicio y todas las verificaciones pasen.
