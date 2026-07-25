# Auditoría previa al piloto real

Fecha: 2026-07-25

Rama: `feat/investighost-real-pipeline`

Checkpoint protegido: `18d8d33113c1412de07fb9f4189116100ccfa84b`

Alcance: PROMPT 01–10 y correcciones 10B–10D, sin ejecutar PROMPT 11.

## Dictamen

**GO para preparar PROMPT 11 bajo una autorización separada.**

La divergencia de idempotencia durable está corregida. PROMPT 10D añadió una ruta exclusiva de conectividad, separada del pipeline Morella, con conversión `connectivity-fx-2026-07-25.1`, presupuesto absoluto `0,02 EUR`, concurrencia 1, cero rondas, cero regeneraciones y cero reintentos. El 2026-07-25 a las 20:59 CEST el preflight aprobó todos sus controles y se ejecutaron exactamente una llamada Tavily Search basic y una llamada OpenAI Responses con `gpt-5.6-luna`.

Ambas llamadas quedaron conciliadas por `0,008077 EUR`, con dos reservas terminales, cero pendientes, cero coste retenido y guarda libre. Este GO solo permite preparar el siguiente bloque: no ejecuta ni autoriza por sí mismo PROMPT 11, Morella, Aventura, Estudiante, publicación, Trawel, producción o Automatic.

## Reauditoría de bloqueos

### B1 — Conflicto idempotente durable: resuelto

La migración `20260725183730_fix_provider_reservation_idempotency.sql` reemplaza únicamente `public.reserve_provider_call`; la migración original permanece intacta. Bajo el mismo advisory lock, la función devuelve la reserva existente solo si coinciden todos los campos de atribución, presupuesto y facturación. `reserved_cost` se valida contra el coste estimado que determina la reserva máxima y `input_hash` cubre de forma canónica atribución, facturación, payload y límites.

Ante cualquier diferencia produce exclusivamente `IDEMPOTENCY_CONFLICT`; no crea una segunda reserva, no altera la original, no aumenta presupuesto y no añade ledger. En TypeScript, `CostLedgerError` lo expone como error tipado, sanitizado y `retryable: false`.

Evidencia:

- primera reserva y repetición idéntica;
- conflictos de proveedor, modelo, etapa, operación, coste/reserva, moneda/tarifa, request, run, tarea, lote, intento y hash;
- carreras idénticas y conflictivas con dos sesiones PostgreSQL;
- presupuesto, ledger y reserva original intactos;
- rollback transaccional y eliminación de la base concurrente aislada;
- datos humanos iguales antes y después.

### B2 — Clientes reales: implementados y conectividad mínima validada

Tavily usa `https://api.tavily.com`, autenticación Bearer, Search/Extract, `request_id`, uso/créditos, timeout, cancelación, límites, validación Zod y errores sanitizados. OpenAI usa el SDK ya instalado, Responses API, Structured Outputs estrictos, uso y entrada cacheada, refusal/incomplete, timeout, cancelación y límite de salida. Ambos se probaron únicamente con transportes falsos inyectados.

La UI expone una única acción `Probar conectividad real`, con confirmación humana literal y resumen de proveedor, modelo, dos llamadas y `0,02 EUR`. La acción no usa el cliente Tavily editorial que encadena Extract: dispone de un cliente específico que solo hace `/search`. OpenAI se construye con `maxRetries: 0`, `store: false`, sin tools y con razonamiento `none`. Después de la ejecución, el historial durable bloquea un segundo intento.

### B3 — Preflight operativo sin red: implementado

El preflight consulta solo el snapshot público del Centro de proveedores y Supabase local. Comprueba credenciales presentes, activación, Luna, vigencia de tarifa, conversión 1:1, presupuesto exclusivo, publicación/regeneración, Trawel, Automatic, ledger, guarda y ausencia de actividad real previa. Devuelve uno de los ocho estados definidos, declara `researchExecutionAllowed: false` y solo habilita conectividad cuando todos los controles pasan.

Tras las dos llamadas, `connectivity_history` bloquea durablemente otra prueba. La feature flag se habilitó solo en el proceso autorizado; no se persistió en `.env`. El preflight nunca autoriza investigación.

## Hallazgos no bloqueantes y deuda

