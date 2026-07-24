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
- F4A: usuario no técnico busca, filtra, ordena, archiva, restaura y continúa trabajo existente sin perder trazabilidad.
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

Automatic permanece bloqueado. El cierre de FASE 3J no autoriza su implementación: antes deberán consolidarse la Biblioteca y la operación Manual restante, incluida FASE 4A y los gates posteriores que correspondan, y existir una nueva decisión humana expresa. Cuando llegue ese encargo deberá demostrar que cada objetivo invoca el mismo pipeline; el alcance es estable/auditable; una caída no pierde progreso; reanudar no duplica; un fallo no bloquea el resto; costes y errores son visibles; Aventura/Estudiante son diferentes y verificables; y ningún resultado se publica automáticamente. La compatibilidad Trawel se aceptará únicamente mediante el mapper, contrato y cola comunes autorizados en su fase separada.

## Gate FASE 3A — aprobado técnicamente

- La entrada neutral representa un destino, perfiles, idioma, profundidad, opciones, actor e idempotencia.
- El resultado representa identidad, solicitud, ejecución, fuentes, hechos, lugares, actividades, perfiles, calidad, costes y eventos.
- Los contratos rechazan fuentes inexistentes en hechos y hechos/fuentes inexistentes en secciones.
- Los contratos rechazan contenido idéntico entre Aventura y Estudiante.
- Máquinas de estado y ausencia de salto `ready → approved` quedan probadas.
- Ownership, ciclos de vida, tablas, migración, repositorios y tests de 3B están documentados.
- Cero Automatic, publicación, Trawel, producción o proveedor real obligatorio.

## Gate FASE 3B — aprobado técnicamente

- La migración editorial crea 23 tablas normalizadas con UUID, FKs, checks, índices, timestamps y relaciones fuente→hecho→texto explícitas.
- RLS está activa en 23/23 tablas; `anon` y `authenticated` no reciben acceso y el repositorio privilegiado queda en Electron/main local.
- `supabase db reset` aplica ambas migraciones y un seed geográfico sintético y repetible.
- `supabase db lint --level warning` termina sin errores.
- Contratos, schema y repositorio aprueban 16/16 tests; cubren ida/vuelta, idempotencia, versión, checkpoints, locks e identificadores cruzados.
- La integración local real aprueba 1/1: persiste, reconstruye idénticamente y limpia un agregado completo.
- El doble en memoria no se usa como fallback de runtime; no existe otra persistencia durable.
- Producción/Trawel siguen desconectados y no se ejecutaron `supabase link` ni `supabase db push`.

## Gate FASE 3C — aprobado técnicamente

- Fuente GeoNames, licencia CC BY 4.0, versión, alcance, fecha, URLs y hashes quedan fijados en un snapshot revisable.
- España, Comunitat Valenciana y Morella conservan UUID local e ID GeoNames; los fixtures sintéticos están separados.
- La misma entrada y versión resuelven al mismo UUID mediante nombre exacto o alias.
- La búsqueda tolera un typo acotado, pero una entrada ausente devuelve `not_found` y no crea destinos.
- Los homónimos devuelven `ambiguous`; la jerarquía explícita puede resolverlos sin selección silenciosa.
- Una corrección humana solo acepta candidatos visibles, queda ligada a actor/versión y no se reutiliza automáticamente en otra versión.
- Tests de resolución/snapshot 11/11 e integraciones locales 2/2.
- Reset, lint SQL y limpieza de integración aprobados; no quedan solicitudes, correcciones o destinos de test huérfanos.

## Gate FASE 3D — aprobado técnicamente

- Descubrimiento, lectura y evaluación dependen de un puerto neutral sin secretos ni tipos específicos de proveedor.
- El mock completa el flujo y queda marcado inequívocamente como simulación.
- Timeout, cancelación, retry/backoff, intentos, límites, presupuesto y circuit breaker tienen conducta/código probado.
- URLs equivalentes se deduplican; contenido espejo se conserva como duplicado enlazado; enlaces rotos son `unavailable`.
- Uso y costes se reconcilian por intento; eventos no incluyen consultas, cuerpos o credenciales.
- Tests específicos 9/9; ningún proveedor editorial real fue llamado o configurado.

## Gate FASE 3E — aprobado técnicamente

- Solo fuentes aceptadas/leídas entran en estructuración; cero fuentes produce un error explícito.
- Cada hecho conserva fuentes, confianza, categoría, volatilidad, vigencia y estado de revisión válidos.
- Duplicados clave/valor se fusionan; valores incompatibles se conservan como contradicción disputada.
- Lugares y actividades rechazan hechos inexistentes y mantienen relaciones completas de evidencia.
- IDs son deterministas para igual solicitud/clave/valor y toda salida pasa Zod canónico.
- Se guarda checkpoint con hash tras cada fuente y una caída se reanuda sin reprocesar fuentes completadas.
- Contrato, intento, orden de fuentes o hash incompatibles bloquean la reanudación.
- Tests específicos 8/8; no se genera texto editorial desde documentos sin estructura.

