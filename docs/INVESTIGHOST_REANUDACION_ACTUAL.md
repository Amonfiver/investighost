# Investighost — punto de reanudación actual

Fecha de actualización: 2026-07-23 01:14:39 CEST (UTC+02:00)
Objetivo de reanudación: repetir exclusivamente **J06 — Una fuente rota** después de corregir su trazabilidad HTTP 404.

Este documento es la fuente operativa canónica para la próxima sesión. No autoriza J07, la aprobación automática de J06, el cierre de FASE 3J, FASE 4, Automatic, producción, Trawel, publicación ni proveedores reales.

## 1. Identificación y estado Git de partida

- Proyecto: `D:\Proyectos\investighost`.
- Ruta WSL: `/mnt/d/Proyectos/investighost`.
- Rama: `feat/investighost-reinvencion`.
- HEAD inicial de esta corrección: `df84a5013bbf288d6012455b937c4a2ae42c3f25` (`fix: corregir incidencia durable de j05`).
- Upstream: `origin/feat/investighost-reinvencion`.
- Estado inicial comprobado después de `git fetch`: árbol limpio y divergencia `0/0`.
- Commit de cierre previsto: `fix: hacer trazable el 404 parcial de j06` (el hash final se entrega en el informe de cierre).

## 2. Estado general vigente

- FASE 2C-C: completada.
- FASE 3A–3I: completadas técnicamente.
- FASE 3J: en aceptación humana y **no aprobada**.
- J01–J05: aprobados por decisión humana expresa.
- J05: aprobado tras la corrección durable del commit `df84a5013bbf288d6012455b937c4a2ae42c3f25`.
- J06: rechazado inicialmente por defecto de trazabilidad; corrección técnica implementada y validada, pero **pendiente de repetición y decisión humana**.
- J07–J17: no autorizados mientras J06 no tenga decisión humana expresa.
- FASE 4: no iniciada.
- Automatic: no implementado.
- Supabase local/PostgreSQL: única persistencia durable estructurada.
- Supabase Storage local: único file store durable.
- Producción, Trawel, publicación e IA real: desconectados.
- No hay SQLite, Drizzle, Better SQLite ni fallback de persistencia.
- No se han cargado créditos ni usado datos reales.

## 3. Decisiones humanas acumuladas

### J01 — APROBADO

- Morella se resolvió de forma exacta con el catálogo `geonames-2026-07-20`.
- El flujo válido conservó fuentes, hechos, lugares, actividades y borradores diferenciados.
- Cero publicaciones y cero envíos a Trawel.

### J02 — APROBADO

- `San Pedro`, país `ZZ`, mostró Norte y Sur.
- No hubo selección silenciosa.

### J03 — APROBADO

- Selección humana explícita de `Testland › Sur › San Pedro`.
- Método `human`, catálogo, procedencia y corrección geográfica durable conservados.

### J04 — APROBADO

- Una nueva solicitud de Morella reutilizó la misma identidad geográfica canónica.
- No se duplicó la entidad y publicaciones permanecieron en cero.

Observación no bloqueante de J04: repetir Morella volvió a imputar el coste simulado completo. Antes de conectar IA real se deberá ofrecer reutilización de conocimiento, actualización selectiva o regeneración parcial bajo decisión humana. Este requisito no forma parte de J06.

### J05 — APROBADO

- El escenario `Fuentes insuficientes` quedó como incidencia durable y controlada.
- Se muestran estado, etapa `fact_structuring`, código `NO_ACCEPTED_SOURCES`, clasificación `data_quality`, mensaje, fecha, request ID, run ID y destination ID.
- La incidencia admite reintento sin duplicar solicitud ni destino.
- Commit de corrección y aprobación: `df84a5013bbf288d6012455b937c4a2ae42c3f25`.

## 4. J06 original — RECHAZADO

Configuración ejecutada:

