# Auditoría previa al piloto real

Fecha: 2026-07-25

Rama: `feat/investighost-real-pipeline`

Checkpoint protegido: `18d8d33113c1412de07fb9f4189116100ccfa84b`

Alcance: PROMPT 01–10 y corrección 10B, sin ejecutar PROMPT 11.

## Dictamen

**GO técnico para configurar credenciales y preparar autorización humana de PROMPT 11.**

La divergencia de idempotencia durable está corregida mediante una migración aditiva y pruebas unitarias/concurrentes contra Supabase local. Las rutas legacy capaces de leer variables de entorno o crear clientes históricos fallan ahora antes de acceder a configuración, red, inputs o previews. La base técnica sin red supera pruebas, typecheck, ESLint y los tres builds Vite; el checkpoint y sus backups siguen verificables y no hay llamadas, coste o datos económicos residuales.

Este GO solo permite configurar credenciales desde la aplicación y preparar el gate humano. No autoriza habilitar la feature flag, ejecutar PROMPT 11, hacer una prueba de conexión real, consumir saldo o publicar.

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

### B2 — Integraciones reales: gate posterior pendiente

No es un defecto de 10B. La feature flag, los clientes reales y la acción de ejecución permanecen bloqueados por alcance. Conexiones, saldos y tarifas no se consultaron. Las pruebas simuladas no acreditan conexión real.

### B3 — Preflight operativo: decisión humana pendiente

En Supabase local constan las siete tablas, las cinco funciones y ambas migraciones, pero hay cero tarifas, presupuestos, reservas y llamadas. La guarda global está libre. El gate mantiene como no comprobados credenciales, conexión, saldo, tarifas y ejecución. Esta situación es compatible con el GO técnico para configurar; PROMPT 11 sigue bloqueado hasta completar el preflight y recibir autorización expresa.

## Hallazgos no bloqueantes y deuda

- El código legacy se conserva para evitar una retirada arriesgada, pero sus entradas de configuración, fábrica/Kimi, Brave, orquestación, investigación y `startResearch` están deprecadas y protegidas por `LEGACY_PROVIDER_RUNTIME_DISABLED`. El pipeline nuevo y Electron main no las importan.
- Los logs legacy de input completo y preview se retiraron. El error del guard no contiene credenciales, prompts o inputs y no es reintentable.
- El comentario del advisory lock aparece duplicado en la migración. No cambia el SQL ejecutable.
- Los checkpoints del piloto fake y el repositorio usado por su ledger son implementaciones en memoria. El piloto real debe usar persistencia durable y no asumir que la prueba fake demuestra recuperación tras caída de proceso.
- Los modelos y tarifas siguen siendo valores de catálogo o sintéticos; deben verificarse contra la configuración autorizada inmediatamente antes del piloto.
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

### Claves, IPC, `safeStorage` y logs

- Las credenciales entran por IPC de escritura específico y validado.
- El renderer recibe estado público y máscara constante, nunca el secreto.
- Electron main cifra mediante `safeStorage` y persiste fuera del proyecto, bajo `userData`.
- En Linux, `basic_text` o backend desconocido falla cerrado.
- Sustitución y borrado exigen confirmación.
- La búsqueda sobre archivos versionados no encontró tokens Tavily/OpenAI reales ni cabeceras Bearer; el único patrón con aspecto de clave es el placeholder explícito de OpenAI en `.env.example`.
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

- Suite normal: 337 pruebas aprobadas; 11 integraciones opt-in omitidas por defecto.
- Pruebas específicas 10B: 71 aprobadas; regresión Morella falsa: 3 aprobadas.
- Integración ledger Supabase local: 2 pruebas aprobadas; transacción revertida y base aislada eliminada.
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