## Gate FASE 3F — aprobado técnicamente

- Aventura y Estudiante usan especificaciones/versiones y secciones obligatorias diferentes.
- Aventura cubre destacados/ruta/preparación; Estudiante cubre presupuesto/vida diaria/estudio.
- Cada sección enlaza exclusivamente hechos existentes y fuentes pertenecientes a esos hechos.
- Longitudes, expresiones prohibidas, IDs/versiones, coste, presupuesto y cancelación están validados.
- Regenerar una sección exige motivo, crea una versión enlazada y deja las demás secciones intactas.
- El borrador anterior permanece inmutable y consultable; Supabase conserva v1/v2.
- Tests específicos 8/8, reset/lint SQL e integración de historial 1/1 aprobados.

## Gate FASE 3G — aprobado técnicamente

- RevisIAtor es independiente del generador, determinista y versionado.
- Cada perfil recibe checks de schema, cobertura, trazabilidad, fuentes, contradicción, duplicado, clichés, relleno, geografía, idioma, coherencia, diferenciación, volatilidad y seguridad.
- Cada check conserva severidad, evidencia, corrección, responsable y regla.
- La precedencia produce `passed`, `passed_with_warnings`, `changes_requested`, `blocked` y `rejected` en escenarios probados.
- Evidencia rota y seguridad sin cubrir bloquean; schema inválido no produce resultados engañosos.
- Un resultado técnico `passed` deja el borrador en `ready`; `requiresHumanDecision` permanece verdadero.
- Tests específicos 8/8; RevisIAtor nunca aprueba humanamente ni publica.

## Gate FASE 3H — aprobado técnicamente

- Un operador resuelve un destino o elige una ambigüedad visible desde Electron, sin SQL.
- Perfiles, profundidad, notas y presupuesto se configuran antes de iniciar.
- Biblioteca y detalle sobreviven mediante Supabase local; no existe fallback a memoria/SQLite.
- Fuentes, hechos, lugares, actividades, perfiles, checks, costes y eventos son consultables.
- Aventura y Estudiante se comparan lado a lado con estructura y utilidad diferentes.
- Editar o regenerar exige motivo, crea otra versión y conserva la anterior.
- RevisIAtor debe pasar o advertir antes de entrar en revisión humana.
- Aprobar/rechazar/solicitar cambios exige `in_review`; ningún botón publica o llama a Trawel.
- Tests Manual 5/5 e integración Supabase local 1/1 aprobados.
- Reintento, cancelación y reanudación durable de fallos quedan como gate obligatorio de 3I.

## Gate FASE 3I — aprobado técnicamente

- Scaffold y control durable existen antes de proveedores; fuentes/documentos, hechos, borradores, calidad y agregado final tienen checkpoints verificables.
- Reiniciar reanuda el mismo intento; reintentar un fallo crea otro run enlazado y no repite etapas válidas.
- Checkpoint corrupto, de otro contrato o configuración se rechaza con error explícito.
- Lock atómico, lease renovable y heartbeat impiden doble ejecución accidental en memoria y Supabase local.
- Cancelación se persiste antes del abort, identifica actor, termina en estado seguro y libera el lock.
- Backoff e intentos son acotados; al agotarse exigen intervención explícita.
- Presupuesto acumulado incluye ejecuciones y regeneraciones; reutilizar checkpoint no duplica coste.
- Caídas sintéticas de proveedor, base y Electron quedan visibles y recuperables.
- El Manual guarda documentos acotados en PostgreSQL y no depende de Storage; su indisponibilidad no corta el pipeline.
- UI e IPC ofrecen reanudar, reintentar y cancelar sin exponer secretos ni requerir terminal.
- Tests de resiliencia 9/9, Manual 5/5 e integración Manual Supabase 2/2 aprobados; reset, lint SQL, typecheck, lint y build aprobados.
- Automatic continúa bloqueado; la aprobación humana de FASE 3J no autoriza su implementación.

## Gate FASE 3J — aprobado y cerrado

- El protocolo y el acta cerrada están en `FASE_3J_ACEPTACION_HUMANA_MANUAL.md`.
- J01–J17 fueron ejecutados y aprobados expresamente por el jefe del proyecto.
- El defecto de J14 sobre consulta y reapertura del rechazo se corrigió; el escenario se repitió y quedó aprobado con dos ciclos de decisión trazables.
- La corrección J14 permite `rejected → in_review`, exige comentario y registra `manual.review.reopened` sin nueva versión, solicitud, run o coste.
- J15 confirmó aprobación local sin publicación; J16 reconcilió versiones, eventos y 0,26 EUR; J17 confirmó las fronteras negativas.
- Decisión inequívoca: **FASE 3J APROBADA**.
- La aprobación no inicia FASE 4 ni autoriza Automatic, publicación, Trawel, producción o proveedores reales.

