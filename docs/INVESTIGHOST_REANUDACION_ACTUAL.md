# Investighost — punto de reanudación actual

Fecha de actualización: 2026-07-23 00:41:43 CEST (UTC+02:00)
Objetivo de reanudación: repetir exclusivamente **J05 — Fuentes insuficientes** después de la corrección técnica del bloqueo observado.

Este documento es la fuente operativa canónica para la próxima sesión. No autoriza J06, la aprobación automática de J05, el cierre de FASE 3J, FASE 4, Automatic, producción, Trawel, publicación ni proveedores reales.

## 1. Identificación y estado Git de partida

- Proyecto: `D:\Proyectos\investighost`.
- Ruta WSL: `/mnt/d/Proyectos/investighost`.
- Rama: `feat/investighost-reinvencion`.
- HEAD inicial de esta corrección: `f877de22bdafb1fe649f956cd1b7c09b820a37a1` (`docs: guardar punto de reanudación de fase 3j`).
- Upstream: `origin/feat/investighost-reinvencion`.
- Estado inicial comprobado después de `git fetch`: árbol limpio y divergencia `0/0`.
- Commit nuevo de cierre previsto: `fix: corregir incidencia durable de j05` (el commit que contiene esta actualización; el hash final se entrega en el informe de cierre).

## 2. Estado general vigente

- FASE 2C-C: completada.
- FASE 3A–3I: completadas técnicamente.
- FASE 3J: en aceptación humana y **no aprobada**.
- J01–J04: aprobados por decisión humana expresa.
- J05: rechazado originalmente como bloqueo; corrección técnica implementada, pero **pendiente de repetición y decisión humana**.
- J06–J17: no autorizados mientras J05 no tenga decisión humana expresa.
- FASE 4: no iniciada.
- Automatic: no implementado.
- Supabase local/PostgreSQL: única persistencia durable estructurada.
- Supabase Storage local: único file store durable.
- Producción, Trawel, publicación e IA real: desconectados.
- No hay SQLite, Drizzle, Better SQLite ni fallback de persistencia.
- No se han cargado créditos ni usado datos reales.

## 3. Decisiones humanas acumuladas

### J01 — APROBADO

- Morella, ES, Localidad.
- Resolución exacta y catálogo `geonames-2026-07-20`.
- Flujo completado con 2 fuentes, 7 hechos, 2 lugares y 2 actividades.
- Borradores Aventura y Estudiante diferenciados y listos para revisión.
- Cero publicaciones y cero envíos a Trawel.

### J02 — APROBADO

- `San Pedro`, país `ZZ`, Localidad.
- Norte y Sur quedaron visibles.
- No hubo selección silenciosa.

### J03 — APROBADO

- Selección humana explícita de `Testland › Sur › San Pedro`.
- Método `human`, catálogo y procedencia conservados.
- La corrección geográfica durable debe preservarse.

### J04 — APROBADO

- Se creó una nueva solicitud válida de Morella.
- Se reutilizó la misma identidad geográfica canónica.
- No se creó otra entidad Morella.
- Publicaciones permanecieron en cero.

Observación no bloqueante de J04: repetir Morella volvió a imputar el coste simulado completo de 0,24 EUR. Antes de conectar IA real se deberá ofrecer reutilización de conocimiento, actualización selectiva de datos volátiles, regeneración parcial o rehacer bajo decisión humana. Investighost seguirá siendo la base maestra y Trawel solo una futura base de publicación del contenido aprobado. Este requisito no se implementó durante la corrección J05.

## 4. J05 original — RECHAZADO

Configuración ejecutada:

- Destino: Morella.
- País ISO: ES.
- Tipo: Localidad.
- Perfiles: Aventura y Estudiante.
- Profundidad: Estándar.
- Presupuesto: 2 EUR simulados.
- Intentos máximos: 3.
- Escenario: `Fuentes insuficientes`.

La interfaz mostró como resultado final:

```text
Error invoking remote method 'manual:start':
FactualStructuringError: No hay fuentes aceptadas y leídas para estructurar
```

