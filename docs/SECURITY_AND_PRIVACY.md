# Seguridad y privacidad

## Controles obligatorios

- Secretos solo en proceso principal seguro, Vault/Edge Functions o almacén del SO; nunca renderer, repositorio, logs ni tablas de aplicación.
- `contextIsolation: true`, `nodeIntegration: false`, sandbox activo e IPC limitado, tipado y validado con Zod.
- Service role nunca en cliente. Supabase Auth + RLS obligatorias, mínimo privilegio y separación de roles.
- Toda operación privilegiada registra actor, acción, entidad, resultado y correlationId; nunca el secreto/payload sensible completo.
- Validación Zod antes de persistir y antes del handoff. Idempotency keys, constraints y hashes protegen duplicados.
- PII local excluida por defecto; si se aprueba offline, cifrado con clave del SO y retención corta.

## Privacidad y comunicaciones

Registrar finalidad, base jurídica, fuente, evidencia, concesión/retirada y lista de supresión. La retirada prevalece sobre segmentos y reintentos. Deben existir exportación, rectificación, supresión, oposición y baja sencilla.

Separar correo transaccional, operativo, marketing y prospección B2B. Campañas, tracking, listas de terceros e importaciones quedan bloqueadas hasta PAUSA HUMANA LEGAL. No enviar marketing sin base aprobada, remitente identificado, finalidad y baja.

## Retención e incidentes

Las retenciones provisionales están en `DOMAIN_MODEL.md` y requieren DPO/asesoría. La eliminación debe propagarse a cloud, cachés, exports y proveedores respetando obligaciones legales. Definir runbook de incidentes: contención, revocación de claves, evaluación, notificación, evidencia y revisión posterior.

## Decisiones pendientes

Proyecto/región Supabase, política definitiva de retención, responsable legal, base para cada comunicación, proveedor de correo/analytics, cifrado local y procedimiento de derechos. Ninguna de estas decisiones se presume aprobada.

## Controles diseñados en FASE 2A

- Producción compartida se segmenta con esquema privado, RLS y vistas/proyecciones públicas; compartir proyecto no implica compartir acceso.
- Dev nunca recibe PII productiva. Los exports se limitan a DDL y los seeds son ficticios y están bloqueados en producción.
- Variables, project refs y scripts dev/prod son distintos; una allowlist y banner impiden confundir entornos.
- Auth se vincula a perfiles/RBAC multirol; denegación por defecto, mínimo privilegio y MFA pendiente para owner/admin.
- Supabase local aplica minimización y RLS a PII. Tokens futuros van al almacén seguro del SO; service role nunca entra en Electron.
- Storage mantiene uploads/fotos pendientes privados, promoción solo tras revisión de derechos y retirada propagable.
- Logs, outbox y auditoría minimizan payloads, usan correlation/idempotency IDs y tienen retención definida.

Antes de producción siguen pendientes: validación legal de retenciones, procedimiento de derechos/incidentes, responsable de backups, MFA/sesiones, antivirus de uploads y auditoría de policies existentes de Trawel.

## Controles locales de contribuciones — FASE 2B

- Payloads y adjuntos importados pueden contener PII: se minimizan, quedan bajo `userData`, no se muestran rutas al renderer y no se ejecutan archivos.
- MIME, límites, tamaño y SHA-256 se verifican antes de confirmar la importación.
- El nombre remoto nunca se usa como nombre local; los paths se resuelven y comprueban dentro de la raíz permitida.
- El conjunto payload+archivos es indivisible para borrar el origen.
- Backup local verificado precede cualquier borrado; la activación real sigue bloqueada hasta probar restauración, rotación, cifrado/ACL y retención.
- En 2B los datos son sintéticos y el borrado es mock. No se copiaron contribuciones ni fotos reales.

## Actualización de persistencia — FASE 2C-A

- Supabase local/PostgreSQL y Storage local son la única persistencia del MVP; SQLite y carpetas operativas propias quedan pendientes de retirada técnica.
- PII, consentimientos, jobs y auditoría usarán RLS/roles y minimización en PostgreSQL; archivos permanecerán privados hasta aprobación.
- No existe fallback u offline en el MVP. Diseñarlo en el futuro requerirá evaluación separada de cifrado, pérdida, retención y conflictos.
- Docker/volúmenes locales necesitan ACL, cifrado del disco cuando proceda, backup, restauración y política de borrado verificables.
- El entorno local solo usa datos sintéticos o expresamente autorizados.
- Producción Trawel no se conecta ni se consulta. Quedan prohibidas credenciales productivas en `.env`, Electron, logs o repositorio; toda acción futura requiere autorización humana explícita y controles de entorno.
