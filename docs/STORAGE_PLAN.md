# Plan de Supabase Storage local — decisión 2C-A

Supabase Storage local es el único almacén de archivos del MVP durante desarrollo. No se guardan adjuntos en carpetas operativas propias de Electron ni se usa SQLite para sus metadatos. PostgreSQL conserva bucket, path, hash, tamaño, MIME, estado, propietario, derechos y retención.

## Buckets lógicos

| Bucket | Acceso | Uso inicial |
|---|---|---|
| `uploads-private` | privado | adjuntos de trabajo |
| `photos-pending` | privado | fotos sin moderar |
| `images-approved` | lectura pública controlada | imágenes aprobadas/publicables |
| `ad-creatives` | privado hasta aprobación | creatividades |
| `exports-private` | privado y temporal | informes/exportaciones |
| `temporary-private` | privado y TTL corto | procesamiento transitorio |

Los nombres finales deberán comprobar colisiones con Trawel antes de una migración remota.

## Controles

- Denegación por defecto; acceso por usuario/rol y prefijos no adivinables.
- Allowlist inicial JPEG, PNG, WebP y PDF; límite inicial 20 MB, ambos configurables por caso.
- Validación de extensión, MIME declarado, magic bytes, tamaño y SHA-256; nunca ejecutar contenido.
- Nombre remoto no determina el path. Se usa UUID y se bloquea path traversal.
- Un conjunto payload+archivos es indivisible para considerar una importación verificada.
- Promoción a público solo tras moderación, derechos/licencia, alt/caption y auditoría.
- Retirada debe invalidar acceso público y conservar evidencia mínima según política.
- Jobs idempotentes eliminan huérfanos y temporales conforme a retención documentada.

## Backup y producción

Antes de permitir borrado de un origen debe existir backup y restauración probada de PostgreSQL y objetos de Storage local. Los backups SQLite de FASE 2B quedan sustituidos. Ningún bucket, objeto o policy del proyecto real de Trawel se consulta o modifica sin aprobación humana explícita.
