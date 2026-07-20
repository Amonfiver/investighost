# Arquitectura de persistencia — decisión 2C-A, ejecutada en FASE 2C-C

Estado: vinculante y técnicamente completada desde FASE 2C-C. Sustituye el reparto SQLite/Supabase de FASE 2A y la excepción local de FASE 2B.

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

Se conservan como diseño reutilizable: contratos Zod, aislamiento por registro, SHA-256, límites y MIME, idempotencia, backoff acotado, estados observables, auditoría y regla de no borrar origen antes de verificar persistencia completa. En FASE 2C-C, los adaptadores SQLite, rutas de archivos locales y backup de SQLite fueron sustituidos por repositorios PostgreSQL, Storage local y backups/restauración separados de Supabase local.

## Retirada de SQLite completada

FASE 2C-C eliminó Better SQLite, Drizzle, configuración, schemas, repositorios, backup y file store SQLite. No quedan imports, rutas runtime, scripts ni fallback activos. Las búsquedas residuales solo encuentran historia, tests negativos, prohibiciones y reglas de `.gitignore`.

## Bloqueo de producción

No se guardan credenciales productivas en el entorno local, Electron ni repositorio. Toda futura conexión exige project ref verificado, backup/restauración comprobada, diff revisado y autorización humana específica. 2C-A no conecta, migra, inserta ni borra nada remoto.

## Runtime vigente desde FASE 2C-B

Electron main valida `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`, rechaza hosts no loopback y crea el cliente privilegiado sin exponerlo al preload. El repositorio persiste jobs, lotes, intentos, conflictos y payloads; Storage conserva archivos privados. El remoto sigue siendo mock. Si Supabase local falla, IPC devuelve un error controlado y nunca inicializa SQLite.

`sqlite-repository.ts`, `file-store.ts`, el backup SQLite, los schemas y la configuración Drizzle fueron retirados en FASE 2C-C. Los contratos neutrales de repositorio, integridad, retry e importación se conservan.

## Backup y restauración verificados

- **PostgreSQL — CHECKPOINT 5:** dump custom `-Fc` real de 30046 bytes, SHA-256 verificado y restauración real en un contenedor aislado; se comprobaron siete tablas, conteos, 46 constraints, cinco FKs, 19 índices, dos funciones, siete triggers, RLS en siete tablas y cero secuencias. El contenedor y artefactos temporales se limpiaron.
- **Alcance PostgreSQL:** el dump cubre el schema `public`. No es un backup completo de la plataforma: excluye Auth, objetos/binarios Storage, Vault, roles globales, ownership/ACL de plataforma y otros schemas gestionados.
- **Storage — CHECKPOINT 7:** un PNG sintético válido de 68 bytes se respaldó y restauró mediante la API en una ruta separada. SHA-256 y tamaño del original, backup y restaurado fueron idénticos; MIME y metadatos fueron coherentes; la privacidad se verificó y todo se limpió.

`SupabaseDurabilityCheckpointService` registra un checkpoint lógico reciente para el flujo de importación; no crea un dump ni un backup real. `supabase db reset` reconstruye schema y seed, pero tampoco sustituye las pruebas de backup/restauración.

### Operación local

1. `npx supabase start` arranca el entorno.
2. `npx supabase status -o env` proporciona `API_URL` y `SERVICE_ROLE_KEY`; mapearlos localmente a `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` sin versionar secretos.
3. `npx supabase db reset` reconstruye y carga el seed.
4. `npm test` ejecuta unitarias sin Docker. La integración usa `RUN_SUPABASE_INTEGRATION=true` junto a esas dos variables locales.

Para validar indisponibilidad, detener Supabase y abrir contribuciones: la UI debe mostrar el error y deshabilitar la importación, sin crear base ni archivos SQLite.

## Persistencia futura de Automatic

Automatic usará la misma unidad de trabajo PostgreSQL y los mismos repositorios/Storage que Manual. Una campaña solo añadirá orquestación durable y referencias al contenido canónico: checkpoint por destino, snapshot de alcance/configuración, locks, retry, idempotencia, costes y auditoría. No habrá base temporal, SQLite, archivos paralelos ni repositorio editorial Automatic. FASE 2C ya está finalizada; el diseño físico continúa aplazado hasta aceptar Manual y autorizar expresamente la fase Automatic.

## Persistencia editorial vigente desde FASE 3B

`EditorialResearchRepository` es el puerto único del agregado V3. `SupabaseEditorialResearchRepository` normaliza sus entidades y relaciones en 23 tablas PostgreSQL, reconstruye el resultado desde un checkpoint validado y expone idempotencia, listado, checkpoints y locks. `MemoryEditorialResearchRepository` existe solo como doble de tests; no es fallback ni persistencia de runtime.

La migración y el seed se reconstruyeron con `supabase db reset`; RLS quedó activa en todas las tablas editoriales y solo `service_role` local conserva acceso. La integración de ida/vuelta usa URL loopback y credenciales efímeras de `supabase status -o env`. Producción, Trawel y cualquier proyecto remoto permanecen desconectados.
