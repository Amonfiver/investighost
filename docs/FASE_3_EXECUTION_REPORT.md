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

## FASE 3D — proveedores y adquisición de fuentes

Estado: aprobada técnicamente.

### Resultado

- Puerto `EditorialSourceProvider` desacoplado para descubrimiento, lectura y evaluación.
- Orquestador con timeout, `AbortSignal`, cancelación, retry/backoff acotado, límites, presupuesto y circuit breaker.
- Normalización/deduplicación de URLs, detección de contenido espejo y clasificación de enlaces rotos.
- Uso/costes y eventos auditables por intento, sin consultas, cuerpos o secretos en logs/payloads.
- `MockEditorialSourceProvider` determinista, único proveedor nuevo y siempre marcado como simulación.
- Salidas compatibles con `ResearchSource`, `ProviderUsage` y `ResearchEvent`; un adaptador autorizado futuro no cambia el dominio.

### Evidencia

- Tests específicos: 9/9.
- Casos: éxito, deduplicación, espejo, enlace roto, retry, timeout, cancelación, presupuesto, límites, circuit breaker y redacción.
- Gates completos: typecheck, lint, 98/98 tests generales y build Vite/main/preload aprobados; tres integraciones opt-in omitidas en la suite general.
- Diseño y límites documentados en `FASE_3D_SOURCE_PROVIDERS.md`.

### Seguridad y límites

No se realizó ninguna llamada de proveedor real ni se leyeron/guardaron API keys. Los cuerpos leídos quedan efímeros para la estructuración de 3E; no se persisten como secretos o blobs opacos. Producción, Trawel, Automatic y publicación permanecen fuera de alcance. El siguiente escalón es 3E.

## FASE 3E — estructuración factual

Estado: aprobada técnicamente.

### Resultado

- Puerto factual neutral y mock determinista para convertir documentos aceptados en hechos, lugares y actividades canónicos.
- Claves/valores normalizados, IDs deterministas, confianza ponderada, volatilidad, vigencia y Zod final.
- Duplicados fusionados con todas sus fuentes; contradicciones preservadas como confirmadas/disputadas.
- Lugares y actividades solo aceptan claves factuales existentes y fusionan sus relaciones sin perder evidencia.
- Checkpoint con hash después de cada fuente; reanudación exige mismo contrato, intento y orden de fuentes.

### Evidencia

- Tests específicos: 8/8.
- Caída sintética en segunda fuente y reanudación sin volver a invocar la primera.
- Casos negativos: checkpoint incompatible, referencia factual ausente, cero fuentes aceptadas y cancelación.
- Gates completos: typecheck, lint, 106/106 tests generales y build Vite/main/preload aprobados; tres integraciones opt-in omitidas en la suite general.
- Diseño e invariantes documentados en `FASE_3E_FACTUAL_STRUCTURING.md`.

### Seguridad y límites

La masa documental no produce texto definitivo: primero se estructura y traza. Solo existe proveedor factual mock, sin red o claves. Producción, Trawel, Automatic y publicación siguen fuera de alcance. El siguiente escalón es 3F.

## FASE 3F — generación Aventura y Estudiante

Estado: aprobada técnicamente.

### Resultado

- Especificaciones ejecutables `adventure-v1` y `student-v1` con propósitos, prioridades, tono, estructura, longitudes y prohibiciones diferentes.
- Puerto de generación neutral y proveedor mock determinista sin red.
- Validación fuente→hecho→sección, IDs/versiones deterministas, coste, presupuesto y cancelación.
- Diferenciación estructural: ruta/destacados frente a presupuesto/vida diaria/estudio.
- Regeneración parcial con motivo, nueva versión, enlace al borrador anterior y secciones no objetivo intactas.
- Migración de historial y persistencia Supabase de v1/v2 verificadas.

### Evidencia

- Tests específicos: 8/8.
- `supabase db reset` y `supabase db lint --level warning`: aprobados con la cuarta migración.
- Integración editorial local: 1/1; conserva dos versiones enlazadas, reconstruye la actual y limpia el agregado.
- Gates completos: typecheck, lint, 114/114 tests generales y build Vite/main/preload aprobados; tres integraciones opt-in omitidas en la suite general.
- Diseño documentado en `FASE_3F_EDITORIAL_PROFILES.md`.

### Seguridad y límites

Solo se usó el proveedor editorial mock. No hubo claves, llamadas reales, producción, Trawel, publicación o Automatic. El siguiente escalón es 3G.

## FASE 3G — RevisIAtor y calidad

Estado: aprobada técnicamente.

### Resultado

