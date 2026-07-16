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

## Bucket implementado en FASE 2C-B

`investighost-contributions` se crea por migración con `public=false`, límite 20 MiB y allowlist JPEG/PNG/WebP/PDF. Los paths usan identificador saneado y UUID; el nombre original nunca decide la ruta. SHA-256, MIME y tamaño se verifican antes del upload. La service role local permanece solo en Electron main. El borrado remoto continúa siendo mock y condicionado a persistencia y checkpoint durable.

## Backend y recuperación verificados en CHECKPOINT 7

Supabase Storage local usa el backend `file` sobre un volumen Docker local. Los binarios permanecen fuera de PostgreSQL: `storage.objects` contiene metadatos internos de Storage y `public.contribution_files` conserva metadatos de dominio, relación, bucket/path, MIME, tamaño y SHA-256.

La prueba formal usó un PNG sintético válido de 68 bytes. Se descargó el original por API, se creó un backup binario y manifiesto normalizado fuera del repositorio y se restauró por API en una ruta distinta. Los SHA-256 y tamaños de original, backup y restaurado fueron idénticos; MIME y metadatos fueron coherentes. El bucket privado permitió acceso autorizado y rechazó acceso anónimo/público. Objetos, binarios, manifiesto y scripts temporales se limpiaron.

La recuperación debe usar la API de Storage: no se debe copiar directamente `/mnt` del contenedor ni insertar filas directamente en `storage.objects`. Esta evidencia cubre un objeto sintético sin concurrencia, no un snapshot global consistente de todos los buckets.
