# Estrategia SQLite ↔ Supabase — FASE 2A

Estado: diseño; sincronización no implementada.

## Autoridad y alcance offline

Supabase es autoritativo para datos compartidos. SQLite permite crear/editar borradores, conservar investigación necesaria, reanudar cargas y registrar una outbox. No ejecuta publicación, campañas ni automatizaciones cloud. PII queda excluida por defecto.

## Identidad y metadatos

- UUID v4 generado antes de persistir localmente; el mismo ID viaja a cloud.
- Fechas UTC del cliente son informativas; cloud fija timestamps autoritativos.
- Cada entidad sincronizable lleva `version` cloud, `updated_at`, `deleted_at` opcional y `last_synced_version` local.
- Cada mutación tiene `operation_id`, `entity_id`, `base_version`, `idempotency_key`, hash, payload validado y estado.

## Flujo

1. Validar contrato Zod y guardar cambio + outbox en una transacción SQLite.
2. Al recuperar conexión, autenticar usuario y verificar entorno/project ref.
3. Enviar operaciones FIFO por entidad; reintentar con la misma idempotency key.
4. Cloud compara `base_version`, valida permiso/estado y actualiza atómicamente.
5. ACK actualiza cache y elimina payload de outbox tras siete días; fallo recuperable usa backoff con jitter.
6. Descargar cambios desde cursor/`updated_at,id`; validar Zod antes de sustituir caché.

## Conflictos

- Sin cambio remoto: aplicar y aumentar versión.
- Cambio remoto en borrador editorial: conservar ambas variantes, crear conflicto y exigir merge/revisión humana.
- Estados, aprobaciones, roles, consentimientos y colas: cloud gana; nunca se fuerzan offline.
- Borrado: tombstone cloud; no resucitar desde caché. Supresión/retirada invalida copias locales en la siguiente sync.
- La UI muestra `local`, `sincronizando`, `sincronizado`, `conflicto` o `error`; nunca presenta local como compartido antes del ACK.

## Reintentos e idempotencia

Backoff limitado (por ejemplo 2 s a 5 min), pausa tras errores permanentes 4xx, reautenticación en 401 y revisión humana en conflicto 409. Las operaciones dependientes esperan ACK del padre. Cerrar Electron no pierde la outbox.

## Seguridad y limpieza

- Tokens en almacén seguro del SO; no en SQLite ni renderer persistente.
- Base en directorio de datos de usuario con permisos mínimos. Cifrado de SQLite no se presume disponible: por ello se excluye PII.
- Caché 30 días; uploads temporales 7 días; audit buffer/outbox 7 días después de ACK. Limpieza nunca borra datos cloud.
- Cambio de usuario/entorno purga cachés y claves de sesión asociadas tras confirmar que no hay outbox pendiente.

## Pruebas futuras

Offline/reinicio, duplicado de envío, orden padre-hijo, 401/403/409/429/5xx, reloj incorrecto, tombstone, conflicto concurrente, cambio de usuario/entorno y corrupción/recuperación local.

## Flujo inverso de contribuciones — FASE 2B

El parche arquitectónico distingue este flujo de la sincronización general:

1. listar pendientes del buzón Trawel;
2. crear `ImportBatch` y un `ContributionImportJob` por `remote_id`;
3. descargar cada payload/archivo de forma aislada;
4. normalizar JSON, validar Zod, tamaño, MIME y SHA-256;
5. persistir `ImportedContribution`, `ContributionFile` e intentos localmente;
6. crear backup local verificado;
7. pasar a `deleting_remote` y borrar solo ese conjunto remoto;
8. completar o conservar `retry_pending`/`deleting_remote` sin detener el lote.

La idempotencia usa `trawel:{remote_id}:v{version}` y unique por `remote_id`. Los retrasos son inmediato, 30 segundos, 2 minutos y 10 minutos; el quinto intento queda manual. Un fallo de archivo no borra el registro remoto. Un fallo de borrado conserva la copia local y reintenta únicamente la eliminación.

Estado implementado: SQLite real en Electron, repositorio en memoria para tests, file store seguro y adaptador mock. El ABI nativo de `better-sqlite3` está compilado para Electron y no se carga desde Vitest/Node.
