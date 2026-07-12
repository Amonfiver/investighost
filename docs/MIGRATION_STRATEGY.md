# Estrategia y catálogo de migraciones — FASE 2A

Todas las migraciones de este documento están en estado **NO EJECUTADA**. No se han creado archivos SQL porque falta comparar el esquema productivo real y cerrar región/proyecto dev. El rollback ordinario es lógico o mediante migración forward; restaurar backup queda reservado a incidentes.

## Proceso

1. Capturar baseline DDL sin datos y verificar checksum.
2. Generar migraciones pequeñas, numeradas e inmutables.
3. Revisar propósito, dependencias, locks, RLS y compatibilidad Trawel.
4. Aplicar a dev vacío y a una copia sintética; ejecutar tests de contratos/RLS.
5. Para producción: backup/restauración probada, diff, ventana, autorización humana y observación posterior.

## Orden propuesto

| Nº | Migración propuesta | Propósito / dependencias | Rollback lógico | Riesgo y compatibilidad Trawel |
|---:|---|---|---|---|
| 01 | extensiones y enums | UUID/funciones y estados; baseline | dejar tipos sin uso o forward | colisión de extensiones/enums; inventariar primero |
| 02 | usuarios y roles | profiles/RBAC; Auth | desactivar asignaciones/policies | escalada de privilegios; no altera lectura Trawel |
| 03 | investigación | requests/runs/sources/results/logs; 02 | cerrar escritura, conservar filas | volumen JSON/logs; privado |
| 04 | editorial y revisión | drafts/sections/revisions/content; 03 | marcar superseded/disabled | estados divergentes; no tocar editorial público aún |
| 05 | publicación | queue/attempts/steps/rate; 04 | pausar cola | duplicados/transiciones; sin worker ni escritura real |
| 06 | moderación | contributions/photos/decisions; 02 | cerrar intake, retirar | PII/derechos; no publicar Storage |
| 07 | CRM | organizations/contacts/consent/suppression/tasks; 02 | bloquear acceso y anonimizar según política | alto riesgo PII/legal; diseño futuro F8 |
| 08 | campañas | campaigns/audiences/deliveries/comms; 07 | mantener draft/paused | pausa legal; no envío |
| 09 | publicidad | advertisers/placements/ads/bookings/reminders; 07 | pausar/archivar | contrato placements pendiente |
| 10 | analytics | events/aggregates/reports; 02 | detener ingestión, conservar agregados | minimización/particionado; proveedor pendiente |
| 11 | auditoría | audit/sync devices/ops; 02 | cerrar append y preservar evidencia | crecimiento y datos sensibles |
| 12 | RLS y grants | deny-by-default, funciones helper; 02–11 | política de emergencia revisada, no desactivar globalmente | bloqueo o exposición; matriz completa por rol |
| 13 | Storage | buckets/policies/metadatos; 06/09/12 | cerrar uploads/despublicar | buckets existentes y objetos huérfanos |
| 14 | vistas públicas | proyecciones published/active; baseline/12 | retirar vistas y volver a consultas previas | contrato de consultas Trawel |
| 15 | seeds ficticios dev | roles/permisos y fixtures sintéticos | borrar solo IDs de seed en dev | prohibida en producción mediante guard explícito |

## Reglas de producción

- Nunca ejecutar `db:migrate` genérico contra una URL ambigua.
- Cada script exige environment y project ref; producción requiere flag de confirmación no reutilizable.
- No hacer `drop`, rename destructivo o `not null` inmediato sobre columnas pobladas: expandir, backfill validado, contraer en migración posterior.
- Índices grandes se planifican para minimizar locks. Toda policy nueva se prueba con roles negativos.
- Migraciones de tablas públicas preservan nombres/campos que Trawel consume; cualquier cambio de contrato se coordina en FASE 6.

## Criterio de salida de 2A

Documentación revisada y comandos locales verdes. La creación del proyecto dev y la materialización de SQL pertenecen a FASE 2B tras confirmación humana.

