# Auditoría previa al piloto real

Fecha: 2026-07-25

Rama: `feat/investighost-real-pipeline`

Checkpoint protegido: `18d8d33113c1412de07fb9f4189116100ccfa84b`

Alcance: PROMPT 01–10, correcciones 10B y 10C, sin ejecutar PROMPT 11.

## Dictamen

**GO para introducir credenciales desde la aplicación y preparar una prueba de conectividad controlada posterior.**

La divergencia de idempotencia durable está corregida. Tavily REST y OpenAI SDK/Responses están conectados a los puertos nuevos exclusivamente mediante un permiso opaco que exige feature flag, proveedores configurados y activos, preflight, autorización humana, reserva económica y guarda global. Las credenciales solo se descifran en Electron main dentro de una operación acotada. El catálogo `2026-07-25.1` conserva tarifas oficiales verificadas, fuente y fecha de revisión. El preflight comprueba configuración pública e infraestructura local sin descifrar claves ni efectuar llamadas externas.

Este GO no autoriza todavía la prueba de conectividad, habilitar la feature flag, ejecutar PROMPT 11, investigar Morella, consumir saldo o publicar. La prueba requiere otra autorización humana y un bloque separado.

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

### B2 — Clientes reales: implementados y cerrados

Tavily usa `https://api.tavily.com`, autenticación Bearer, Search/Extract, `request_id`, uso/créditos, timeout, cancelación, límites, validación Zod y errores sanitizados. OpenAI usa el SDK ya instalado, Responses API, Structured Outputs estrictos, uso y entrada cacheada, refusal/incomplete, timeout, cancelación y límite de salida. Ambos se probaron únicamente con transportes falsos inyectados.

No hay IPC o botón que invoque esos clientes. Un consumidor interno tampoco puede llamar al transporte sin un permiso emitido por el gate completo. La feature flag real sigue desactivada y el botón de conectividad permanece deshabilitado.

### B3 — Preflight operativo sin red: implementado

El preflight consulta solo el snapshot público del Centro de proveedores y Supabase local. Comprueba credenciales presentes, activación, modelo, vigencia de tarifa, límites, presupuestos, Morella, dos rondas, publicación/regeneración, Trawel, Automatic, ledger, guarda y cero reservas activas. Devuelve uno de los ocho estados definidos y siempre declara `networkCallsPerformed: 0`, `researchExecutionAllowed: false` y `connectivityActionEnabled: false`.

Sin credenciales y con la feature flag apagada, el estado operativo seguirá bloqueado de forma esperada. `ready_for_live_connectivity_check`, cuando se alcance, solo habilitará una decisión humana posterior; nunca autoriza investigación.

## Hallazgos no bloqueantes y deuda

- El código legacy se conserva para evitar una retirada arriesgada, pero sus entradas de configuración, fábrica/Kimi, Brave, orquestación, investigación y `startResearch` están deprecadas y protegidas por `LEGACY_PROVIDER_RUNTIME_DISABLED`. El pipeline nuevo y Electron main no las importan.
- Los logs legacy de input completo y preview se retiraron. El error del guard no contiene credenciales, prompts o inputs y no es reintentable.
- El comentario del advisory lock aparece duplicado en la migración. No cambia el SQL ejecutable.
- Los checkpoints del piloto fake y el repositorio usado por su ledger son implementaciones en memoria. El piloto real debe usar persistencia durable y no asumir que la prueba fake demuestra recuperación tras caída de proceso.
- Las tarifas oficiales se conservan en USD y caducan operativamente el 2026-08-25 si no se reverifican. Antes de investigar debe definirse una conversión USD→EUR versionada y durable para conciliar con presupuestos en EUR; 10C no inventa un tipo de cambio.
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
| Llamadas de proveedor reales | 0 |
| Reservas reales | 0 |
| Tarifas reales | 0 |
| Presupuestos de tarea/lote/día | 0 / 0 / 0 |

La guarda no tiene propietario. El test de integración posterior dejó de nuevo llamadas, reservas y tarifas en cero.

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

- Suite normal: 368 pruebas aprobadas; 11 integraciones opt-in omitidas por defecto.
- Pruebas específicas 10C: 85 aprobadas.
- Integración ledger Supabase local: 2 pruebas aprobadas; transacción revertida y base aislada eliminada.
- Integraciones locales de geografía, contribuciones, repositorio editorial y Manual: 9 pruebas aprobadas con datos sintéticos limpiados.
- TypeScript `--noEmit`: aprobado.
- ESLint con cero warnings: aprobado.
- Builds renderer, Electron main y preload: aprobados.
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

El GO técnico no autoriza conexiones o llamadas. Los pasos humanos posteriores son:

1. Abrir Centro de proveedores desde Electron.
2. Configurar Tavily y OpenAI escribiendo cada clave en su formulario; comprobar que la UI solo devuelve `••••••••`.
3. Activar exactamente Tavily en investigación y OpenAI en inteligencia.
4. Ejecutar en un gate posterior una prueba real mínima y autorizada; la prueba simulada actual no sirve.
5. Confirmar modelos, tarifas versionadas y saldo disponible o comprobación humana equivalente.
6. Persistir presupuesto antes de cualquier llamada y verificar ledger/guarda/cero tareas activas.
7. Revisar el preflight: aviso 0,16 EUR; presupuesto normal 0,20; ampliación humana máxima 0,25; absoluto 0,50; una tarea; concurrencia 1; dos rondas; cero regeneración/publicación.
8. Habilitar la feature flag estricta solo durante la ventana autorizada y retirar la habilitación al terminar.

PROMPT 11, las claves reales y cualquier llamada siguen fuera de alcance.

## Fronteras negativas confirmadas

- llamadas reales Tavily/OpenAI: 0;
- créditos Tavily: 0;
- tokens reales OpenAI: 0;
- coste real: 0 EUR;
- publicaciones: 0;
- Trawel: desconectado;
- producción: desconectada;
- Automatic: no iniciado;
- PROMPT 11: no ejecutado;
- comandos Supabase prohibidos: no ejecutados.