- Destino: Morella.
- País ISO: ES.
- Tipo: Localidad.
- Perfiles: Aventura y Estudiante.
- Profundidad: Estándar.
- Presupuesto máximo simulado: 2 EUR.
- Intentos máximos: 3.
- Escenario: `Una fuente rota` (`broken_source`).

La ejecución terminó y conservó evidencia útil:

- estado `Completada`;
- 2 fuentes: una `ACCEPTED` y una `UNAVAILABLE`;
- 3 hechos;
- 1 lugar;
- 1 actividad;
- 2 borradores;
- coste simulado: 0,23 EUR;
- publicaciones: 0.

El rechazo se debió a que no se mostraban HTTP 404, código de lectura, mensaje controlado ni evento explícito de fuente no disponible. Historial mostraba `provider.reading.succeeded` también para el retorno roto, de modo incoherente con `UNAVAILABLE`.

Evidencia durable original inspeccionada directamente en Supabase local:

- request ID: `25d04f8c-fc6d-4b0c-a988-99233a4ffc49`;
- run ID: `bde7b2e3-1ef9-4f6b-8d4c-6744112ee275`;
- source ID rota: `9e80c496-33bb-4322-a033-62fc4e614fb2`;
- source status: `unavailable`;
- metadato histórico disponible: `errorCode: HTTP_404`;
- evento histórico ambiguo: `provider.reading.succeeded`;
- etapa del evento: `source_reading`.

## 5. Causa raíz exacta

1. El escenario simulado sí devolvía `status: broken` y `httpStatus: 404` desde `MockEditorialSourceProvider.read`.
2. `SourceAcquisitionService.executeOperation` consideraba exitoso cualquier valor que cumpliera el contrato `SourceDocument`, aunque su estado semántico fuera `broken`.
3. Por ello registraba `provider.reading.succeeded` antes de que `acquire` examinara `document.status` y `content`.
4. Después, `acquire` convertía correctamente la fuente en `unavailable`, pero `unavailableSource` solo conservaba `metadata.errorCode`.
5. No persistía mensaje, HTTP status numérico, etapa, fecha, proveedor, operación o intento en un detalle estructurado.
6. Tampoco se emitía un evento explícito `source.unavailable`.
7. La pestaña Fuentes no interpretaba el error de `metadata`, y el Historial solo mostraba tipo de evento, etapa y correlación.

La tolerancia parcial del pipeline funcionaba; el defecto estaba en la semántica del evento, la riqueza del registro durable y su presentación.

## 6. Flujo corregido exclusivamente para J06

- Se añadió el contrato `ResearchSourceFailureSchema` con:
  - `errorCode`;
  - `httpStatus` opcional;
  - mensaje controlado;
  - etapa fija `source_reading`;
  - fecha/hora `occurredAt`;
  - intento;
  - proveedor;
  - operación `reading` o `evaluation`.
- La fuente `unavailable` guarda ese detalle en `research_sources.metadata.failure`, además del `errorCode` compatible existente. Su propia fila ya aporta source ID, run ID, estado y captura.
- La lectura solo genera `provider.reading.succeeded` cuando el documento está realmente leído y contiene contenido.
- Un retorno roto HTTP 404 conserva exactamente:
  - `errorCode: HTTP_404`;
  - `httpStatus: 404`;
  - intento `1` en el fixture;
  - etapa `source_reading`;
  - mensaje `La lectura de la fuente devolvió HTTP 404; se marcó como no disponible y el pipeline continuó con la evidencia válida.`
- Se persiste el evento explícito `source.unavailable`, enlazado a request, run y source, con código, status, mensaje, intento, proveedor y fecha/hora.
- La pestaña Fuentes muestra el 404, mensaje, código, etapa, intento, fecha, source ID y run ID.
- Historial muestra `source.unavailable` y resume HTTP 404, source ID, intento y run ID.
- La fuente aceptada continúa visible y alimenta 3 hechos, 1 lugar, 1 actividad y 2 borradores.
- La ejecución parcial sigue completándose; no se convirtió J06 en fallo global.