La pantalla conservó el formulario y la Biblioteca visible en el renderer siguió mostrando 2 investigaciones, 2 completadas, 0 incidencias y 0 publicaciones. No quedó visible etapa, código, detalle o acción de recuperación. Por decisión humana, J05 quedó rechazado como bloqueo.

## 5. Causa raíz exacta

La inspección directa de PostgreSQL local demostró que el scaffold **no se perdió ni se revirtió**. La ejecución original de J05 ya había persistido:

- request ID: `cfbec723-ad23-4c46-842d-f81367ebfda2`;
- run ID: `f7cfc76d-3618-4daa-934e-8b24aa14f69d`;
- destination ID canónico: `70000000-0000-4000-8000-000000000003`;
- solicitud: `failed`;
- run: `failed`;
- etapa: `fact_structuring`;
- código: `NO_ACCEPTED_SOURCES`;
- mensaje: `No hay fuentes aceptadas y leídas para estructurar`;
- coste registrado: 0,07 EUR simulados;
- evento durable: `manual.execution.failed`.

La causa del bloqueo visible estaba en la frontera IPC/UI:

1. `ManualResearchService.start` persistía el destino, la solicitud y el run antes de ejecutar proveedores.
2. Persistía el control de resiliencia antes del pipeline.
3. Guardaba el checkpoint `source_reading` antes de entrar en `fact_structuring`.
4. `FactualStructuringError(NO_ACCEPTED_SOURCES)` era capturado por `execute`, que actualizaba solicitud/run a `failed`, guardaba código/mensaje/evento y liberaba el lock.
5. Después de persistir, `execute` relanzaba la excepción técnica.
6. `manual:start` devolvía directamente esa promesa rechazada a Electron.
7. `completeStart` capturaba el rechazo únicamente para mostrar `error.message`; no refrescaba Biblioteca ni abría la incidencia durable.
8. Por ello el renderer conservaba su snapshot anterior de 2 investigaciones aunque PostgreSQL ya contenía 3.

El orden durable previo era correcto; el defecto era que el resultado controlado persistido quedaba oculto y se sustituía visualmente por la excepción IPC cruda. Además faltaba una clasificación de fallo explícita en el run.

## 6. Corrección aplicada exclusivamente para J05

- Se añadió el contrato `ManualResearchExecutionOutcome` con resultados discriminados `completed` o `failed`.
- Los handlers IPC `manual:start` y `manual:retry` usan ahora métodos orientados a interfaz que devuelven la incidencia persistida cuando existe, sin hacer cruzar J05 como excepción técnica cruda.
- `NO_ACCEPTED_SOURCES` conserva su código estable y usa el mensaje controlado: `No hay fuentes aceptadas y leídas para continuar con la estructuración factual.`
- El run y su evento guardan la clasificación durable `data_quality`.
- Biblioteca se refresca también tras una ejecución fallida.
- La fila fallida muestra etapa, código y mensaje.
- La UI abre automáticamente el detalle durable con estado, etapa, código, clasificación, fecha/hora, request ID, run ID y destination ID canónico.
- El detalle ofrece `Reintentar etapa`, compatible con los contratos actuales.
- El reintento usa el mismo resultado controlado, mantiene la solicitud y el destino, crea un nuevo run enlazado y no duplica agregados.
- La migración retrorellena el J05 histórico como `data_quality` y exige clasificación para todo run `failed`.
- La integración geográfica usa ahora una consulta sintética aislada para no borrar ni falsear la corrección humana durable de J03.
- Los relojes de los tests Manual ya no caducan artificialmente al pasar la fecha fija del antiguo fixture.

## 7. Migración local

Archivo:

```text
supabase/migrations/20260723010000_manual_failure_classification.sql
```

La migración:

- añade `failure_classification` a `editorial_research_runs`;
- limita los valores permitidos;
- retrorellena fallos existentes, incluido `NO_ACCEPTED_SOURCES → data_quality`;
- exige clasificación cuando el run está `failed`.

Se aplicó con `supabase migration up --local`. No se ejecutaron `supabase link`, `supabase db push` ni `supabase db reset`. Las dos investigaciones completadas y la incidencia original J05 se conservaron.

