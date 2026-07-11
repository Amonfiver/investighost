# Fronteras de datos: SQLite, Supabase e interfaz Trawel

## Decisión canónica

SQLite es almacenamiento local de trabajo y caché; Supabase Investighost es la fuente compartida; Trawel es un destino público derivado. Ninguna cola que deba ejecutarse con Electron cerrado puede depender solo de SQLite.

| Categoría | SQLite local | Supabase Investighost | Trawel público |
|---|---|---|---|
| Sesión/config no secreta | preferencias, caché | configuración central | nunca |
| Secretos | nunca sin almacén seguro del SO | Vault/secretos server-side | nunca |
| Investigación | borrador offline, bundle temporal | requests, runs, sources, results compartidos | solo contenido aprobado mapeado |
| Editorial | borradores pendientes de sync | versiones, revisiones, ContentPiece | campos editoriales aprobados |
| Cola | buffer temporal no autoritativo | cola/attempts autoritativos | estado resultante |
| Usuarios/roles | sesión mínima | Auth, perfiles, roles, permisos | nunca |
| Moderación/CRM/campañas/anuncios | caché excluida o cifrada | fuente autoritativa con RLS | solo activos explícitamente publicables |
| Analytics/auditoría | buffer limitado | eventos/agregados/logs | no logs; solo instrumentación separada aprobada |

## Reglas de sincronización futuras

- Cada entidad sincronizable lleva UUID, `updatedAt`, versión y tombstone; el algoritmo se diseñará en FASE 2.
- Conflictos editoriales nunca se resuelven sobrescribiendo silenciosamente: crear nueva versión y pedir revisión.
- PII no se cachea localmente por defecto. Si una necesidad offline la exige, requiere cifrado con clave del SO y retención corta.
- Borrar caché no borra la fuente cloud; ejercer supresión elimina/anónimiza todas las copias según política.
- Trawel no sincroniza de vuelta datos internos. Sus IDs y respuestas se conservan como referencias de publicación.

## Decisiones humanas pendientes

- Supabase separado (recomendado) o compartido con Trawel.
- Política exacta offline y cifrado local.
- Retenciones definitivas y región del proyecto.
- Propietario de backups, recuperación y resolución de conflictos.

