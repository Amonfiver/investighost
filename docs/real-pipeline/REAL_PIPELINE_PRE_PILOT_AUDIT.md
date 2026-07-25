# Auditoría previa al piloto real

Fecha: 2026-07-25

Rama: `feat/investighost-real-pipeline`

Checkpoint protegido: `18d8d33113c1412de07fb9f4189116100ccfa84b`

Alcance: PROMPT 01–10, sin ejecutar PROMPT 11.

## Dictamen

**NO-GO operativo para el piloto real.**

La base técnica sin red supera pruebas, typecheck, ESLint y los tres builds Vite. El checkpoint y sus backups son verificables, no hay llamadas/coste reales ni datos económicos residuales. Sin embargo, existe un defecto funcional bloqueante en la idempotencia durable y faltan deliberadamente las comprobaciones reales de credenciales, conexiones, tarifas y clientes. No debe habilitarse la feature flag ni ejecutarse Morella hasta resolver los bloqueos y repetir esta auditoría.

## Bloqueos

### B1 — Conflicto idempotente no validado en PostgreSQL

Severidad: alta.

`CostLedgerService` compara todos los parámetros cuando ya existe una `idempotencyKey` y devuelve `IDEMPOTENCY_CONFLICT` si no coinciden. En cambio, `public.reserve_provider_call` de `20260725050000_real_provider_ledger.sql` adquiere el advisory lock, busca la clave y devuelve inmediatamente el ID existente sin comparar request, run, tarea, lote, operación, proveedor, modelo, intento, tarifa, versiones, hash o coste.

Impacto: reutilizar por error una clave con una llamada distinta no duplica presupuesto, pero puede devolver una reserva ajena y falsear atribución, trazabilidad y conciliación. La integración actual comprueba el happy path y append-only, no esta divergencia.

Corrección exigida antes de GO:

1. comparar en SQL la reserva existente con todos los campos inmutables;
2. producir un error durable inequívoco ante cualquier diferencia;
3. añadir prueba de integración local para misma clave/mismo input y misma clave/input distinto;
4. aplicar el cambio solo mediante una nueva migración aditiva local autorizada;
5. volver a confirmar tablas económicas vacías y conteos humanos intactos.

### B2 — Integraciones reales aún no conectadas

Severidad: bloqueante esperada por el alcance sin gasto.

- la feature flag real está apagada y no hay acción de ejecución;
- el cliente OpenAI real no está instanciado;
- Tavily solo puede usar `fetch` con habilitación explícita, pero el `ResearchTool` sigue marcado como simulado;
- `OpenAIIntelligenceEngine` también se identifica como simulado;
- el Centro de proveedores no entrega credenciales a los clientes del pipeline;
- conexiones reales, saldos y tarifas no se han consultado;
- las pruebas simuladas no satisfacen el preflight real.

Este bloqueo preserva el límite del lote. Su resolución pertenece a una intervención posterior expresamente autorizada y nunca debe saltarse B1.

### B3 — Preflight durable aún sin evidencia operativa

Severidad: bloqueante esperada.

En Supabase local existen las siete tablas y cinco funciones económicas, pero hay cero tarifas, presupuestos, reservas y llamadas. La guarda global está libre. El gate muestra como no comprobados Supabase, ledger, guarda, tareas reales y conexiones. No se ha leído el almacén de credenciales de usuario para respetar la prohibición de inspeccionar claves.

## Hallazgos no bloqueantes y deuda

- El módulo legado `src/modules/research` conserva rutas capaces de leer variables de entorno y usar proveedores históricos reales si fuera invocado. No está conectado al runtime Electron canónico actual ni al pipeline nuevo, pero debe aislarse o retirarse antes de un release para reducir superficie y evitar dos centros de credenciales.
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

- Migración aditiva: `20260725050000_real_provider_ledger.sql`.
- Siete tablas económicas con RLS y privilegios retirados a `public`, `anon` y `authenticated`.
- Ledger y tarifas protegidos contra update/delete.
- Reserva previa, inicio y conciliación producen asientos separados.
- Presupuestos de tarea, lote y día se bloquean en orden estable.
- Un resultado `unknown` retiene la reserva y no admite reintento automático.
- Advisory lock serializa una misma clave idempotente.
- Guarda global limita la ejecución real concurrente.
- La integración local transaccional aprobó y revirtió todos sus datos.
- Defecto B1 pendiente: falta comparar el contenido al reutilizar la clave en SQL.

### Estado local y datos humanos

La migración consta una vez en `supabase_migrations`. Se verificaron siete tablas y cinco funciones:

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

- Suite normal: 285 pruebas aprobadas; 10 integraciones opt-in omitidas por defecto.
- Integración ledger Supabase local: 1 prueba aprobada, transacción revertida.
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

El hash de PROMPT 10 se informa después de crear su commit para evitar una referencia circular.

## Pasos humanos posteriores

No realizar estos pasos hasta corregir B1 y recibir una autorización nueva:

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
