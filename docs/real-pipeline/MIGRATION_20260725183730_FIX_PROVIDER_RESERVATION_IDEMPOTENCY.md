# Migración 20260725183730 — idempotencia de reservas reales

## Alcance

La migración es aditiva y reemplaza únicamente el cuerpo de `public.reserve_provider_call`. No modifica `20260725050000_real_provider_ledger.sql`, tablas, columnas, reservas históricas ni datos humanos.

## Contrato

La función conserva el advisory lock por `idempotency_key` antes de leer o insertar.

Cuando la clave no existe:

- verifica guarda, reintento ambiguo y presupuestos;
- crea una reserva;
- imputa una sola reserva máxima;
- añade un único asiento `reserved`.

Cuando la clave existe:

- devuelve el mismo ID solo si coinciden ejecución, request, run, tarea, lote, fecha presupuestaria, etapa, operación, proveedor, modelo, intento, origen de reintento, coste estimado/reserva máxima, moneda, tarifa versionada, versiones de prompt/esquema e `input_hash`;
- rechaza cualquier diferencia con `IDEMPOTENCY_CONFLICT`;
- no incluye parámetros en el error;
- no crea ni modifica reservas, presupuesto o ledger.

`input_hash` es el fingerprint canónico de la atribución, la facturación, el payload entregado al proveedor y sus límites de tokens, créditos y herramientas. No contiene secretos, prompts completos ni el payload en claro.

En TypeScript, `CostLedgerError` expone:

- `code: 'IDEMPOTENCY_CONFLICT'`;
- `retryable: false`;
- mensaje sanitizado y estable.

## Concurrencia

Dos solicitudes idénticas concurrentes convergen en la misma reserva. Dos solicitudes conflictivas concurrentes dejan un único ganador; la otra obtiene el error estable. La implementación en memoria aplica la misma comparación aun cuando ambas llamadas superan simultáneamente la lectura inicial.

## Aplicación y validación

Se aplicó exclusivamente a Supabase local mediante `supabase migration up --local`.

La validación incluye:

- pruebas unitarias de cada campo relevante;
- prueba de esquema de la migración aditiva;
- integración transaccional con rollback;
- integración concurrente en una base aislada del mismo PostgreSQL local, eliminada al terminar;
- comparación de datos humanos antes y después.

## Reversibilidad

No hay esquema o datos que retirar. Una reversión técnica consistiría en volver a declarar la versión anterior de la función mediante otra migración. No debe hacerse si existen reservas sin una auditoría previa, porque reintroduciría la aceptación silenciosa de conflictos.
