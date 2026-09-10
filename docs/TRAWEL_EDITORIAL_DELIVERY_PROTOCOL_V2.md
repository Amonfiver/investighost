# Protocolo durable V2 de entrega editorial

## Objetivo y ownership

V2 es el outbox de **Investighost** para llevar una pareja editorial aprobada a un ingreso futuro de Trawel. Investighost construye, valida, persiste y reconcilia la entrega. Trawel, cuando implemente su contraparte, será dueño de persistirla e informar un recibo. Esta implementación no cambia ni requiere código de Trawel.

No hay scheduler, publicación automática, ni llamada a proveedores de IA, búsqueda o APIs de pago. Usar el cliente HTTP exige una invocación explícita; las pruebas usan fakes.

## Compatibilidad e identidad

`investighost-trawel-editorial-handoff-v1` continúa intacto: conserva hashes, IDs y comportamiento histórico, incluidos los drafts de Albarracín. V2 usa el schema distinto `investighost-trawel-editorial-delivery-v2`; no interpreta ni migra payloads V1.

Una entrega V2 tiene exactamente una fila `adventure` y una `student`. Su `handoffKey` es SHA-256 de la proyección de identidad canónica V2: mapping explícito, entrada de Biblioteca, `versionHash`, `contentHash`, perfil, idioma y aprobación. Por tanto, una nueva versión o un mapping diferente genera otra entrega. El `payloadFingerprint` cubre la proyección canónica completa, incluyendo el contenido. Ningún nombre o slug participa como identidad.

El mapping snapshot contiene `mappingId`, destino canónico Investighost y tipo/ID de entidad Trawel. El payload afirma siempre `private_draft` y `publiclyVisible: false`.

## Outbox y estados

La migración aditiva crea entregas, fuentes y attempts. `payload` y las fuentes son el snapshot inmutable creado por `enqueue`, antes de cualquier POST. Los retries nunca vuelven a leer el contenido actual de Biblioteca.

Estados: `PENDING`, `DELIVERING`, `RETRYABLE`, `RECONCILING`, `CONFIRMED`, `CONFLICT`, `FAILED`. `CONFIRMED`, `CONFLICT` y `FAILED` son terminales. Los leases son atómicos y un lease vencido en `DELIVERING` pasa a `RECONCILING`, nunca a un reenvío ciego. La autorecuperación de lease es una transición interna equivalente y visible por el código `LEASE_EXPIRED_AMBIGUOUS`.

Cada envío o consulta de reconciliación crea un attempt durable, con correlación, resultado y error redactado. El outbox puede recuperarse tras un reinicio al estar almacenado en Supabase local.

## Ingreso, retries y reconciliación

El puerto contempla `POST /internal/editorial-deliveries` y `GET /internal/editorial-deliveries/{handoffKey}`. Admite `CONFIRMED`, `NO_DUPLICATE`, `PARTIAL`, `CONFLICT`, `RETRYABLE_ERROR` y `VALIDATION_ERROR`.

Una confirmación valida handoff key, fingerprint, mapping, ambas filas y la frontera privada antes de cerrar como `CONFIRMED`. `NO_DUPLICATE` coincide con esta misma confirmación idempotente. Error conocido antes de persistencia pasa a `RETRYABLE` con backoff; timeout u otro resultado ambiguo pasa a `RECONCILING`. Sólo una lectura remota explícita `NOT_FOUND` o error recuperable permite volver a `RETRYABLE`. `PARTIAL` permanece observable en `RECONCILING`; no hay borrado ni compensación destructiva. Fingerprint o identidad incompatibles terminan en `CONFLICT`; validación no recuperable termina en `FAILED`.

## Seguridad e invariantes

La migración no altera constraints ni tablas históricas de Biblioteca, TENEMOS NOTICIA, transferencias V1 o publicación. El acceso a las tablas y RPC queda limitado a `service_role`. No se almacenan secretos ni se añade configuración. La implementación se diseñó para Supabase local existente; no ejecuta migraciones remotas.
