# Protocolo durable V2 de entrega editorial

## Alcance

V2 es el outbox local de Investighost para el ingress desplegado de Trawel
`internal-editorial-deliveries`. No conecta Biblioteca remota, no crea mappings,
no envía una delivery por sí mismo y nunca publica contenido.

## Payload externo exacto

El POST JSON usa:

```ts
{
  schemaVersion: 'v2',
  mappingId: 'zone:espana:albarracin',
  canonicalDestinationId: 'investighost:zone:espana:albarracin',
  handoffKey: '<sha256>',
  payloadFingerprint: '<sha256>',
  libraryEntryId: '<ancla adventure de Biblioteca>',
  versionHash: '<sha256>',
  contentHash: '<sha256>',
  provenance: {},
  approval: {},
  profiles: { adventure: TrawelEditorialProfile, student: TrawelEditorialProfile },
}
```

`mappingId` es el `source_mapping_id` textual. Trawel V2 exige una única
trazabilidad raíz: Investighost usa deterministamente adventure como ancla y
preserva ambas identidades completas en el metadata de cada perfil. La respuesta
contiene un delivery interno; nunca se compara como UUID con el mapping de entrada.

Ambos perfiles son obligatorios. La publicación posterior puede ser por perfil,
pero una delivery V2 no es parcial.

## Provisioning de mapping

El mapping pertenece a la tabla privada Trawel `editorial_destination_mappings`.
Para Albarracín, la fila propuesta es `investighost` /
`zone:espana:albarracin` /
`investighost:zone:espana:albarracin` / `zone` / `albarracin` / `espana` /
`albarracin` / `active`.

Antes de crearla debe comprobarse duplicado por `source_mapping_id`,
`canonical_destination_id` y target activo. Trawel impone unicidad parcial de
`(trawel_entity_type, trawel_entity_id)` cuando `status = active`: el mapping
de prueba activo de Albarracín bloquea esta creación hasta que una decisión
humana autorice archivarlo o inactivarlo. Nunca se reutiliza ni se sobrescribe.
El rollback de una fila productiva aún sin deliveries es `status = inactive`,
no borrado.

## Proyección determinista

`projectLibraryEntryToTrawelEditorialProfile` no lee red, entorno ni datos
remotos. Acepta únicamente Markdown con bloques canónicos:

```md
## [intro] Título visible
...
## [overview] Título visible
...
```

Adventure exige: `intro`, `overview`, `highlights`, `route`,
`practical`, `risks` y `sources`.

Student exige: `intro`, `overview`, `budget`, `daily_life`, `study`,
`practical`, `risks` y `sources`.

`highlights` y `route` son opcionales para Student porque su taxonomía no
los declara. Encabezados repetidos, texto fuera de bloques o campos requeridos
ausentes rechazan el perfil; no se rellena contenido por inferencia.

El metadata conserva identidad de Biblioteca, hashes, aprobación, gaps,
contradicciones y referencias públicas de fuente. Excluye capturas, prompts,
costes, secretos y notas internas.

## Outbox y transporte

El snapshot se persiste antes del POST e incluye mapping textual, destino
canónico, trazabilidad raíz, perfiles, hashes, handoff y fingerprint. La migración
`20260912090000_trawel_ingress_v2_contract.sql` adapta solamente el outbox
propio de Investighost; no toca Trawel ni Biblioteca.

El cliente privilegiado recibe URL completa y secreto por dependencia, o desde
`TRAWEL_INTERNAL_EDITORIAL_DELIVERIES_URL` y
`TRAWEL_INTERNAL_EDITORIAL_DELIVERIES_SECRET` en el proceso privilegiado. Exige
HTTPS salvo mocks locales, manda `content-type: application/json` y
`x-internal-editorial-secret`, aplica timeout y jamás serializa o registra el
secreto.

Éxito, éxito idempotente, conflicto, fallo permanente, fallo reintentable y
timeout ambiguo se distinguen en el servicio.

## Reconciliación

El Edge Function desplegado proporciona `GET /functions/v1/internal-editorial-deliveries/{handoffKey}`
con el mismo header interno. `HttpTrawelDeliveryReconciler` usa ese GET solo
después de un POST ambiguo. Un 404 permite volver a `RETRYABLE`; un estado
`accepted` confirma el snapshot. El POST idéntico continúa siendo idempotente,
pero no sustituye la lectura de reconciliación.

## Runtime y límites

`ExplicitTrawelDeliveryRuntime` es un composition point explícito con un
`CurrentApprovedLibraryPort` inyectado. Su `dryRun` lee ambas entradas aprobadas,
proyecta, calcula hashes, handoff y fingerprint, y devuelve un resumen seguro:
no encola ni hace HTTP. No hay scheduler, renderer ni acceso a Supabase durable
remoto. El host que lo use debe aportar configuración y un port autorizado posteriormente.

Toda respuesta aceptada por Trawel se espera como `draft_only`; este módulo
no contiene transición alguna a `published`.

## Gate para primera entrega real

No se autoriza POST hasta que estén simultáneamente: migración validada en
Supabase local, lectura autorizada de las dos entradas `current approved`,
proyección válida de ambos perfiles, mapping productivo activo, configuración
HTTPS/secret en proceso privilegiado, dry run real reproducible y reconciliación
GET disponible. Ninguno de estos pasos publica contenido.
