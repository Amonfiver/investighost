# Investighost — punto de reanudación actual

Fecha del punto de reanudación: 2026-07-21 02:54:13 CEST (UTC+02:00)  
Objetivo: reanudar exclusivamente la aceptación humana de FASE 3J desde J01.

Este documento describe el estado canónico al cerrar la sesión. J01 no se ha ejecutado, ningún escenario J01–J17 tiene decisión humana y este cierre no autoriza trabajo posterior a FASE 3J.

## 1. Identificación del proyecto

- Proyecto: Investighost.
- Ruta Windows: `D:\Proyectos\investighost`.
- Ruta WSL equivalente: `/mnt/d/Proyectos/investighost`.
- Rama: `feat/investighost-reinvencion`.
- HEAD funcional previo al commit de este documento: `a1f99d8 fix: alinear formato del proceso main de electron`.
- Commit documental que contiene este punto: `docs: guardar punto de reanudación de fase 3j`.
- Upstream: `origin/feat/investighost-reinvencion`.
- Estado al iniciar el cierre: árbol limpio y upstream sincronizado (`0` commits locales pendientes y `0` remotos pendientes).
- Estado exigido después del cierre: solo este documento versionado, árbol limpio y upstream sincronizado.

Versiones comprobadas:

| Componente | Versión |
|---|---:|
| Node del entorno de desarrollo | `v22.23.1` |
| npm | `11.6.2` |
| Electron | `35.7.5` |
| Node incorporado por Electron | `22.16.0` |
| Supabase CLI | `2.109.1` |
| Docker Server | `29.6.1` |

## 2. Estado general

- FASE 2C-C: completada y cerrada en `996e098`.
- FASE 3A–3I: completadas técnicamente y sincronizadas.
- FASE 3J: preparada; protocolo J01–J17 disponible.
- FASE 3J: todavía no aprobada ni rechazada.
- J01: disponible tras corregir el arranque de Electron, pero no ejecutado.
- FASE 4: no iniciada y no autorizada.
- Automatic: no implementado y bloqueado hasta aceptación humana expresa.
- Producción y Trawel: desconectados.
- Publicación: no implementada en este flujo y nunca automática.

## 3. Commits importantes

| Hash | Mensaje y alcance |
|---|---|
| `996e098` | Cierre de FASE 2C-C; Supabase local/PostgreSQL y Storage local quedan como persistencia única. |
| `f8df50c` | `feat: completar fase 3a y consolidar dominio editorial` |
| `ef6f712` | `feat: completar fase 3b con persistencia editorial local` |
| `6c17f27` | `feat: completar fase 3c con identidad geografica canonica` |
| `bd11e4f` | `feat: completar fase 3d con proveedores de fuentes simulados` |
| `8628a17` | `feat: completar fase 3e con estructuracion factual trazable` |
| `e6ab88e` | `feat: completar fase 3f con perfiles e historial editorial` |
| `effb45f` | `feat: completar fase 3g con revisiator determinista` |
| `ac96b62` | `feat: completar fase 3h con interfaz manual canonica` |
| `4833041` | `feat: completar fase 3i con resiliencia manual` |
| `6716b6f` | `docs: preparar gate humano de fase 3j` |
| `a1f99d8` | `fix: alinear formato del proceso main de electron` |

El commit inmediatamente posterior a `a1f99d8` debe ser el cierre documental `docs: guardar punto de reanudación de fase 3j` que contiene este archivo.

## 4. Arquitectura vigente

- Supabase local/PostgreSQL es la única persistencia durable de datos estructurados.
- Supabase Storage local es el único file store durable. El flujo Manual guarda sus documentos acotados en PostgreSQL y no necesita Storage durante su pipeline; esto no crea un file store alternativo.
- No hay SQLite, Better SQLite, Drizzle, segunda base, fallback silencioso, base temporal paralela ni file store alternativo.
- `EditorialResearchRepository` es el puerto canónico; el adaptador de runtime usa Supabase local. Los repositorios en memoria son solo dobles de tests, nunca fallback.
- Manual está implementado de extremo a extremo sobre un único pipeline canónico.
- Automatic es futuro y deberá reutilizar exactamente el mismo pipeline, entidades, repositorios, validadores y resultados. No existe implementación Automatic actual.
- RevisIAtor es determinista, recomienda o bloquea técnicamente cuando corresponde, pero nunca sustituye la revisión ni la decisión humana.
- No hay publicación automática. Aprobar un borrador local tampoco publica ni lo envía a Trawel.
- Las claves locales permanecen en Electron main; preload y renderer reciben solo una superficie IPC limitada.

## 5. Resultados técnicos acumulados

Estado técnico comprobado al preparar 3J y al corregir Electron:

