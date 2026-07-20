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

## Gate técnico de FASE 2C-C — aprobado

- SQLite, Better SQLite y Drizzle están ausentes de dependencias, scripts, configuración, schemas, repositorios y runtime; no existe fallback.
- `supabase db reset` reconstruye el entorno local con migración y seed sintético: siete tablas, 46 constraints, cinco FKs, 19 índices, dos funciones, siete triggers, RLS en siete tablas y cero secuencias.
- Backup/restauración PostgreSQL real aprobados en CHECKPOINT 5: dump custom `-Fc`, SHA-256, restauración aislada y estructura verificada.
- Backup/restauración Storage real aprobados en CHECKPOINT 7: PNG sintético, API, tres hashes/tamaños idénticos, privacidad y limpieza.
- CHECKPOINT 8 aprobó typecheck, lint, 62/62 tests generales, 1/1 integración y 63/63 total antes y después del reset.
- Bucket `investighost-contributions` privado, 20 MiB, JPEG/PNG/WebP/PDF y cero objetos tras limpieza.
- Build aprobado con limitación conocida: TypeScript/Vite/main/preload y `win-unpacked` completados; falla solo la creación de symlinks `winCodeSign`.
- Producción y Trawel permanecen desconectados; no se usaron credenciales remotas, `supabase link` ni `supabase db push`.

## Evidencia FASE 2C-B

- `supabase db reset` reconstruye siete tablas, constraints, función transaccional, bucket privado y escenarios sintéticos.
- La configuración acepta solo loopback y falla de forma explícita si falta configuración o servicio.
- Tests unitarios cubren idempotencia, reintento aislado, archivo/hash erróneo, conflictos, continuidad y borrado condicionado sin Docker.
- La prueba de integración opt-in escribe y lee contribuciones en Supabase local; no existe fallback SQLite.
- Renderer informa conectado/desconectado y mantiene el adaptador remoto mock.

## Gate futuro de Automatic

Automatic permanece bloqueado hasta que 2C esté finalizada y un destino Manual complete investigación, fuentes, perfiles editoriales, persistencia, calidad, revisión y aprobación con contratos estables. Después deberá demostrar que cada objetivo invoca ese mismo pipeline; el alcance es estable/auditable; una caída no pierde progreso; reanudar no duplica; un fallo no bloquea el resto; costes y errores son visibles; Aventura/Estudiante son diferentes y verificables; y ningún resultado se publica automáticamente. La compatibilidad Trawel se acepta únicamente por el mapper/contrato/cola ya comunes.

## Gate FASE 3A — aprobado técnicamente

- La entrada neutral representa un destino, perfiles, idioma, profundidad, opciones, actor e idempotencia.
- El resultado representa identidad, solicitud, ejecución, fuentes, hechos, lugares, actividades, perfiles, calidad, costes y eventos.
- Los contratos rechazan fuentes inexistentes en hechos y hechos/fuentes inexistentes en secciones.
- Los contratos rechazan contenido idéntico entre Aventura y Estudiante.
- Máquinas de estado y ausencia de salto `ready → approved` quedan probadas.
- Ownership, ciclos de vida, tablas, migración, repositorios y tests de 3B están documentados.
- Cero Automatic, publicación, Trawel, producción o proveedor real obligatorio.
