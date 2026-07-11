# Roles y permisos

Modelo RBAC multirol, denegación por defecto y mínimo privilegio. RLS será obligatoria en FASE 2; asignar un rol no sustituye políticas por fila.

| Permiso | owner | admin | editor | reviewer | publisher | moderator | sales | analyst |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| users.manage | ✓ | limitado | — | — | — | — | — | — |
| settings.manage | ✓ | ✓ sin secretos | — | — | — | — | — | — |
| secrets.manage | ✓ | — | — | — | — | — | — | — |
| research.create | ✓ | ✓ | ✓ | — | — | — | — | — |
| content.edit | ✓ | ✓ | ✓ | limitado | — | — | — | — |
| content.review | ✓ | ✓ | — | ✓ | — | — | — | — |
| content.approve | ✓ | ✓ | — | ✓ | — | — | — | — |
| publication.queue | ✓ | ✓ | — | — | ✓ | — | — | — |
| publication.execute | ✓ | limitado | — | — | ✓ | — | — | — |
| moderation.decide | ✓ | ✓ | — | — | — | ✓ | — | — |
| crm.manage | ✓ | ✓ | — | — | — | — | ✓ | lectura limitada |
| campaign.manage | ✓ | ✓ | — | — | — | — | ✓ | lectura |
| advertisement.manage | ✓ | ✓ | — | — | — | — | ✓ | lectura |
| analytics.read / reports.read | ✓ | ✓ | — | — | — | — | lectura | ✓ |
| audit.read | ✓ | ✓ limitado | — | — | — | — | — | — |

Reglas: una persona puede tener varios roles; `owner` no se comparte como cuenta; secretos solo owner/server; nadie aprueba su propio contenido en el flujo objetivo salvo excepción auditada; publicación `published` requiere publisher/owner y aprobación previa; campañas reales añaden aprobación legal humana independiente.