- Suite general: **137 tests aprobados**; las 6 integraciones opt-in quedan omitidas en esa ejecución general.
- Integraciones Supabase local ejecutadas separadamente: **6 aprobadas**.
- Typecheck: aprobado.
- Lint TypeScript/React: aprobado, cero warnings permitidos.
- Build Vite/renderer/main/preload: aprobado.
- `supabase db reset --local`: aprobado durante FASE 3I; reconstruyó migraciones y seed sintético, incluida `20260721040000_editorial_resilience.sql`.
- `supabase db lint --local --level warning`: aprobado sin errores de schema.
- El cierre documental no volvió a ejecutar tests, reset, migraciones, seed ni lint SQL.

Backups y restauraciones relevantes ya verificados en FASE 2C-C:

- PostgreSQL: dump custom `-Fc` real de 30.046 bytes, SHA-256 verificado y restauración real en contenedor aislado. Se comprobaron tablas, conteos, constraints, FKs, índices, funciones, triggers y RLS; los artefactos temporales se limpiaron.
- El dump PostgreSQL cubría `public`, no toda la plataforma: no incluía Auth, binarios de Storage, Vault, roles globales ni otros schemas gestionados.
- Storage local: PNG sintético de 68 bytes respaldado y restaurado por API en otra ruta; SHA-256, tamaño, MIME, metadatos y privacidad coincidieron, y después se limpió.
- Un `supabase db reset` prueba reconstrucción reproducible, pero no sustituye un backup/restauración real.

Limitaciones conocidas y estado de seguridad:

- La aceptación humana J01–J17 sigue completamente pendiente; la preparación técnica no equivale a aceptación.
- El flujo actual solo usa catálogo local, fixtures y mocks deterministas. No valida todavía un proveedor real de IA ni conectividad externa.
- No se ha auditado ni elegido proveedor real de IA, coste real, política de claves o créditos.
- Electron `35.7.5` resolvió la compatibilidad de Node/WebSocket necesaria para la prueba local, pero esa línea de Electron está fuera de soporte; una actualización de seguridad deberá evaluarse en una tarea futura y separada antes de cualquier uso productivo.
- El último `npm install` informó 23 vulnerabilidades de dependencias: 2 bajas, 4 moderadas, 14 altas y 3 críticas. No se aplicó `npm audit fix` porque queda fuera de este cierre y podría introducir cambios. Deben auditarse antes de producción.
- El arranque dev de `vite-plugin-electron` incluye `--no-sandbox`; solo se acepta aquí para la prueba local con datos sintéticos y no constituye configuración productiva.
- RLS permanece activa y el acceso privilegiado es exclusivamente local/loopback desde main. No hay credenciales productivas en el repositorio ni en el renderer.
- Producción, Trawel, proyectos Supabase remotos, publicación y datos reales permanecen fuera de alcance.

## 6. Corrección de arranque de Electron

Bloqueo corregido en `a1f99d8`:

- Causa raíz: `vite-plugin-electron` infería formato ESM debido a `"type": "module"`. La configuración añadía `formats: ['cjs']`, pero el merge de Vite concatenaba arrays y terminaba generando ES y CJS hacia el mismo nombre. La salida ESM podía sobrescribir `main.cjs` y `preload.js`, dejando imports ESM dentro de archivos cargados como CommonJS.
- Corrección: se desactivó el modo `build.lib` para main y preload; se definieron `rollupOptions.input` y una única salida `format: 'cjs'`, con `main.cjs`, `preload.js` e `inlineDynamicImports`.
- No se cambió el tipo de módulo global del proyecto.
- Electron se actualizó de `33.4.11` a `35.7.5`; su Node incorporado pasó a `22.16.0`, con WebSocket nativo compatible con el cliente local de Supabase.
- Archivos modificados: `vite.config.ts`, `package.json` y `package-lock.json`.
- Verificación del artefacto: main y preload contienen `require("electron")`, no imports/exports ESM de nivel superior.
- Verificación real: `npm run dev` abrió una única ventana titulada `Investighost` en el renderer de `http://localhost:5173`.
- Main, preload, context bridge, IPC y renderer funcionaron. La UI mostró `Supabase local`, el banner `Local · Manual · Simulado` y habilitó `Nueva investigación`.
- No se ejecutó J01 durante esa comprobación.

## 7. Cómo abrir Investighost mañana desde PowerShell

Ejecutar exactamente este bloque en **PowerShell**:

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

Notas operativas:

- No usar `set -a`, `eval` ni `export` en PowerShell.
- Mantener abierta la terminal mientras se usa Investighost.
- Pulsar `Ctrl+C` en esa terminal para detener el entorno.
- No ejecutar el bloque dos veces ni abrir dos instancias de `npm run dev`.
- En la ventana, verificar el indicador `Supabase local`; no continuar si muestra `Local desconectado`.

## 8. Situación de IA

