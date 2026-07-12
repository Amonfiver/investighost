# Estrategia SQLite ↔ Supabase — HISTÓRICA Y DEPRECADA

Estado: **descartada el 2026-07-12 por la decisión FASE 2C-A**.

Este archivo se conserva únicamente como registro de la arquitectura diseñada en FASE 2A e implementada parcialmente en FASE 2B. **No debe usarse para implementar funciones nuevas, mantener un fallback ni justificar caché, cola u operación offline.**

## Estrategia descartada

La propuesta usaba SQLite/Drizzle para borradores, outbox, contribuciones importadas y reanudación offline, sincronizados con Supabase. El parche de contribuciones llegó a convertir SQLite y una carpeta local en copia de trabajo tras verificar checksums y borrar el origen remoto.

## Motivo del descarte

- Mantener dos persistencias aumenta estados, conflictos, migraciones y recuperación.
- La aplicación aún no necesita un modo offline aprobado.
- Supabase local ya permite desarrollar y probar PostgreSQL, RLS y Storage sin tocar producción.
- Un solo motor reduce divergencias respecto de la estructura que Trawel deberá consumir.
- La copia autoritativa local elevaba el riesgo de pérdida, backup incompleto y PII en el equipo.

## Documento sustituto

La decisión vigente está en `INVESTIGHOST_DECISION_SUPABASE_UNICO.md` y su diseño operativo en `PERSISTENCE_ARCHITECTURE.md`. PostgreSQL/Supabase local es la única persistencia del MVP; Storage local conserva archivos. SQLite no es fallback, caché ni modo offline.

## Elementos que sí se reutilizan

No dependen de SQLite y permanecen vigentes como requisitos:

- UUID/idempotency key y aislamiento por registro;
- validación Zod, tamaño, MIME y SHA-256;
- reintentos acotados y recuperación por estado;
- no borrar un origen antes de persistencia y verificación completas;
- auditoría de intentos, errores y decisiones;
- procesamiento parcial de lotes sin cancelar registros correctos.

Estos controles se implementarán sobre transacciones PostgreSQL, tablas de jobs/intentos y Supabase Storage local.

## Referencias históricas restantes

Los prompts maestros, la hoja V2, el parche de sincronización, bitácoras y auditorías conservan referencias a SQLite porque documentan decisiones y estado real de fases anteriores. No son instrucciones vigentes frente a la decisión 2C-A. El código existente también permanece hasta la fase técnica autorizada.
