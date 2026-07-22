# Investighost — punto de reanudación actual

Fecha de actualización: 2026-07-23 01:31:59 CEST (UTC+02:00)
Objetivo de reanudación: ejecutar exclusivamente **J09 — Interrupción y reanudación** y esperar después una decisión humana expresa.

Este documento es la fuente operativa canónica para la próxima sesión. No autoriza J10, la aprobación automática de J09, el cierre de FASE 3J, FASE 4, Automatic, producción, Trawel, publicación ni proveedores reales.

## 1. Identificación y estado Git de partida

- Proyecto: `D:\Proyectos\investighost`.
- Ruta WSL: `/mnt/d/Proyectos/investighost`.
- Rama: `feat/investighost-reinvencion`.
- HEAD inicial de este cierre documental: `8e8d14b564541efe90e898f5bb289f09adbb41e9` (`fix: hacer trazable el 404 parcial de j06`).
- Upstream: `origin/feat/investighost-reinvencion`.
- Estado inicial comprobado después de `git fetch`: árbol limpio y divergencia `0/0`.
- Commit de cierre previsto: `docs: cerrar gate humano hasta j08` (el hash final se entrega en el informe de cierre).

## 2. Estado general vigente

- FASE 2C-C: completada.
- FASE 3A–3I: completadas técnicamente.
- FASE 3J: en aceptación humana y **no aprobada**.
- J01–J08: aprobados por decisión humana expresa.
- J05: aprobado tras la corrección durable del commit `df84a5013bbf288d6012455b937c4a2ae42c3f25`.
- J06: aprobado tras la corrección durable del commit `8e8d14b564541efe90e898f5bb289f09adbb41e9`.
- J07: aprobado; la indisponibilidad del proveedor quedó como incidencia durable y clasificada.
- J08: aprobado; el reintento recuperó la misma solicitud en un segundo run enlazado.
- J09: no ejecutado y pendiente de decisión humana.
- J10–J17: no autorizados mientras J09 no tenga decisión humana expresa.
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

Observación no bloqueante pendiente desde J04: repetir una investigación reutiliza la identidad canónica, pero vuelve a imputar el coste completo. Antes de conectar IA real se deberá:

- reutilizar conocimiento existente;
- actualizar solo datos volátiles;
- regenerar un perfil o una sección cuando sea suficiente;
- rehacer completamente solo bajo decisión humana;
- no volver a imputar el coste completo cuando se usen datos propios;
- mantener Investighost como base maestra durable;
- usar Trawel únicamente como futura base de publicación del contenido aprobado.

Este requisito no se implementa durante el gate de aceptación humana.

### J05 — APROBADO

- El escenario `Fuentes insuficientes` quedó como incidencia durable y controlada.
- Se muestran estado, etapa `fact_structuring`, código `NO_ACCEPTED_SOURCES`, clasificación `data_quality`, mensaje, fecha, request ID, run ID y destination ID.
- La incidencia admite reintento sin duplicar solicitud ni destino.
- Commit de corrección y aprobación: `df84a5013bbf288d6012455b937c4a2ae42c3f25`.

## 4. J06 — APROBADO tras corrección

J06 fue rechazado inicialmente por el defecto descrito a continuación. La corrección quedó en el commit `8e8d14b564541efe90e898f5bb289f09adbb41e9`, se repitió el escenario y recibió aprobación humana expresa.

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

Resultado humano confirmado:

- fuente `UNAVAILABLE` con HTTP 404;
- código `HTTP_404`;
- mensaje, etapa, intento, fecha, source ID y run ID visibles;
- evento `source.unavailable` visible en Historial;
- pipeline completado con la evidencia válida;
- J06 **APROBADO**.

## 7. J07 y J08 — APROBADOS

### J07 — Proveedor no disponible

- El primer intento falló de forma controlada.
- Código durable: `PERMANENT`.
- Clasificación durable: `provider` (`Proveedor` en la interfaz).
- Etapa registrada: `source_discovery`.
- La incidencia quedó visible en Biblioteca.
- Request ID: `85630509-8ec6-4462-8fe6-9a2c036e7e20`.
- Run fallido: `f461901e-a4de-4daa-9b6c-4c0ff0e848e7`.
- J07 **APROBADO** por decisión humana expresa.

### J08 — Reintentar etapa sobre J07

