# Migración 20260725050000 — ledger y cortafuegos de gasto real

## Alcance

La migración es aditiva y local. No altera, actualiza, borra ni reinterpreta tablas o datos humanos previos.

Tablas nuevas:

- `provider_tariffs`: catálogo de tarifas versionado y append-only.
- `real_task_budgets`: límite, reserva y gasto por tarea.
- `real_batch_budgets`: límite, reserva y gasto por lote.
- `real_daily_budgets`: límite, reserva y gasto por día y moneda.
- `real_execution_guard`: guarda exclusiva global con lease.
- `provider_call_reservations`: reserva económica idempotente previa a cada llamada.
- `provider_calls`: ledger append-only de cada cambio de estado de una llamada.

Funciones nuevas:

- `acquire_real_execution_guard`: adquiere o renueva una única ejecución real.
- `release_real_execution_guard`: libera la guarda únicamente con su token.
- `reserve_provider_call`: serializa la clave idempotente, comprueba guarda, reintento ambiguo y límites tarea → lote → día, reserva los tres presupuestos e inserta el primer asiento.
- `start_provider_call`: registra el inicio sin modificar asientos previos.
- `settle_provider_call`: concilia éxito, fallo o cancelación; un resultado desconocido conserva la reserva y bloquea el reintento automático.
- `prevent_real_ledger_mutation`: impide `UPDATE` o `DELETE` de llamadas y tarifas.

Índices:

- llamadas por request y fecha;
- llamadas por tarea y fecha;
- remote ID por proveedor;
- reservas por estado y fecha;
- tarifas por proveedor, modelo, operación y vigencia.

Seguridad:

- RLS habilitado en las siete tablas;
- sin acceso para `public`, `anon` o `authenticated`;
- `service_role` solo lee ledger, reservas y guarda;
- presupuestos y nuevas versiones de tarifa admiten inserción controlada;
- los cambios de guarda, reserva y conciliación pasan por funciones `security definer`;
- el error durable rechaza patrones habituales de credenciales.

## Aplicación y validación local

Se aplicó una sola vez con `supabase migration up --local`. No se ejecutó `supabase link`, `supabase db push` ni `supabase db reset`.

La integración crea exclusivamente datos sintéticos dentro de una transacción, prueba reserva, inicio, conciliación, presupuestos, guarda y trigger append-only, y termina con `ROLLBACK`. Antes y después se conservaron los conteos humanos: 13 solicitudes, 14 runs, 24 borradores y 136 eventos.

## Reversibilidad

No existe rollback automático porque un ledger con llamadas reales no debe eliminarse de forma implícita. Mientras las tablas continúen vacías, una reversión autorizada podría retirar, en orden, funciones, triggers, tablas dependientes y tablas de presupuesto. Si llegaran a contener asientos, cualquier retirada exigiría backup nuevo, exportación íntegra, reconciliación y autorización humana específica. El checkpoint previo permanece disponible fuera del repositorio.