- Motor determinista `revisiator-v1`, independiente de generación y sin red.
- Diecisiete reglas por perfil para schema, cobertura, trazabilidad, fuentes, contradicciones, duplicados, clichés, relleno, geografía, idioma, coherencia, diferenciación, volatilidad y seguridad.
- Checks persistibles con evidencia/corrección y outcomes `passed`, `passed_with_warnings`, `changes_requested`, `blocked` o `rejected`.
- IDs de revisión/check deterministas por borrador/versión/regla.
- `requiresHumanDecision = true`; ningún borrador cambia a aprobado.

### Evidencia

- Tests específicos: 8/8.
- Gates completos: typecheck, lint, 122/122 tests generales y build Vite/main/preload aprobados; tres integraciones locales opt-in omitidas en la suite general.
- Caso limpio: 34 checks, dos perfiles aprobados técnicamente y estados `ready` intactos.
- Casos de warning, cambios, bloqueo, rechazo e input inválido cubiertos.
- Diseño y precedencia documentados en `FASE_3G_REVISIATOR.md`.

### Seguridad y límites

RevisIAtor recomienda y bloquea técnicamente cuando procede, pero no sustituye a un revisor, no publica y no invoca proveedores. Producción, Trawel y Automatic permanecen fuera de alcance. El siguiente escalón es 3H.

## FASE 3H — interfaz Manual completa

Estado: aprobada técnicamente.

### Resultado

- Caso de uso `ManualResearchService` sobre el agregado y repositorio canónicos, sin ruta paralela de UI.
- Scaffold durable previo a checkpoints, progreso por etapa, lock de ejecución y agregado final en Supabase local.
- IPC main/preload estrecho: resolución/corrección geográfica, ejecución, biblioteca, detalle, versiones, edición, regeneración, revisión y decisión.
- Renderer operativo para configuración, progreso, incidencias, fuentes, hechos, lugares, actividades, comparación, RevisIAtor, costes e historial.
- Edición/regeneración crean versiones enlazadas; aprobación exige la transición humana `ready → in_review → approved`.

### Evidencia

- Tests específicos: 5/5.
- Integración Manual Supabase local: 1/1; scaffold, checkpoints, resultado, v1/v2, recuperación e higiene aprobados.
- Gates completos: typecheck, lint, 127/127 tests generales y build Vite/main/preload aprobados; cuatro integraciones locales opt-in omitidas en la suite general.
- Diseño y mapa de vistas documentados en `FASE_3H_MANUAL_UI.md`.

### Seguridad y límites

El renderer no recibe secretos. Solo se usan Supabase local y proveedores mock. No hay publicación, conexión Trawel/producción, proveedor real o Automatic. La recuperación/reintento/cancelación integral se completa a continuación en 3I.

## FASE 3I — resiliencia, costes e idempotencia

Estado: aprobada técnicamente.

- Checkpoints versionados/hash por etapa, reanudación del mismo intento y reintentos enlazados.
- Locks con lease renovable, heartbeat, cancelación durable y presupuesto acumulado.
- Recuperación de caída entre scaffold/control; regeneración usa presupuesto restante.
- Fallos de proveedor, base, Electron, Storage no requerido, corrupción y concurrencia probados.
- Migración local `20260721040000_editorial_resilience.sql`, reset y lint SQL aprobados.
- Evidencia final: 136 tests generales, 5 integraciones locales, typecheck, lint y build aprobados.
- Commit y upstream: `4833041 feat: completar fase 3i con resiliencia manual`.

## FASE 3J — aceptación humana Manual

Estado: **aprobada humanamente y cerrada**.

- J01–J17 fueron ejecutados y aprobados expresamente por el jefe del proyecto.
- El protocolo y acta cerrada están en `FASE_3J_ACEPTACION_HUMANA_MANUAL.md`.
- J14 detectó un defecto de consulta y reapertura del rechazo; la corrección añadió historial visible, `rejected → in_review`, comentario obligatorio y `manual.review.reopened`.
- J14 se repitió con dos ciclos trazables sobre Aventura v3, sin nueva versión, solicitud, run o coste.
- J15 aprobó Estudiante v2 localmente sin publicación o envío a Trawel.
- J16 reconcilió intentos, versiones, eventos y un coste total de 0,26 EUR.
- J17 confirmó publicaciones en cero y ausencia de Automatic, Trawel, producción, credenciales y proveedores reales.
- Decisión inequívoca del jefe: **FASE 3J APROBADA**.

## Cierre y frontera posterior

El flujo Manual de FASE 3 queda cerrado. No se inicia FASE 4 y no hay trabajo posterior autorizado. Automatic, producción, Trawel y publicación permanecen bloqueados.
