# Arquitectura de persistencia — decisión 2C-A

Estado: vinculante para el MVP desde 2026-07-12. Sustituye el reparto SQLite/Supabase de FASE 2A y la excepción local de FASE 2B.

## Topología canónica

Investighost usa PostgreSQL mediante **Supabase local como entorno principal de desarrollo y única persistencia del MVP**. El entorno local reproduce mediante migraciones SQL versionadas la estructura relevante del Supabase de Trawel y añade las tablas privadas de Investighost. Supabase Storage local conserva los archivos de desarrollo.

```text
Electron renderer → preload/IPC validado → repositorios Supabase
                                          ├─ PostgreSQL local: operación privada y proyección Trawel
                                          └─ Storage local: uploads, fotos y artefactos
```

No existe SQLite como fallback, caché, outbox, cola, repositorio ni modo offline. Si se aprueba trabajo offline en el futuro, deberá diseñarse como fase independiente, con contratos de conflicto, cifrado, retención y aceptación propios.

## Entornos y autoridad

| Entorno | Uso | Datos | Escritura |
|---|---|---|---|
| Supabase local | desarrollo y pruebas del MVP | sintéticos | permitida por scripts locales revisados |
| Supabase dev remoto | futuro y opcional, solo con aprobación | ficticios/anonimizados | bloqueada hasta fase autorizada |
| Supabase Trawel producción | destino final compartido | reales | prohibida sin aprobación humana explícita |

Las migraciones de `supabase/migrations/` serán la única forma aceptada de reproducir cambios estructurales. El schema productivo real se verificará antes de preparar cualquier migración compatible; la referencia documental de Trawel no sustituye esa comprobación.

## Repositorios y transacciones

- Las interfaces de dominio siguen separando UI de persistencia.
- La implementación del MVP apuntará únicamente al cliente/repositorio PostgreSQL local.
- UUID, UTC, versiones, `created_at`, `updated_at` y tombstones se mantienen donde el dominio los necesite.
- Operaciones compuestas —importación, revisión, publicación y auditoría— deben ser transaccionales o usar estados recuperables e idempotency keys.
- Roles, PII, consentimientos, auditoría y colas durables residen en PostgreSQL, protegidos por Auth/RLS cuando se implemente.

## Reutilización de FASE 2B

Se conservan como diseño reutilizable: contratos Zod, aislamiento por registro, SHA-256, límites y MIME, idempotencia, backoff acotado, estados observables, auditoría y regla de no borrar origen antes de verificar persistencia completa. Deben reemplazarse los adaptadores SQLite, rutas de archivos locales y backup de SQLite por repositorios PostgreSQL, Storage local y backups/restauración de Supabase local.

## Condición de retirada de SQLite

SQLite estará eliminado cuando no existan dependencias/runtime/configuración Drizzle-SQLite, repositorios ni rutas SQLite; las migraciones locales creen todo desde cero; reinicio, importación, reintentos y archivos sean durables en Supabase local; y lint, typecheck, tests y build pasen. Esta condición se ejecutará en la siguiente fase técnica, no en 2C-A.

## Bloqueo de producción

No se guardan credenciales productivas en el entorno local, Electron ni repositorio. Toda futura conexión exige project ref verificado, backup/restauración comprobada, diff revisado y autorización humana específica. 2C-A no conecta, migra, inserta ni borra nada remoto.

## Runtime vigente desde FASE 2C-B

Electron main valida `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`, rechaza hosts no loopback y crea el cliente privilegiado sin exponerlo al preload. El repositorio persiste jobs, lotes, intentos, conflictos y payloads; Storage conserva archivos privados. El remoto sigue siendo mock. Si Supabase local falla, IPC devuelve un error controlado y nunca inicializa SQLite.

`sqlite-repository.ts`, `file-store.ts` y el backup SQLite quedan como legado inactivo de 2B. Drizzle/SQLite sigue referenciado por módulos ajenos y se retirará en una subfase separada.

### Operación local

1. `npx supabase start` arranca el entorno.
2. `npx supabase status -o env` proporciona `API_URL` y `SERVICE_ROLE_KEY`; mapearlos localmente a `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` sin versionar secretos.
3. `npx supabase db reset` reconstruye y carga el seed.
4. `npm test` ejecuta unitarias sin Docker. La integración usa `RUN_SUPABASE_INTEGRATION=true` junto a esas dos variables locales.

Para validar indisponibilidad, detener Supabase y abrir contribuciones: la UI debe mostrar el error y deshabilitar la importación, sin crear base ni archivos SQLite.
