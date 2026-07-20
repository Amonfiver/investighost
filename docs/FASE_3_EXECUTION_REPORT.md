# Informe acumulado de ejecución — FASE 3

Fecha de inicio: 2026-07-21
Rama: `feat/investighost-reinvencion`
Commit base: `996e098`

## Restricciones permanentes observadas

- Supabase local/PostgreSQL y Storage local son la única persistencia durable.
- Cero SQLite, Better SQLite, Drizzle, fallback, base paralela o file store alternativo.
- Producción y Trawel desconectados; cero credenciales remotas.
- No ejecutar `supabase link` ni `supabase db push`.
- No implementar Automatic, publicar ni avanzar a FASE 4.

## Preflight inicial

- Prompt Maestro V3: 1.820 líneas extraídas y leídas, 28 páginas.
- Hoja de Ruta V3 adjunta: 458 líneas leídas.
- Fuentes internas obligatorias: 21 documentos, 5.601 líneas, leídos íntegramente.
- Árbol inicial recuperado de conversiones LF/CRLF autorizadas; blobs exactos a `HEAD`, sin untracked.
- Rama y upstream correctos; `HEAD` y upstream 0/0 en `996e098`.
- Gates base: typecheck, lint, 62/62 tests y build Vite/main/preload aprobados.
- Supabase CLI 2.109.1 disponible; Docker Desktop detenido al preflight.

## FASE 3A — dominio editorial canónico

Estado: aprobada técnicamente.

### Resultado

- V3 formalizada íntegra en `docs/INVESTIGHOST_HOJA_DE_RUTA_CANONICA_V3.md` con fecha real 2026-07-21.
- Contrato ejecutable neutral en `src/shared/editorial-contracts.ts`.
- Identidad geográfica, solicitud, ejecución, fuentes, hechos, lugares, actividades, perfiles, secciones, revisión, costes y eventos definidos.
- Máquinas de estado, ownership, ciclos de vida, versionado, idempotencia y trazabilidad cerrados.
- Matriz de gaps, tablas, migración, repositorios y plan de tests documentados en `FASE_3A_DOMAIN_DESIGN.md`.
- Cero implementación de Automatic y cero proveedor real obligatorio.

### Evidencia

- Tests específicos de contrato: 6/6, incluida integridad entre identificadores del agregado.
- Typecheck tras contratos: aprobado.
- Gates completos: typecheck, lint, 67/67 tests generales y build Vite/main/preload aprobados.
- Commit lógico y upstream sincronizado: `f8df50c feat: completar fase 3a y consolidar dominio editorial`.

## FASE 3B — persistencia editorial en Supabase local

Estado: aprobada técnicamente.

### Resultado

- Migración versionada `20260721010000_editorial_pipeline.sql` aplicada desde cero sobre Supabase local.
- Veintitrés tablas normalizadas cubren geografía, solicitudes, ejecuciones, fuentes, hechos, lugares, actividades, perfiles, calidad, uso, eventos, checkpoints y locks.
- Las relaciones fuente→hecho→lugar/actividad/sección usan FKs y tablas puente; JSONB queda limitado a opciones, metadatos, payloads y snapshots justificados.
- UUID, `timestamptz`, checks, índices, RLS de denegación por defecto y acceso exclusivo de `service_role` local quedan aplicados.
- Repositorio neutral, doble en memoria y adaptador Supabase implementados con idempotencia, control de versión, checkpoints y locks.
- Seed local y repetible con Morella, jerarquía territorial sintética y homónimos `San Pedro` para probar ambigüedad futura.
- La validación del agregado rechaza relaciones cruzadas antes de persistir.

### Evidencia

- `supabase db reset`: aprobado; aplica las dos migraciones y el seed sin pasos manuales ocultos.
- `supabase db lint --level warning`: cero errores de esquema.
- Inventario local tras reset: 23/23 tablas editoriales, RLS activa en 23/23, 8 entidades geográficas y 4 aliases de seed.
- Tests de contrato/schema/repositorio: 16/16.
- Integración real local: 1/1; escribe, reconstruye idénticamente y limpia un agregado sintético completo.
- Gates completos: typecheck, lint, 78/78 tests generales y build Vite/main/preload aprobados; las dos integraciones opt-in quedan omitidas en la suite general y la editorial se ejecutó aparte.
- Docker Desktop se usó solo mediante el daemon local; URL y claves efímeras fueron exclusivamente loopback.

### Seguridad y límites

No se ejecutaron `supabase link` ni `supabase db push`; no se usó project ref, credencial remota, producción o Trawel. No se creó persistencia alternativa, implementación Automatic ni publicación. El siguiente escalón es 3C, identidad geográfica determinista sobre este catálogo local.

## FASE 3C — identidad geográfica canónica

Estado: aprobada técnicamente.

### Resultado

- GeoNames queda elegido como fuente gratuita, descargable y versionable bajo CC BY 4.0.
- Snapshot `geonames-2026-07-20` fijado con cuatro hashes y alcance España → Comunitat Valenciana → Morella.
- Tres IDs GeoNames importados; fixtures homónimos CC0 permanecen separados y explícitos.
- Resolución determinista exacta, por alias, tolerante y por jerarquía; resultados `resolved`, `ambiguous` y `not_found`.
- Correcciones humanas persistentes por consulta y versión; nunca se selecciona un homónimo silenciosamente.
- Procedencia, artefactos, IDs externos, última comprobación y correcciones normalizados en Supabase local.
- Corregidas las FKs de tablas puente detectadas por la prueba de limpieza integral del agregado.

### Evidencia

- Tests específicos: 11/11.
- Integraciones reales locales: geografía/corrección 1/1 y agregado/limpieza 1/1.
- `supabase db reset` y `supabase db lint --level warning`: aprobados.
- Gates completos: typecheck, lint, 89/89 tests generales y build Vite/main/preload aprobados; las tres integraciones opt-in se omiten en la suite general y las dos aplicables a 3C aprobaron aparte.
- Estado limpio tras integración: 8 entidades, 7 aliases, 3 IDs externos, 1 snapshot, 4 artefactos, 0 correcciones y 0 solicitudes.
- Diseño, algoritmo, fuente y hashes documentados en `FASE_3C_GEOGRAPHY.md`.

### Seguridad y límites

El snapshot se adquirió desde un dump público sin credenciales. El runtime es local y no depende de la red. No hubo conexión a producción/Trawel, proyecto remoto, Automatic o publicación. El siguiente escalón es 3D, contratos desacoplados de proveedores sobre mocks deterministas.

## Fases siguientes

- 3D–3I: proveedores, hechos, perfiles, calidad, UI y resiliencia.
- 3J: preparación y detención en aceptación humana Manual.
