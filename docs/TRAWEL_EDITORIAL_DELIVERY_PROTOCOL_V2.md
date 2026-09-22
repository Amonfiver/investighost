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
  // Optional, destination-level V2 extension. Omit for text-only consumers.
  destinationVisuals?: { imageSlot1: ..., imageSlot2: ... },
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
`practical` y `risks`.

Student exige: `intro`, `overview`, `budget`, `daily_life`, `study`,
`practical` y `risks`.

La única excepción de heading permitida es para Student y es literal:
`## Introducción` equivale a `## [intro] Introducción`. No se aceptan
variantes, sinónimos ni encabezados parcialmente coincidentes. No existen
aliases para Adventure `risks` ni para Student `daily_life` o `practical`.

Las fuentes no se declaran en Markdown: se proyectan exclusivamente desde
`LibraryEntry.sources`, que debe contener al menos una fuente durable. La
proyección conserva solo `sourceId`, título, URL HTTPS, publisher público si
existe, fecha de publicación y hash; ordena por `sourceId` y no incluye
capturas, prompts, costes, secretos ni notas internas.

`highlights` y `route` son opcionales para Student porque su taxonomía no
los declara. Encabezados repetidos, texto fuera de bloques o campos requeridos
ausentes rechazan el perfil; no se rellena contenido por inferencia.

El body de cada perfil es exclusivamente contenido de consumo. Antes de que una
revisión pueda ser `currentApproved`, el contrato `PUBLIC_SAFE` rechaza IDs de
claims/evidencia/gaps, estados y lenguaje de auditoría, referencias a expediente
o dossier y Markdown escapado visible. La trazabilidad completa (claims, gaps,
contradicciones, procedencia y evidencia de revisión) permanece en Investighost;
no se proyecta como texto, lista ni metadata consumible de Trawel. El metadata
V2 conserva únicamente identidad de Biblioteca, hashes y aprobación necesarios
para el handoff. Las fuentes siguen siendo referencias públicas estructuradas.

Markdown válido, incluido `**énfasis**`, se conserva; se rechaza solo el escape
visible, por ejemplo `\\*\\*énfasis\\*\\*`.

## Slots visuales opcionales

V2 admite opcionalmente `destinationVisuals`, con `imageSlot1` (hero) e
`imageSlot2` (supporting), pertenecientes al destino y no a Adventure/Student.
Los estados son `EMPTY`, `PENDING`, `APPROVED` y `REJECTED`. La ausencia de
slots o dos slots `EMPTY` no bloquea la publicación textual ni cambia el payload
text-only existente.

La proyección V2 solo transporta asset, URL y atribución de un slot `APPROVED`
con permiso de uso, derechos comprobados y `approvedForPublicUse = true`. Una
referencia `referenceOnly`, pendiente o rechazada conserva sus datos internos en
Investighost y no cruza como imagen pública. Trawel solo muestra los metadatos
recibidos; no decide derechos, licencia, atribución ni sustituciones.

## Visual Bridge V1 — colección editorial canónica

Los dos slots permanecen como compatibilidad para payloads V2 ya existentes,
pero no son la fuente de verdad para media nueva. Visual Bridge V1 modela una
colección durable de assets asociada a un destino y un paquete editorial con
selecciones explícitas por modo (`adventure`/`student`) y rol (`hero`,
`highlight`, `gallery`). Un mismo archivo puede pertenecer a ambos modos sin
duplicarse.

Investighost es la autoridad de categoría editorial, lugar asociado, alt,
caption, atribución, derechos, publicabilidad, prioridades y orden de
selección. Trawel recibe solamente la proyección saneada: URL pública,
metadata de atribución, categoría, modos y selecciones ordenadas. No recibe
`sourceUrl`, identidad interna de storage, revisión de derechos, candidatos
pendientes/rechazados ni razonamiento editorial.

La regla es fail-closed: `UNKNOWN`, `PENDING`, `REFERENCE_ONLY` y `REJECTED`
no son publicables. Solo `APPROVED` + `APPROVED_FOR_PUBLIC_USE` + permiso de
uso + revisión de derechos + URL/alt/atribución puede formar parte de un
paquete aprobado. Un paquete puede ser `PARTIAL` sin afectar la aprobación
textual de Adventure o Student; `COMPLETE` es una medida de preparación visual,
no un requisito para publicar texto.

El campo opcional `destinationVisualMedia` está preparado internamente para el
handoff y se incorpora a `handoffKey` y `payloadFingerprint`. No se envía a
Trawel hasta que el receiver soporte la extensión. Su hash excluye timestamps y
provenance privada, por lo que un replay del mismo conjunto público conserva la
idempotencia. La futura capa de adquisición/storage deberá poblar el dominio;
Visual Bridge V1 no busca, descarga ni publica imágenes.

## Visual Acquisition V1 — candidatos Wikimedia Commons

La primera fase de adquisición usa la Action API oficial de Wikimedia Commons
con `generator=search` limitado al namespace de ficheros e `imageinfo` para
obtener URL original, MIME, dimensiones, tamaño y `extmetadata`. El adapter no
scrapea HTML, no descarga bytes, no crea URLs públicas y no participa en el
handoff.

Un `visual candidate` es evidencia interna, no un asset de Visual Bridge ni un
medio publicable. Se persiste de forma idempotente por destino, proveedor y
`providerAssetId`; conserva autor real (`Artist`) separado del uploader, fuente,
licencia, atribución reconstruible, metadata hash y clasificación de rights.
Solo dominio público/CC0/CC BY verificables con autor, fuente y licencia
completos pueden quedar `ELIGIBLE` para una fase posterior. ShareAlike,
NoDerivatives, NonCommercial, licencia personalizada, metadata incompleta o
derechos inciertos permanecen `REFERENCE_ONLY`; MIME o dimensiones inválidos se
rechazan. Ningún estado de candidato cambia la validez textual de Adventure o
Student.

La fase siguiente podrá seleccionar candidatos, descargar los que procedan y
promoverlos a storage después de otra validación. Hasta entonces, no existe
conversión automática desde candidato a asset aprobado.

## Visual Storage V1 — staging y promoción aprobada

Un candidato `ELIGIBLE` no se entrega ni se proyecta directamente. La promoción
sigue una frontera durable: selección determinista → descarga privada →
validación de MIME, magic bytes, tamaño, dimensiones y SHA-256 → dedupe global
por checksum → objeto público aprobado → asset de Visual Bridge → paquete
visual. El staging se guarda en `visual-staging-private`; solo
`images-approved` contiene objetos públicos y solo tras el gate final de
derechos, atribución y alt existente.

La ruta pública usa `v1/by-checksum/<sha256>.<ext>`: el checksum identifica el
objeto físico y evita duplicar bytes entre queries o candidatos. La provenance
se retiene en PostgreSQL mediante la relación asset/candidate. Los fallos de
derechos o validación son fail-closed; los candidatos se conservan y el texto
editorial no queda bloqueado. Esta fase no modifica handoff, outbox ni Trawel.

Pack A no convierte contenido narrativo libre en estructura editorial. Las
secciones estructurales pendientes de Albarracín continúan rechazándose y
requieren la revisión durable de Pack B antes de cualquier dry run real.

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
