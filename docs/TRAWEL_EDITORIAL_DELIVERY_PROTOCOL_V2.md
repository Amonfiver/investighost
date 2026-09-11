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
  profiles: { adventure: TrawelEditorialProfile, student: TrawelEditorialProfile },
}
```

`mappingId` es el `source_mapping_id` textual. El UUID interno que Trawel
devuelva en su respuesta es una identidad remota/receipt, nunca se compara con
el mapping de entrada.

Ambos perfiles son obligatorios. La publicación posterior puede ser por perfil,
pero una delivery V2 no es parcial.

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
canónico, perfiles, hashes, handoff y fingerprint. La migración
`20260912090000_trawel_ingress_v2_contract.sql` adapta solamente el outbox
propio de Investighost; no toca Trawel ni Biblioteca.

El cliente privilegiado recibe URL completa y secreto por dependencia, o desde
`TRAWEL_INTERNAL_EDITORIAL_DELIVERIES_URL` y
`TRAWEL_INTERNAL_EDITORIAL_DELIVERIES_SECRET` en el proceso privilegiado. Exige
HTTPS salvo mocks locales, manda `content-type: application/json` y
`x-internal-editorial-secret`, aplica timeout y jamás serializa o registra el
secreto.

Éxito, éxito idempotente, conflicto, fallo permanente, fallo reintentable y
timeout ambiguo se distinguen en el servicio. No se presupone un GET remoto:
la reconciliación usa `TrawelDeliveryReconciler`; sin implementación queda
`NOT_CONFIGURED` y el outbox continúa en reconciliación.

## Runtime y límites

`ExplicitTrawelDeliveryRuntime` es un composition point explícito con un
`CurrentApprovedLibraryPort` inyectado. No hay scheduler, renderer ni acceso
a Supabase durable remoto. El host que lo use debe aportar configuración y un
port autorizado posteriormente.

Toda respuesta aceptada por Trawel se espera como `draft_only`; este módulo
no contiene transición alguna a `published`.