## Gate técnico FASE 4A-01 — preparado, pendiente de decisión humana

- La consulta de Biblioteca usa un contrato Zod compartido desde renderer/preload hasta servicio y repositorio.
- La entrada se valida en IPC y no expone tipos internos del repositorio al renderer.
- El tamaño predeterminado es 25, el máximo es 100 y los valores inválidos se rechazan.
- El orden canónico es `updated_at DESC, id DESC`.
- El cursor conserva orden, dirección, timestamp y request ID; rechaza fechas, UUID, campos, direcciones y propiedades arbitrarias no válidas.
- Supabase aplica keyset pagination, no offset, y lee un elemento adicional para calcular `hasMore`.
- Memoria y Supabase conservan la misma semántica.
- Una prueba recorre 137 solicitudes con timestamps empatados sin duplicar ni omitir ninguna.
- Una prueba sin red verifica paridad del adaptador Supabase y ausencia de mutaciones; la integración real equivalente queda opt-in y con limpieza.
- Listar o avanzar página no crea solicitudes, runs, versiones o eventos; no cambia estados o fechas y no genera coste.
- El resultado no presenta totales o contadores de una página como globales.
- El coste disponible se identifica como `latestRunActualCost`; el coste acumulado definitivo sigue reservado a `editorial_execution_controls.spent_cost`.
- Incidencia activa e histórica son conceptos contractualmente distintos; el agregado histórico queda fuera de 4A-01.
- La Biblioteca actual carga y abre el detalle desde la primera página.
- Pruebas específicas: 43 aprobadas. Suite normal: 161 aprobadas y 9 integraciones opt-in omitidas.
- Typecheck, ESLint, builds renderer/main/preload y `git diff --check`: aprobados.
- No existe migración nueva y no se ejecutaron migraciones, seeds o comandos Supabase.
- Búsqueda, filtros, ordenación UI, read model, archivo, contadores y preferencias no se iniciaron.
- Publicaciones permanecen en cero; Trawel, producción, Automatic, IA y proveedores reales siguen desconectados.

El bloque queda preparado para revisión técnica y decisión humana. No autoriza commit/push ni FASE 4A-02 por sí solo.

## Gate futuro FASE 4A — criterios documentales

Estado: **DISEÑADO — IMPLEMENTACIÓN NO AUTORIZADA**.

La futura aceptación de Consolidación operativa de Biblioteca deberá demostrar como mínimo:

- Buscar por destino, país, título, identidad canónica, identificador visible, perfil o estado devuelve únicamente datos propios pertinentes.
- Buscar, filtrar u ordenar no crea solicitudes, runs, versiones o eventos de investigación, no invoca proveedores y no añade coste.
- Los filtros cubren estado, etapa, incidencia, situación editorial, perfil, fechas y presencia de incidencias.
- La ordenación cubre actividad, creación, destino, estado, coste y última decisión editorial.
- La selección de filtros y ordenación sobrevive al reinicio cuando el diseño autorizado determine que debe conservarse como preferencia.
- Archivar retira el elemento de la vista operativa ordinaria sin borrar fuentes, hechos, secciones, versiones, costes, eventos o decisiones humanas.
- La consulta de archivados permite abrir el detalle y auditar toda su evidencia.
- Restaurar devuelve el elemento a la vista operativa sin crear una solicitud, run o versión.
- Versiones, eventos, costes, comentarios, actores, fechas y decisiones son idénticos antes y después de archivar/restaurar.
- Los indicadores de trabajo distinguen ejecución, incidencia, revisión, aprobación, rechazo y archivo, y no se presentan como publicaciones.
- No aparece acción de publicación y el contador de publicaciones permanece en 0.
- No se conecta ni invoca Trawel o producción.
- No se activa Automatic, IA o proveedores reales.
- No se ofrece borrado destructivo ordinario.
- Una persona no técnica puede localizar contenido, reconocer su estado, abrirlo, continuar una revisión, distinguir una incidencia, archivarlo y restaurarlo sin ayuda externa.
- El comportamiento se valida con una biblioteca suficientemente poblada mediante datos sintéticos para revelar estados vacíos, combinaciones de filtros, ordenaciones y navegación realista.
- Reiniciar Electron conserva los datos durables y las preferencias expresamente incluidas en el diseño, sin alterar el resultado de búsquedas o el archivo.

El gate exigirá pruebas automatizadas relevantes, validación local y aceptación humana. Estos criterios no autorizan código, migraciones, seeds, integraciones o cambios de UI en el presente cierre documental.