## 7. Persistencia y migraciones

No hay migración nueva para J06. `research_sources.metadata` ya es un objeto JSONB durable y justificado para metadatos de proveedor; `research_events.payload` ya es el contrato durable de auditoría. La integración local comprobó ambos registros directamente en PostgreSQL.

No se ejecutaron `supabase link`, `supabase db push` ni `supabase db reset`. No se modificó ni eliminó la evidencia humana histórica.

## 8. Archivos modificados

- `src/shared/editorial-contracts.ts`: contrato estructurado del fallo de fuente.
- `src/modules/editorial-pipeline/source-providers.ts`: semántica de éxito, persistencia del 404 y evento `source.unavailable`.
- `src/renderer/App.tsx`: detalle visible en Fuentes e Historial, incluida compatibilidad visual con el registro histórico mínimo.
- `src/renderer/App.css`: estados y bloques visuales del fallo parcial.
- `tests/source-acquisition.test.ts`: contrato, HTTP 404 y coherencia de eventos.
- `tests/manual-resilience.test.ts`: continuidad del pipeline con evidencia restante.
- `tests/manual-supabase.integration.test.ts`: persistencia real de fuente/evento y agregado completado.
- `docs/INVESTIGHOST_REANUDACION_ACTUAL.md`: este punto de reanudación.

## 9. Pruebas y validaciones realizadas

- Pruebas específicas `source-acquisition` + `manual-resilience`: 20/20 aprobadas.
- Integración Manual Supabase local: 5/5 aprobadas, incluida la persistencia J06 HTTP 404.
- Suite normal sin integraciones opt-in: 139 aprobadas y 8 omitidas según diseño.
- Suite completa con todas las integraciones Supabase locales: 147/147 aprobadas.
- Typecheck: aprobado.
- ESLint TypeScript/React con cero warnings: aprobado.
- Build de renderer, main y preload: aprobado.
- `npm run build` llegó a compilar y empaquetar la aplicación, pero el paso estándar de `winCodeSign` falló porque el usuario Windows no tiene privilegio para crear dos enlaces simbólicos en la caché externa.
- Build completo alternativo `npm run build -- --config.win.signAndEditExecutable=false`: aprobado; generó el instalador NSIS sin edición/firma del ejecutable.
- `supabase db lint --local`: aprobado, sin errores de schema.
- `git diff --check`: aprobado después de la actualización documental; debe repetirse como comprobación final antes del commit.

No se usaron proveedores de red, IA real, créditos, datos reales, producción, Trawel ni publicación.

## 10. Estado local conservado y gate humano

Después de limpiar únicamente los fixtures temporales creados por las integraciones, Supabase local conserva:

- 5 solicitudes humanas;
- 3 completadas;
- 2 incidencias J05;
- 1 identidad canónica de Morella para `70000000-0000-4000-8000-000000000003`;
- la ejecución J06 original rechazada;
- publicaciones en cero.

La corrección técnica de J06 está lista y validada automáticamente, pero J06 **no está aprobado automáticamente**. FASE 3J sigue abierta y no se autoriza J07. El protocolo fuente continúa en `docs/FASE_3J_ACEPTACION_HUMANA_MANUAL.md`.

## 11. Arranque local desde PowerShell

Ejecutar en PowerShell:

```powershell
cd D:\Proyectos\investighost

$supabaseVars = @{}

npx supabase status -o env 2>$null | ForEach-Object {
    if ($_ -match '^([A-Z0-9_]+)=(.*)$') {
        $name = $matches[1]
        $value = $matches[2].Trim().Trim('"')
        $supabaseVars[$name] = $value
    }
}

if (-not $supabaseVars["API_URL"]) {
    throw "No se pudo obtener API_URL de Supabase local."
}

if (-not $supabaseVars["SERVICE_ROLE_KEY"]) {
    throw "No se pudo obtener SERVICE_ROLE_KEY de Supabase local."
}

$env:SUPABASE_URL = $supabaseVars["API_URL"]
$env:SUPABASE_SERVICE_ROLE_KEY = $supabaseVars["SERVICE_ROLE_KEY"]

npm run dev
```

