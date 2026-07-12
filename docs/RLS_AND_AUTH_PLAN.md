# Plan de Auth y RLS — FASE 2A

Estado: diseño **NO EJECUTADO**.

## Identidad y autorización

- Supabase Auth es la identidad; `investighost_private.profiles.auth_user_id` referencia `auth.users.id`.
- Roles multiusuario se normalizan en `roles`, `permissions`, `user_roles`, `role_permissions`.
- Las políticas consultan funciones `security definer` mínimas como `has_permission(permission)` con `search_path` fijo y sin aceptar actor desde el cliente.
- Los JWT no son la única fuente autoritativa de rol; cambios urgentes deben surtir efecto sin esperar claims obsoletos.
- Primer usuario: un owner. No hay cuenta owner compartida. MFA para owner/admin será requisito antes de producción.

## Matriz de acceso resumida

| Actor | Lectura | Escritura |
|---|---|---|
| `anon` | vistas/filas explícitamente públicas | solo endpoints/colas públicas expresamente diseñadas; ninguna tabla privada directa |
| `authenticated` sin rol | su perfil/sesión mínima | ninguna operación de negocio por defecto |
| owner | todas las áreas, auditoría y RBAC | administración; secretos solo server-side |
| admin | operación amplia, auditoría limitada | sin acceso indiscriminado a secretos ni cambio de owner |
| editor | investigación y contenido asignado/compartido | crear/editar; no aprobar/publicar |
| reviewer | contenido pendiente y versiones | revisión/aprobación según segregación de funciones |
| publisher | contenido aprobado, cola e intentos | encolar/ejecutar vía operación privilegiada |
| moderator | aportes/fotos asignados | decisiones y metadatos de moderación |
| sales | CRM, comunicaciones y publicidad autorizadas | gestionar esos dominios; campañas reales siguen bloqueadas legalmente |
| analyst | agregados e informes minimizados | sin mutación de fuente; crear informes controlados |

## Familias de políticas

- Tablas Trawel públicas: `SELECT` anon únicamente sobre `published`/`active`; ningún draft/disabled/expired. Escrituras autenticadas requieren permiso específico y, para publicación, función auditada.
- Investigación/editorial: operador con permiso y ownership/assignment; reviewer no modifica evidencia original; aprobación propia se deniega salvo excepción owner auditada.
- Cola/publicación: solo publisher/owner/admin limitado; transición válida, contenido aprobado e idempotency key obligatoria.
- Moderación: inserción pública solo mediante endpoint con validación/rate limit; lectura privada. Moderadores ven asignadas o pool autorizado.
- CRM/campañas: sales/owner/admin; analyst recibe agregados, nunca listas de contactos. Supresión prevalece.
- Analytics: inserción mediante endpoint; lectura de bruto restringida; analyst consume agregados.
- Auditoría: append mediante función controlada; sin update/delete para usuarios; lectura owner y admin limitada.
- RBAC: solo owner; admin puede invitar/asignar únicamente roles delegables que se definan.

## Pruebas obligatorias en dev

Por tabla y acción: allow/deny para anon, authenticated sin rol y cada rol; ownership cruzado; rol revocado; filas draft/published; PII; transiciones ilegales; bypass por vistas/funciones; Storage. Las pruebas usan cuentas ficticias y verifican que service role no sea necesaria para el cliente.

## Riesgos y decisiones

- Debe auditarse la RLS productiva existente para evitar aperturas al compartir proyecto.
- Falta cerrar MFA, invitaciones, recuperación, duración de sesión y roles delegables por admin.
- Cualquier función `security definer` requiere revisión específica, permisos `execute` mínimos y auditoría.

## Buzón temporal de contribuciones

El futuro origen remoto debe exponer solo pendientes autorizados al operador y una operación privilegiada e idempotente de borrado posterior a recibo verificado. `anon` nunca lista la bandeja ni descarga archivos ajenos. La inserción pública se realiza por endpoint limitado; la descarga/borrado exige moderator/owner y se audita. FASE 2B no implementa estas policies ni conecta Auth: usa un adaptador mock local.
