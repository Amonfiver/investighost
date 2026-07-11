# BITACORA2.md

## Resumen de BITACORA.md

Investighost nació como app local Electron/React/TypeScript para investigar destinos y preparar contenido para Trawel. Se construyeron una UI de investigación, IPC seguro básico, persistencia temporal en memoria, contratos MVP, un esquema Drizzle no activado, cola editorial en memoria y arquitectura multi-proveedor. Kimi se integró como analista/redactor y Brave como búsqueda de snippets; el flujo mock permanece explícito cuando faltan proveedores. Siguen pendientes persistencia real, revisión/edición, publicación Trawel, cloud/multiusuario y el resto de dominios. La auditoría de 2026-07-11 confirma además lint rojo, ausencia de tests, packaging fallido y arranque dev roto.

---

## Sesión 18 — FASE 0: auditoría completa del estado actual

### Fecha

2026-07-11

### Objetivo

Ejecutar exclusivamente la FASE 0 del prompt maestro: determinar qué existe, funciona, es placeholder, está roto y falta; comparar todo el proyecto con la visión completa y dejar roadmap y brechas, sin modificar funcionalidad.

### Archivos tocados

- `docs/INVESTIGHOST_FULL_AUDIT.md` — creado.
- `docs/INVESTIGHOST_GAP_MATRIX.md` — creado.
- `docs/ROADMAP.md` — creado.
- `docs/BITACORA2.md` — creado por superar `BITACORA.md` las 1000 líneas.

### Comprobaciones

- `npm run lint`: falla con 15 errores de variables no usadas.
- `npx tsc --noEmit`: pasa.
- `npm test`: falla porque no existe script ni suite.
- `npm run build`: TypeScript/Vite pasan; `electron-builder` falla al crear symlinks de winCodeSign en Windows.
- `npm run dev`: Vite/main/preload compilan, pero Electron cae con `app.isPackaged` sobre `app` indefinido.

### Estado final

Auditoría documental completada. No se tocó código, arquitectura, dependencias, `package.json`, migraciones ni datos. El proyecto es un prototipo parcial, no un producto operativo. FASE 0 queda en PAUSA HUMANA 0.

### Problemas

- Arranque dev roto.
- Lint rojo y tests inexistentes.
- Persistencia solo en memoria.
- Packaging no completado.
- La mayoría de dominios del prompt no existe.

### Siguiente paso

Esperar aprobación humana de la auditoría. Después, y solo con aprobación, iniciar FASE 1A de estabilización y contratos; no avanzar automáticamente.

---

## Sesión 19 — FASE 1A: estabilización y contratos de la fundación

### Fecha

2026-07-11

### Objetivo

Estabilizar la base técnica sin añadir funcionalidad de producto: corregir arranque Electron y lint, crear una suite mínima, alinear el contrato mínimo de estados y verificar todos los comandos obligatorios.

### Archivos tocados

- `src/main/index.ts`
- `src/modules/publishing/index.ts`
- `src/services/ai/providers.ts`
- `src/services/ai/research.ts`
- `src/utils/validation.ts`
- `scripts/dev.mjs`
- `tests/validation.test.ts`
- `tests/helpers.test.ts`
- `vitest.config.ts`
- `package.json` y `package-lock.json`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONES.md`
- `docs/ROADMAP.md`
- `docs/BITACORA2.md`

### Fallos reproducidos y causas

- Lint: 15 parámetros/destructuraciones no usados en placeholders.
- Tests: faltaban script, runner y archivos de prueba.
- Dev: `ELECTRON_RUN_AS_NODE=1` heredado hacía que Electron se ejecutara como Node y no expusiera `app`.
- Packaging: Windows impide crear los symlinks incluidos en `winCodeSign`.

### Cambios

- Import nombrado del API Electron.
- Lanzador que limpia `ELECTRON_RUN_AS_NODE` solo para el hijo de Vite.
- Parámetros placeholder marcados con `void` e iteración de proveedores simplificada, sin desactivar ESLint.
- Scripts `typecheck` y `test`, Vitest 2 y configuración aislada.
- 21 tests para entrada, estados y utilidades.
- `ResearchStatusSchema` alineado con la unión TypeScript actual.
- Sin cambios en aislamiento Electron, producto, APIs externas ni persistencia.

### Verificación

- `npm run lint`: pasa, 0 errores.
- `npm run typecheck`: pasa.
- `npm test`: pasan 2 archivos y 21 tests.
- `npm run dev`: pasa; npm y Electron seguían vivos tras 12 segundos, sin stderr. Se detuvieron deliberadamente tras verificar.
- `npm run build`: TypeScript y Vite pasan; `electron-builder` falla por privilegios de symlinks al extraer `winCodeSign`.

### Riesgos pendientes

- Packaging Windows aún no genera instalador en este entorno.
- `npm install` reporta 27 vulnerabilidades transitivas: 2 low, 9 moderate, 14 high y 2 critical. Requieren auditoría específica, no `audit fix --force` automático.
- La suite mínima no cubre IPC, main, proveedores ni E2E.
- Persistencia sigue en memoria y los contratos completos quedan para FASE 1B.

### Estado final

FASE 1A completada dentro de alcance. Arranque dev, lint, typecheck y tests quedan verdes. Build compilado; packaging bloqueado por el entorno Windows y documentado.

### Siguiente paso

PAUSA HUMANA. Tras aprobación, ejecutar únicamente FASE 1B — contratos y arquitectura canónica; no iniciar migraciones, Supabase ni dominios nuevos.

---

## Sesión 20 — FASE 1B: contratos y arquitectura canónica

### Fecha y objetivo

2026-07-11. Cerrar dominios, estados, roles, fronteras, seguridad y handoff Trawel antes de persistencia real.

### Archivos tocados

- Nuevos: `src/shared/contracts.ts`, `tests/contracts.test.ts`, `DOMAIN_MODEL.md`, `LOCAL_CLOUD_DATA_BOUNDARIES.md`, `ROLES_AND_PERMISSIONS.md`, `STATE_MACHINES.md`, `TRAWEL_HANDOFF_CONTRACT.md`, `SECURITY_AND_PRIVACY.md` y `ACCEPTANCE_TESTS.md`.
- Actualizados: `src/shared/types.ts`, `src/utils/validation.ts`, `src/services/db/schema.ts`, `tests/validation.test.ts`, `SPEC.md`, `ARCHITECTURE.md`, `DECISIONES.md`, `ROADMAP.md` y `BITACORA2.md`.

### Cambios

- 29 entidades con contratos Zod, ownership, sensibilidad, retención y ubicación.
- Estados independientes, RBAC de ocho roles y permisos atómicos.
- Frontera SQLite/Supabase/Trawel y datos exclusivamente internos.
- Handoff Trawel 1.0 con draft obligatorio, resolución de IDs, idempotencia, deduplicación y errores parciales.
- Invariantes de aprobación editorial/legal, anuncios y URLs HTTPS.
- Sustituido el estado heredado `unpublished` por `failed`, `paused`, `archived`.

### Alcance respetado

Sin Supabase/Auth, migraciones, datos reales, APIs nuevas, lógica CRM/campañas/anuncios/analytics ni publicación Trawel.

### Verificación

- `npm run lint`: pasa.
- `npm run typecheck`: pasa.
- `npm test`: pasan 3 archivos y 39 tests.
- `npm run build:vite`: pasa; renderer, main y preload compilados. No se ejecutó empaquetado, según alcance.

### Siguiente paso

PAUSA HUMANA 1: decidir Supabase, usuarios/roles, correo/remitente, política legal/retención, analytics y cifrado local. Solo después autorizar FASE 2.