Mantener abierta esa terminal. No abrir dos instancias. Confirmar `Supabase local`, `Local · Manual · Simulado` y `Publicaciones: 0`.

## 12. Instrucciones exactas para repetir J06

1. Abrir Investighost con el bloque anterior.
2. En Biblioteca comprobar el estado conservado previo a repetir: 5 investigaciones, 3 completadas, 2 incidencias y 0 publicaciones.
3. Pulsar `Nueva investigación`.
4. Configurar:
   - Destino: `Morella`.
   - País ISO: `ES`.
   - Tipo: `Localidad`.
5. Pulsar `Resolver destino` y comprobar:
   - Morella resuelta;
   - jerarquía `España › Comunitat Valenciana › Morella`;
   - método `exact`;
   - catálogo `geonames-2026-07-20`;
   - GeoNames `3116121`.
6. Mantener Aventura y Estudiante.
7. Profundidad: `Estándar`.
8. Presupuesto máximo simulado: `2` EUR.
9. Intentos máximos: `3`.
10. Escenario sintético: `Una fuente rota`.
11. Pulsar `Iniciar investigación Manual`.
12. Comprobar que la ejecución termina `Completada` y muestra:
    - 2 fuentes;
    - 3 hechos;
    - 1 lugar;
    - 1 actividad;
    - 2 borradores;
    - coste simulado de 0,23 EUR;
    - publicaciones en 0.
13. Abrir `Fuentes` y comprobar:
    - una fuente `ACCEPTED` con fiabilidad, actualidad, editor y captura;
    - una fuente `UNAVAILABLE`;
    - encabezado `HTTP 404`;
    - código `HTTP_404`;
    - mensaje controlado completo;
    - etapa `Lectura` (`source_reading`);
    - intento `1`;
    - fecha/hora;
    - source ID y run ID.
14. Abrir `Historial` y comprobar:
    - evento explícito `source.unavailable`;
    - resumen `HTTP 404`;
    - el mismo source ID;
    - intento `1`;
    - run ID asociado;
    - solo una lectura exitosa, correspondiente a la fuente aceptada.
15. Confirmar que la fuente no disponible no aparece como aceptada ni alimenta hechos, y que la fuente válida conserva el resto del resultado.
16. Volver a Biblioteca y comprobar: 6 investigaciones, 4 completadas, 2 incidencias y 0 publicaciones.
17. No iniciar J07 ni otro escenario.
18. Registrar una decisión humana inequívoca sobre J06: `APROBADO` o `RECHAZADO`, con evidencia visible y fecha/hora.

## 13. Restricciones que siguen vigentes

- No avanzar a J07 sin decisión humana expresa sobre la repetición de J06.
- No aprobar J06 por inferencia técnica.
- No declarar FASE 3J aprobada.
- No iniciar FASE 4.
- No implementar Automatic.
- No conectar Trawel o producción.
- No publicar.
- No usar IA real, datos reales o créditos.
- No ejecutar `supabase link`, `supabase db push` ni `supabase db reset` sobre el estado humano conservado.
- No introducir SQLite, Drizzle, Better SQLite, segunda base, file store alternativo ni fallback.
- No borrar las investigaciones humanas ni la corrección durable de J03.
- No alterar la identidad canónica de Morella.

# SIGUIENTE ACCIÓN OBLIGATORIA Y EXCLUSIVA

```text
REPETIR J06 — Una fuente rota
```

La aprobación o rechazo de J06 seguirá siendo exclusivamente humano.
