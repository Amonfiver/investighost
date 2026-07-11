# Seguridad y privacidad

## Controles obligatorios

- Secretos solo en proceso principal seguro, Vault/Edge Functions o almacén del SO; nunca renderer, repositorio, logs o SQLite plano.
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