- El código legacy se conserva para evitar una retirada arriesgada, pero sus entradas de configuración, fábrica/Kimi, Brave, orquestación, investigación y `startResearch` están deprecadas y protegidas por `LEGACY_PROVIDER_RUNTIME_DISABLED`. El pipeline nuevo y Electron main no las importan.
- Los logs legacy de input completo y preview se retiraron. El error del guard no contiene credenciales, prompts o inputs y no es reintentable.
- El comentario del advisory lock aparece duplicado en la migración. No cambia el SQL ejecutable.
- Los checkpoints del piloto fake y el repositorio usado por su ledger son implementaciones en memoria. El piloto real debe usar persistencia durable y no asumir que la prueba fake demuestra recuperación tras caída de proceso.
- Las tarifas oficiales se conservan en USD y caducan operativamente el 2026-08-25 si no se reverifican. 10D fija para conectividad una conversión conservadora `1 USD = 1 EUR`, versionada y documentada como decisión humana, no como cotización bancaria. PROMPT 11 deberá confirmar si reutiliza expresamente esta política.
- La tarifa de Tavily representa pay-as-you-go a 0,008 USD/crédito; el coste efectivo de un plan contratado puede diferir y debe seleccionarse explícitamente antes de reservar gasto real.
- Saldo `not_consultable` solo puede producir advertencia y exige comprobación humana documentada.

## Evidencia revisada

### Arquitectura y límites

- Investighost conserva la orquestación.
- `ResearchTool` e `IntelligenceEngine` son puertos inyectables.
- OpenAI recibe expediente/conocimiento y no declara web search.
- Los contratos solo admiten rondas 1 y 2.
- La ampliación exige carencia relevante y consultas focalizadas no equivalentes.
- Tras ronda 2 no existe continuación automática.
- Aventura y Estudiante comparten expediente y conocimiento maestro.
- El piloto fake fija regeneraciones, publicaciones y efectos externos en cero.
- El gate Morella exige una tarea, concurrencia 1, máximo dos rondas y cero regeneración/publicación.
- Los clientes reales existen, pero no hay ruta de ejecución desde renderer o IPC y el permiso de red exige todos los controles económicos.

### Claves, IPC, `safeStorage` y logs

- Las credenciales entran por IPC de escritura específico y validado.
- El renderer recibe estado público y máscara constante, nunca el secreto.
- Electron main cifra mediante `safeStorage` y persiste fuera del proyecto, bajo `userData`.
- El uso real futuro se encapsula en `withCredential`; el secreto descifrado no puede devolverse y los errores que lo contengan se sustituyen por un error estable.
- En Linux, `basic_text` o backend desconocido falla cerrado.
- Sustitución y borrado exigen confirmación.
- La búsqueda sobre archivos versionados no encontró tokens Tavily/OpenAI reales; las únicas cabeceras Bearer pertenecen a la implementación oficial y a secretos sintéticos de prueba.
- `.env.example` es el único archivo de entorno versionado.
- No se detectaron logs del pipeline nuevo que impriman credenciales o cabeceras.
- No se inspeccionaron archivos ignorados, almacenes de usuario ni variables con claves reales.

### Ledger, reservas, tarifas y guarda

- Migración base aditiva: `20260725050000_real_provider_ledger.sql`, sin modificaciones.
- Corrección aditiva: `20260725183730_fix_provider_reservation_idempotency.sql`.
- Siete tablas económicas con RLS y privilegios retirados a `public`, `anon` y `authenticated`.
- Ledger y tarifas protegidos contra update/delete.
- Reserva previa, inicio y conciliación producen asientos separados.
- Presupuestos de tarea, lote y día se bloquean en orden estable.
- Un resultado `unknown` retiene la reserva y no admite reintento automático.
- Advisory lock serializa una misma clave idempotente y la comparación explícita decide equivalencia o conflicto.
- Guarda global limita la ejecución real concurrente.
- La integración local transaccional aprobó y revirtió todos sus datos.
- La integración concurrente trabajó en una base aislada del PostgreSQL local y la eliminó al terminar.
- El contrato `IDEMPOTENCY_CONFLICT` es estable, sanitizado y no reintentable.
- El catálogo de aplicación `2026-07-25.1` es versionado y no modifica todavía `provider_tariffs`; no se añadió migración en 10C.

### Estado local y datos humanos

Ambas migraciones constan una vez en `supabase_migrations`. Se verificaron siete tablas y cinco funciones:

| Dato | Conteo |
|---|---:|
| Solicitudes humanas | 13 |
| Runs humanos | 14 |
| Borradores | 24 |
| Eventos | 136 |
| Llamadas de proveedor reales | 2 |
| Reservas reales | 2 conciliadas; 0 pendientes |
| Tarifas reales | 2 |
| Presupuestos de tarea/lote/día | 1 / 1 / 1 |

La guarda no tiene propietario. El presupuesto de conectividad retiene `0 EUR`, registra `0,008077 EUR` gastados y conserva `0,011923 EUR` disponibles. Los datos humanos mantienen exactamente 13 solicitudes, 14 runs, 24 borradores y 136 eventos, con los mismos timestamps máximos anteriores a 10D.

### Checkpoint, backup y restauración