- Se utilizó la acción `Reintentar etapa` sobre la incidencia J07.
- El intento 1 permaneció fallido y el intento 2 terminó completado.
- Se conservó la misma solicitud `85630509-8ec6-4462-8fe6-9a2c036e7e20`.
- Run completado: `d0c91fc6-7c57-4e75-9cee-1838d4ae490f`.
- El segundo run enlaza `recovery_from_run_id` con `f461901e-a4de-4daa-9b6c-4c0ff0e848e7`.
- Se conservó la misma identidad canónica de Morella.
- No hubo duplicación de solicitud ni destino.
- J08 **APROBADO** por decisión humana expresa.

## 8. Persistencia y migraciones

No hay migración nueva para J06. `research_sources.metadata` ya es un objeto JSONB durable y justificado para metadatos de proveedor; `research_events.payload` ya es el contrato durable de auditoría. La integración local comprobó ambos registros directamente en PostgreSQL.

No se ejecutaron `supabase link`, `supabase db push` ni `supabase db reset`. No se modificó ni eliminó la evidencia humana histórica.

## 9. Archivos de la corrección J06

Este cierre de sesión no modifica código: solo actualiza `docs/INVESTIGHOST_REANUDACION_ACTUAL.md`. Se conservan como antecedente los archivos de la corrección J06:

- `src/shared/editorial-contracts.ts`: contrato estructurado del fallo de fuente.
- `src/modules/editorial-pipeline/source-providers.ts`: semántica de éxito, persistencia del 404 y evento `source.unavailable`.
- `src/renderer/App.tsx`: detalle visible en Fuentes e Historial, incluida compatibilidad visual con el registro histórico mínimo.
- `src/renderer/App.css`: estados y bloques visuales del fallo parcial.
- `tests/source-acquisition.test.ts`: contrato, HTTP 404 y coherencia de eventos.
- `tests/manual-resilience.test.ts`: continuidad del pipeline con evidencia restante.
- `tests/manual-supabase.integration.test.ts`: persistencia real de fuente/evento y agregado completado.
- `docs/INVESTIGHOST_REANUDACION_ACTUAL.md`: este punto de reanudación.

## 10. Pruebas y validaciones de la corrección J06

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
- `git diff --check`: aprobado para este cierre documental J01–J08.

No se usaron proveedores de red, IA real, créditos, datos reales, producción, Trawel ni publicación.

## 11. Estado local conservado y gate humano

Después de limpiar únicamente los fixtures temporales creados por las integraciones, Supabase local conserva:

- 7 solicitudes humanas;
- 5 completadas;
- 2 incidencias J05;
- 2 ejecuciones del escenario J06, incluida su repetición aprobada;
- 1 solicitud del escenario J07/J08 con 2 runs enlazados;
- 1 identidad canónica de Morella para `70000000-0000-4000-8000-000000000003`;
- publicaciones en cero.

J01–J08 están aprobados por decisión humana expresa. J09 todavía no se ha ejecutado. FASE 3J sigue abierta y no se autoriza J10. El protocolo fuente continúa en `docs/FASE_3J_ACEPTACION_HUMANA_MANUAL.md`.

## 12. Arranque local desde PowerShell

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

## 13. Protocolo exacto para J09 — Interrupción y reanudación

J09 todavía no se ha ejecutado. En la próxima sesión:

1. Crear Morella / ES / Localidad.
2. Mantener Aventura y Estudiante.
3. Profundidad `Estándar`.
4. Presupuesto máximo simulado: `2` EUR.
5. Intentos máximos: `3`.
6. Seleccionar `Ejecución lenta para interrumpir`.
7. Iniciar investigación Manual.
8. Cerrar Electron mientras progresa.
9. Esperar a que venza el lease si fuera necesario.
10. Abrir de nuevo.
11. Verificar el scaffold durable en Biblioteca.
12. Pulsar `Reanudar`.
13. Confirmar la continuación desde checkpoint o etapa durable.
14. Confirmar la finalización sin crear otra solicitud.
15. Esperar una decisión humana expresa sobre J09.
16. No avanzar a J10 sin aprobación expresa.

## 14. Restricciones que siguen vigentes

- No ejecutar J09 durante este cierre documental.
- No avanzar a J10 sin decisión humana expresa sobre J09.
- No aprobar J09 ni ninguna otra prueba por inferencia técnica.
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
J09 — Interrupción y reanudación
```

La aprobación o rechazo de J09 seguirá siendo exclusivamente humano.
