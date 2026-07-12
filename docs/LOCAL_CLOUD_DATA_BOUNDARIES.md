# Fronteras de datos: Supabase local y futuro Trawel

Estado: actualizado por FASE 2C-A.

Supabase local/PostgreSQL es la única persistencia del MVP y Storage local es el único almacén de archivos. No existe frontera de sincronización SQLite/cloud ni modo offline. El Supabase productivo compartido por Trawel e Investighost es un destino futuro completamente desconectado hasta autorización humana explícita.

| Categoría | Supabase local privado | Proyección compatible Trawel | Producción real |
|---|---|---|---|
| Investigación y borradores | requests, runs, sources, results, drafts, revisions | solo payload aprobado | desconectada |
| Editorial/publicación | cola, intentos, auditoría | tablas/vistas en draft/review/published según estado | desconectada |
| Contribuciones | buzón/job/intentos/decisiones | recibo o contenido aprobado mínimo | desconectada |
| CRM/campañas | PII y consentimientos bajo RLS | ninguna | desconectada y pausa legal |
| Archivos | Storage privado; promoción controlada | imágenes aprobadas | desconectada |

## Reglas

- Datos internos, prompts, costes, notas, PII y logs nunca entran en una proyección pública.
- Anon solo lee contenido autorizado; roles internos operan con RLS de denegación por defecto.
- No se copian datos reales a local; se usan fixtures sintéticos o expresamente autorizados.
- UUID, versiones, idempotencia, tombstones y estados recuperables siguen siendo útiles, pero dentro de PostgreSQL, no para sincronizar dos motores locales.
- Las tareas que deban ejecutarse con Electron cerrado requerirán una fase cloud posterior.
- Un modo offline futuro debe aprobarse y diseñarse como fase separada.
