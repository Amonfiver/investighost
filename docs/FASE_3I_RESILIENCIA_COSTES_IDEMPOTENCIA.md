# FASE 3I — Resiliencia, costes e idempotencia

Fecha: 2026-07-21
Estado: aprobada técnicamente

## Recuperación durable por etapa

El flujo Manual persiste un scaffold antes de llamar a proveedores y conserva checkpoints versionados después de cada frontera recuperable:

- `source_reading`: fuentes, documentos leídos acotados, evaluación y uso;
- `fact_structuring`: hechos, lugares y actividades, además del checkpoint interno tras cada fuente;
- `profile_generation`: borradores diferenciados y uso editorial;
- `quality_review`: revisiones y controles de RevisIAtor;
- `human_review`: agregado canónico completo.

Cada checkpoint tiene hash SHA-256, versión de contrato y hash de configuración. Una huella, schema o configuración incompatible produce `CHECKPOINT_INVALID`; nunca se ignora para repetir trabajo silenciosamente. Los documentos leídos se guardan en PostgreSQL local con límite de 200.000 caracteres por documento. Por ello el pipeline Manual no necesita Supabase Storage y una indisponibilidad de Storage no afecta su recuperación; Storage continúa reservado al dominio de archivos de contribuciones.

Tras una muerte abrupta, `resume` continúa el mismo intento desde checkpoints. Tras un fallo controlado, `retry` crea otra ejecución enlazada mediante `recoveryFromRunId`, conserva los intentos anteriores y reutiliza solo etapas válidas. Si el proceso cae entre la escritura del scaffold y la del control, este se reconstruye desde la configuración durable de la solicitud.

## Exclusión, cancelación y reintentos

`execution_locks` protege una solicitud mediante token y lease renovable de 30 segundos. La adquisición es atómica en PostgreSQL y evita dos ejecuciones accidentales para la misma clave idempotente. Cada cambio de etapa renueva el lease y guarda heartbeat; el lock se libera al terminar, fallar o cancelar.

`editorial_execution_controls` conserva intentos máximos, presupuesto, coste acumulado, heartbeat, solicitud/actor de cancelación y próximo reintento. Los reintentos son explícitos, tienen backoff acotado y no superan el máximo configurado. La cancelación se persiste antes de abortar el proveedor activo; al recuperar un proceso sin controlador vivo se completa directamente el estado `cancelled`.

Las operaciones están disponibles en Electron mediante IPC limitado (`resume`, `retry`, `cancel`). La biblioteca abre ejecuciones incompletas y solo ofrece acciones compatibles con su estado. URL y clave local permanecen en main.

## Coste y auditoría

El control durable contabiliza coste acumulado de llamadas realmente completadas entre intentos y regeneraciones. Antes de adquisición, generación o regeneración se calcula el presupuesto restante; excederlo produce `BUDGET_EXCEEDED` sin iniciar la siguiente llamada. Reutilizar un checkpoint no vuelve a cobrarlo. Cada ejecución conserva coste/unidades propios y el agregado reconstruido conserva el uso que explica su contenido.

Destino, etapas reutilizadas, reintentos, fallos, cancelación, calidad y espera humana generan eventos persistentes inmediatamente. Un fallo conserva código, mensaje, etapa, intento y próxima fecha de reintento incluso cuando todavía no existe un agregado final.

## Fallos probados

Las pruebas sintéticas cubren:

- proveedor no disponible y recuperación con nueva ejecución;
- caída de base al guardar etapa y reintento desde el último checkpoint válido;
- interrupción de Electron, nuevo servicio y reanudación del mismo intento;
- caída entre scaffold y control durable;
- ausencia de dependencia de Storage en el flujo Manual;
- cancelación activa con actor y liberación del lock;
- concurrencia accidental en memoria y PostgreSQL local;
- intentos máximos, backoff y presupuesto acumulado;
- checkpoint corrupto rechazado;
- regeneración cobrada contra el presupuesto restante.

## Evidencia y frontera

- `supabase db reset --local`: migraciones y seed reconstruidos, incluida `20260721040000_editorial_resilience.sql`.
- `supabase db lint --local --level warning`: sin errores de schema.
- 9/9 tests específicos de resiliencia y 5/5 del flujo Manual.
- 2/2 integración Manual Supabase local, incluida concurrencia real; integración de repositorio editorial aprobada.
- Suite general, typecheck, lint y build Vite/Electron aprobados.

No se conectaron producción, Trawel o proveedores reales; no se usaron credenciales remotas; no se ejecutaron `supabase link` ni `supabase db push`; no se publicó contenido. Automatic continúa bloqueado. El siguiente y único paso autorizado es preparar FASE 3J y detenerse ante su gate humano.
