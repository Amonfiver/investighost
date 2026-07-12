# Contrato de publicación para la superficie Trawel

Fuente obligatoria: `TRAWEL_DATABASE_REFERENCE_FOR_INVESTIGHOST.txt`. Contrato Zod: `TrawelHandoffContractSchema`, versión `1.0`. “Handoff” significa una transición validada hacia tablas/vistas públicas del mismo Supabase productivo compartido, no una copia entre bases. Esta fase no conecta ni escribe.

## Precondiciones

- ContentPiece `approved`, con actor y fecha.
- Payload Zod válido y `idempotencyKey` única por `contentPieceId + version + target`.
- Entorno, backup y registro de prueba autorizados en PAUSA HUMANA 6.
- Primer estado siempre `draft` para destinations y `draft|review` para editorial_contents. `published` solo mediante acción humana posterior.

## Mapeo

| Interno | Trawel | Regla |
|---|---|---|
| countrySlug | countries.slug | resolver existente; si falta, detener |
| city.slug/name/content/coordinates/advice/pending | cities campos equivalentes | resolver country_id; ciudad única por country_id+slug |
| destination slug/title/summary/modes/type/tags/visita/precio/horario/tip/verificación/pending | destinations | mapper de type; status draft |
| destination sources title/url/type/supports | destination_sources | insertar tras resolver destination_id |
| contenido genérico, practicalTips, secciones, fuentes globales | editorial_contents | solo cuando no existe columna legacy adecuada; evitar metadata cajón de sastre |

`partially_verified` interno se mapea a `pending`; `verified` a `verified`; `disputed` a `disputed`. Datos volátiles no verificados quedan nulos/prudentes y en `pending_verification`.

## Sin destino directo / solo Investighost

Confianza global, prompts, modelo/proveedor, tokens, coste, calidad, notas, logs, errores, resultados rechazados, PII, consentimientos y auditoría interna. `globalPendingVerification` se conserva internamente o se distribuye explícitamente antes del handoff.

## Orden, idempotencia y duplicados

1. Resolver `countries.slug`; no crear automáticamente.
2. Upsert city por `country_id + slug`; recuperar ID.
3. Upsert destination por `country_id + city_id + slug`; recuperar ID.
4. Fuentes: deduplicar por `destination_id + canonicalUrl`; no borrar fuentes previas sin modo de sincronización aprobado.
5. `editorial_contents`: detectar por entidad+slug+mode+versión/estado; nunca insertar duplicado ciego.
6. Registrar payload hash, IDs resueltos, respuesta, error y correlationId en PublicationAttempt/AuditLog.

En reintento con misma key y hash se devuelve el resultado previo. Misma key con hash distinto es conflicto y se detiene.

## Errores parciales

Un fallo deja el attempt `partial` o `failed`, conserva IDs ya creados y no marca published. No hay rollback destructivo automático. El operador recibe detalle por paso y reanuda idempotentemente tras corregir.
