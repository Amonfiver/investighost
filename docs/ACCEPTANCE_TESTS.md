# Criterios de aceptación canónicos

## Contratos automatizados de FASE 1B

- Enums válidos aceptados y valores desconocidos rechazados.
- Transiciones permitidas/prohibidas de producción y publicación.
- ResearchRequest y ResearchResult válidos.
- ResearchSource exige URL HTTPS real con formato válido.
- ContentPiece no entra en publicación sin producción aprobada y evidencia.
- Campaign fuera de draft exige aprobación legal y baja.
- Advertisement aprobado exige aprobador y rango de fechas válido.
- Handoff Trawel acepta draft revisado, rechaza `published` directo y URLs malformadas.

Evidencia: `tests/contracts.test.ts`. Estos tests verifican contrato, no persistencia ni integración real.

## Gates por fase futura

- F2: Auth/RLS probadas por rol, secretos ausentes del renderer, sync/conflictos y auditoría durable.
- F3: fuentes reales trazables, fallos honestos, coste/tokens auditados y aceptación editorial humana.
- F4: usuario no técnico crea, edita, revisa y aprueba sin ayuda externa.
- F6: handoff idempotente en entorno controlado, draft visible y cero escrituras no autorizadas.
- F7–F14: criterios específicos de legal, moderación, campañas, anuncios y métricas reales antes de activación.
- F15: backups/restauración, E2E, accesibilidad, seguridad y release aprobados.

## Gate de FASE 1B

`npm run lint`, `npm run typecheck`, `npm test` y `npm run build:vite` deben pasar. La aceptación humana debe cerrar o aplazar explícitamente las decisiones de Supabase, usuarios/roles, correo, consentimiento y analytics antes de FASE 2.

## Gate documental de FASE 2A

- Una sola base productiva compartida y un Supabase dev separado aparecen sin ambigüedad en arquitectura y decisiones.
- Cada entidad está clasificada como pública compartida, privada, local, vista, Storage o futura.
- RLS usa denegación por defecto y contiene casos allow/deny para anon, authenticated y ocho roles.
- Storage define privacidad, MIME/tamaño, retención, promoción, huérfanos y derechos.
- Sync especifica autoridad, UUID, versiones, outbox, idempotencia, conflictos, tombstones y limpieza.
- Las 15 migraciones incluyen propósito/dependencias, rollback lógico, riesgos, compatibilidad y estado **NO EJECUTADA**.
- Protecciones dev/prod cubren variables distintas, allowlist, banner, scripts, service role y backup.
- No existen conexiones, SQL ejecutado, claves nuevas, datos reales ni cambios de negocio.
- Verificación requerida: lint, typecheck, tests y build Vite verdes.

FASE 2B no comienza hasta aceptación humana de este gate y confirmación de organización/región/nombre del proyecto dev.

## Gate de FASE 2B — importación local verificada

- Cola y persistencia por registro con `remote_id` e idempotency key únicas.
- Payload validado con Zod, tamaño y SHA-256; archivos con MIME permitido, tamaño y SHA-256.
- Nombres remotos no controlan rutas; path traversal queda bloqueado.
- Error individual no cancela lote ni borra el remoto.
- Borrado fallido conserva copia local y permite reintentar solo el borrado.
- Reintentos acotados: inmediato, 30 s, 2 min, 10 min y después manual.
- Backup verificado obligatorio antes de solicitar borrado.
- UI muestra resumen, estados, errores y reintento individual usando IPC limitado.
- Tests obligatorios: red, corrupción, hash distinto, duplicado, borrado fallido, retry individual y lote parcial.
- Solo adaptador mock; cero conexión o borrado real.

## Gate documental de FASE 2C-A

- Supabase local figura como única persistencia y Storage local como almacén de archivos del MVP.
- SQLite queda explícitamente fuera de fallback, caché, cola, outbox y modo offline.
- `SQLITE_SYNC_STRATEGY.md` está marcado histórico/deprecado y apunta al documento sustituto.
- Los controles reutilizables de FASE 2B se separan de sus adaptadores SQLite.
- Existe plan de transición y criterio verificable de retirada completa.
- Producción Trawel permanece desconectada y exige autorización humana explícita futura.
- No se modifican TypeScript, React, Electron, tests ni SQL en esta fase.

## Gate futuro de FASE 2C-B

- `supabase db reset` reconstruye el entorno local con migraciones versionadas y seeds sintéticos.
- Jobs, reintentos, idempotencia, auditoría y contribuciones sobreviven reinicios en PostgreSQL.
- Archivos y checksums se verifican en Storage local; backup y restauración se prueban.
- No quedan imports, dependencias, configuración, schemas, repositorios ni rutas runtime SQLite.
- Lint, typecheck, tests y build pasan sin conexión a producción.