Estado local comprobado después de migrar y limpiar únicamente fixtures temporales de integración:

- solicitudes: 3;
- completadas: 2;
- fallidas: 1;
- filas canónicas de Morella para ID `70000000-0000-4000-8000-000000000003`: 1.

## 8. Pruebas y validaciones realizadas

- Pruebas específicas Manual, resiliencia y schema: 22/22 aprobadas.
- Integración Manual Supabase local: 4/4 aprobadas, incluido J05 y su reintento sin duplicados.
- Suite general sin integraciones opt-in: 139 aprobadas y 7 omitidas según diseño.
- Suite completa con integraciones Supabase locales: 146/146 aprobadas.
- Typecheck: aprobado.
- ESLint TypeScript/React con cero warnings: aprobado.
- Build Vite renderer/main/preload: aprobado.
- `supabase db lint --local --level warning`: aprobado, sin errores de schema.
- `git diff --check`: aprobado antes de esta actualización documental y debe repetirse antes del commit.

No se ejecutó `supabase db reset` porque borraría el estado humano existente. No se usaron red de proveedores, IA real, créditos, producción, Trawel ni publicación.

## 9. Estado actual y gate humano

- La corrección técnica de J05 está lista y validada automáticamente.
- J05 **no está aprobado automáticamente**.
- FASE 3J sigue rechazada/bloqueada en J05 hasta nueva decisión humana.
- No se autoriza J06.
- El protocolo fuente continúa en `docs/FASE_3J_ACEPTACION_HUMANA_MANUAL.md`.
- La próxima acción exclusiva es repetir J05 manualmente.

## 10. Arranque local desde PowerShell

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

## 11. Instrucciones exactas para repetir J05

1. Abrir Investighost con el bloque anterior.
2. En Biblioteca comprobar el estado conservado previo a repetir: 3 investigaciones, 2 completadas, 1 incidencia y 0 publicaciones.
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
10. Escenario sintético: `Fuentes insuficientes`.
11. Pulsar `Iniciar investigación Manual`.
12. Comprobar que no aparece `Error invoking remote method 'manual:start'` ni `FactualStructuringError` como resultado final.
13. Comprobar que se abre un detalle durable con:
    - estado `Fallida`;
    - etapa `Hechos` (`fact_structuring`);
    - código `NO_ACCEPTED_SOURCES`;
    - clasificación `Calidad de datos` (`data_quality`);
    - mensaje controlado;
    - request ID;
    - run ID;
    - destination ID `70000000-0000-4000-8000-000000000003`;
    - acción visible `Reintentar etapa`.
14. Volver a Biblioteca y comprobar:
    - 4 investigaciones;
    - 2 completadas;
    - 2 incidencias, contando la evidencia original conservada y la nueva repetición;
    - la nueva fila muestra etapa, código y mensaje;
    - publicaciones continúa en 0.
15. No pulsar J06 ni iniciar otro escenario.
16. Registrar una decisión humana inequívoca sobre J05: `APROBADO` o `RECHAZADO`, con evidencia visible y fecha/hora.

## 12. Restricciones que siguen vigentes

- No avanzar a J06 sin decisión humana expresa sobre la repetición de J05.
- No aprobar J05 por inferencia técnica.
- No declarar FASE 3J aprobada.
- No iniciar FASE 4.
- No implementar Automatic.
- No conectar Trawel o producción.
- No publicar.
- No usar IA real, datos reales o créditos.
- No ejecutar `supabase link`, `supabase db push` ni `supabase db reset` sobre el estado humano conservado.
- No introducir SQLite, Drizzle, Better SQLite, segunda base, file store alternativo ni fallback.
- No borrar las dos investigaciones completadas ni la corrección humana de J03.
- No alterar la identidad canónica de Morella.

# SIGUIENTE ACCIÓN OBLIGATORIA Y EXCLUSIVA

```text
REPETIR J05 — Fuentes insuficientes
```

La aprobación o rechazo de J05 seguirá siendo exclusivamente humano.