- El flujo sometido a aceptación es **Local · Manual · Simulado**.
- No consume IA real.
- No requiere API key ni créditos.
- Usa mocks y fixtures locales deterministas.
- Todavía no se ha auditado ni elegido un proveedor real.
- No cargar créditos todavía.
- La auditoría de proveedor, coste, privacidad y claves se hará después de las pruebas simuladas o cuando exista una autorización explícita.

## 9. Gate humano actual

- Documento fuente: `docs/FASE_3J_ACEPTACION_HUMANA_MANUAL.md`.
- Escenarios obligatorios: J01–J17.
- Ningún escenario puede aprobarse automáticamente.
- Estado del acta: **sin decisión**.
- FASE 3J: ni aprobada ni rechazada.
- Siguiente escenario exacto: **J01 — Destino válido**.
- No avanzar a J02 sin una decisión humana expresa sobre J01.

## 10. J01 — siguiente paso exacto

No ejecutar hasta que el jefe esté presente y confirme cada resultado visible.

1. Abrir la ventana de Investighost y confirmar `Supabase local`, `Local · Manual · Simulado` y `Publicaciones: 0`.
2. Pulsar `Nueva investigación`.
3. Configurar el destino:
   - Destino: `Morella`.
   - País ISO: `ES`.
   - Tipo: `Localidad`.
4. Pulsar `Resolver destino`.
5. Comprobar antes de ejecutar:
   - Estado resuelto: `Morella`.
   - Jerarquía: `España › Comunitat Valenciana › Morella`.
   - Método: `exact`.
   - Catálogo: `geonames-2026-07-20`.
   - ID externo GeoNames: `3116121`.
6. Mantener ambos perfiles seleccionados: `Aventura` y `Estudiante`.
7. Profundidad: `Estándar`.
8. Presupuesto máximo simulado: `2` EUR.
9. Intentos máximos: `3`.
10. Escenario sintético: `Flujo válido`.
11. Nota opcional: dejarla vacía o escribir `J01 — flujo válido de aceptación humana`.
12. Solo cuando el jefe esté listo, pulsar `Iniciar investigación Manual`.

Resultado visible esperado:

- El pipeline termina sin error y queda esperando revisión humana.
- La identidad Morella/GeoNames y su procedencia permanecen visibles.
- Existen dos borradores diferenciados: Aventura y Estudiante.
- RevisIAtor muestra el resultado técnico, pero no decide por el jefe.
- La investigación aparece en la biblioteca y conserva fuentes, hechos, costes, versiones e historial.
- No se publica nada, no se envía nada a Trawel y `Publicaciones` permanece en `0`.

Registro humano por escenario:

```text
J01 — APROBADO
Resultado visible: [describir evidencia observada]
Observaciones: [ninguna o detalle]
Confirmado por el jefe: [nombre o confirmación escrita]
Fecha/hora: [AAAA-MM-DD HH:MM]
```

```text
J01 — RECHAZADO
Fallo observado: [descripción concreta]
Clasificación: [BLOQUEO o DEFECTO]
Evidencia conservada: [captura, mensaje, request ID si existe]
Confirmado por el jefe: [nombre o confirmación escrita]
Fecha/hora: [AAAA-MM-DD HH:MM]
```

```text
J01 — OBSERVACIÓN
Detalle: [descripción concreta]
Clasificación: [DEFECTO MENOR o MEJORA]
Compromete datos, persistencia o pipeline: [SÍ/NO]
El jefe autoriza continuar: [SÍ/NO]
Fecha/hora: [AAAA-MM-DD HH:MM]
```

Ningún formato produce una decisión por sí solo: el jefe debe confirmarlo expresamente.

## 11. Qué no hacer

- No avanzar a J02 sin decisión humana expresa sobre J01.
- No marcar J01 ni ningún otro escenario como aprobado por inferencia técnica.
- No avanzar a FASE 4.
- No implementar Automatic.
- No conectar producción.
- No conectar Trawel.
- No usar credenciales remotas.
- No ejecutar `supabase link`.
- No ejecutar `supabase db push`.
- No cargar créditos de IA.
- No usar datos reales ni PII.
- No publicar contenido.

## 12. Documentos que debe leer mañana Codex

Leer en este orden antes de actuar:

1. `docs/INVESTIGHOST_REANUDACION_ACTUAL.md`.
2. `docs/FASE_3J_ACEPTACION_HUMANA_MANUAL.md`.
3. `docs/FASE_3_EXECUTION_REPORT.md`.
4. `docs/FASE_3I_RESILIENCIA_COSTES_IDEMPOTENCIA.md`.
5. `docs/INVESTIGHOST_HOJA_DE_RUTA_CANONICA_V3.md`.

## 13. Instrucción de reanudación

# SIGUIENTE ACCIÓN OBLIGATORIA

Abrir Investighost en local, ejecutar J01 con el jefe y esperar una decisión humana expresa antes de continuar.

Hasta entonces, FASE 3J permanece pendiente, Automatic y FASE 4 permanecen bloqueados, y producción/Trawel continúan desconectados.
