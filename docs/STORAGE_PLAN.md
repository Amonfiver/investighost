# Plan de Supabase Storage — FASE 2A

Estado: diseño **NO EJECUTADO**.

| Bucket lógico | Público | Contenido | MIME inicial | Máximo inicial | Retención propuesta |
|---|---:|---|---|---:|---|
| `investighost-uploads-private` | no | cargas de operador sin aprobar | jpeg/png/webp/pdf | 20 MB | 30 días o hasta clasificar |
| `investighost-photos-pending` | no | fotos de usuarios en moderación | jpeg/png/webp | 15 MB | 90 días tras decisión, sujeto a retirada/legal |
| `trawel-images-approved` | lectura pública controlada | imágenes aprobadas | jpeg/png/webp/avif | 15 MB | mientras licencia/finalidad siga vigente |
| `investighost-ad-creatives` | no por defecto | creatividades | jpeg/png/webp/gif/mp4 | 25 MB imagen; 100 MB vídeo | contrato + plazo legal |
| `investighost-reports-private` | no | PDF/CSV de informes | pdf/csv | 25 MB | 30 días, configurable |
| `investighost-temporary` | no | transformaciones/chunks | tipos estrictamente necesarios | 50 MB | 24 h |

Los nombres son propuestos; `trawel-images-approved` debe contrastarse con buckets productivos existentes para no duplicar.

## Seguridad y ciclo de vida

- Paths no contienen email/nombre: `{environment}/{entityType}/{entityId}/{uuid}-{variant}`.
- Upload usa sesión autenticada o signed upload de corta duración; nunca bucket público de escritura.
- Se valida extensión, MIME declarado, magic bytes, tamaño y dimensiones; escaneo antimalware server-side antes de promoción.
- La aprobación crea/copia un objeto inmutable hacia el bucket aprobado y una fila `image_assets`; nunca se hace público el objeto pendiente.
- Signed URLs cortas para privado. Public URLs solo tras derechos, consentimiento, alt, crédito/licencia y revisión.
- Reemplazos usan nueva key/version; la retirada despublica la fila y revoca/elimina derivados según obligaciones.
- Job de huérfanos compara objetos y metadatos; cuarentena antes de borrar. Temporales expiran automáticamente.
- RLS de `storage.objects` limita bucket/prefijo/rol; moderador no puede acceder a informes o creatividades ajenas.

## Decisiones pendientes

Confirmar buckets existentes de Trawel, CDN/transformaciones, tamaños reales, antivirus, política de retirada, retenciones y licencias admitidas antes de FASE 7/11.

## Descarga local de contribuciones — FASE 2B

Los adjuntos del buzón temporal se guardan fuera de SQLite bajo el `userData` de Electron. La ruta usa un identificador remoto saneado y un UUID generado localmente; nunca el nombre remoto. Se admiten inicialmente JPEG, PNG, WebP y PDF hasta 20 MB por archivo, se verifica tamaño y SHA-256 y no se ejecuta contenido. El borrado remoto solo puede ocurrir después de verificar todos los archivos indivisibles y un backup reciente. En 2B todo origen y borrado es mock.