- La etiqueta `checkpoint/pre-real-pipeline-20260725` protege el commit esperado y es ancestro del HEAD auditado.
- Existen dump PostgreSQL, catálogo `pg_restore`, inventarios Storage y manifiesto.
- Los cuatro SHA-256 recalculados coinciden byte a byte con el manifiesto:
  - dump: `acb4b2128469f2861a8bd92f028a8da9d6f1b375d2825d4a4c9626abe44d9619`;
  - catálogo: `32c41117e1f04c674ceab533349df9241762cdca819c70ded2a039034c26fd4b`;
  - buckets: `f1d1bad5cc5ae894d815dcd132d1551561688f368dbc31f48944df13d940e441`;
  - objetos: `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945`.
- Storage contiene el inventario del bucket privado y cero objetos.
- No se ejecutó restauración. El procedimiento aprobado exige primero un contenedor aislado y autorización humana.

## Validaciones

- Suite normal: 392 pruebas aprobadas; 11 integraciones opt-in omitidas por defecto.
- Pruebas específicas 10D: 35 aprobadas, incluidas las 20 simulaciones obligatorias.
- Integración ledger Supabase local: 2 pruebas aprobadas; transacción revertida y base aislada eliminada.
- Integraciones locales de geografía, contribuciones, repositorio editorial y Manual: 9 pruebas aprobadas con datos sintéticos limpiados.
- TypeScript `--noEmit`: aprobado.
- ESLint con cero warnings: aprobado.
- Builds renderer, Electron main y preload: aprobados. El empaquetado NSIS falla después de crear `win-unpacked` por el privilegio conocido de symlinks de `winCodeSign`.
- `git diff --check`: aprobado.
- `git diff --cached --check`: aprobado antes del commit.
- Búsqueda de secretos versionados: sin secreto real detectado; un placeholder conocido.

## Commits del lote anteriores a esta auditoría

| Prompt | Commit | Mensaje |
|---:|---|---|
| Documentos | `d270a395695a6d6ede16d7c12bf40e8c54f61d43` | `docs: añadir hoja de ruta y prompts del pipeline real` |
| 01 | `9f4adbf8c65470ab4490897384cb1847fa551868` | `feat: definir arquitectura neutral del pipeline real` |
| 02 | `f4e35d6c864f4247343a230359dbbff3402ee45f` | `feat: añadir centro seguro de proveedores` |
| 03 | `60cd8aabafb1a849639925d3e3231282dc463e70` | `feat: añadir ledger y cortafuegos de gasto real` |
| 04 | `25f20760b7cfc43113d65e61f21b50af574a82d5` | `feat: añadir herramienta de investigación Tavily` |
| 05 | `de82014dc71223d77752430078cb440b5cfccfd7` | `feat: añadir motor editorial OpenAI estructurado` |
| 06 | `f518765098a3c5ad587dfab4a970af47553acfc5` | `feat: limitar investigación real a dos rondas focalizadas` |
| 07 | `596df16dd2a3106657c192195115e8635e6581af` | `feat: añadir roles y extensión configurable por perfil` |
| 08 | `f46a3d7ec5cd20afd2ad0b15af89421d4f25fbea` | `test: validar pipeline real completo sin red` |
| 09 | `80a0f42559a86c4cc833ca4c123697182dc0ec6f` | `feat: preparar puerta segura para piloto real Morella` |
| 10 | `dac00762cbb0f66ab5968917f6b3bade4168fcba` | `docs: cerrar auditoría previa al piloto real` |

El hash de 10B se informa después de crear su commit para evitar una referencia circular.

## Pasos humanos posteriores

Los pasos humanos posteriores son:

1. No repetir 10D; su historial durable cierra otra ejecución.
2. Preparar el alcance y gate de PROMPT 11 sin ejecutarlo.
3. Confirmar de nuevo modelos, tarifas, saldo, presupuesto, ledger y guarda en ese futuro bloque.
4. Habilitar la feature flag estricta solo durante otra ventana autorizada.
5. Mantener publicación, Trawel, producción y Automatic cerrados.

PROMPT 11 sigue fuera del alcance ejecutado.

## Fronteras negativas confirmadas

- llamadas reales Tavily/OpenAI: 1 / 1;
- créditos Tavily: 1;
- tokens reales OpenAI: 17 entrada, 0 cacheados y 10 salida;
- coste real: `0,008077 EUR`;
- reservas pendientes y coste retenido: 0;
- guarda global: libre;
- investigación editorial creada o modificada: 0;
- publicaciones: 0;
- Trawel: desconectado;
- producción: desconectada;
- Automatic: no iniciado;
- PROMPT 11: no ejecutado;
- comandos Supabase prohibidos: no ejecutados.
