# BITACORA.md

## Sesión 1 — Arranque documental de Investighost

### Objetivo
Iniciar el proyecto Investighost con una base documental sólida siguiendo un enfoque SDD, dejando claras la visión, la arquitectura inicial y las decisiones estratégicas del proyecto antes de comenzar la implementación.

### Archivos tocados
- `README.md`
- `docs/SPEC.md`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONES.md`
- `docs/BITACORA.md`

### Cambios realizados
- Se creó la base documental inicial del proyecto.
- Se definió la visión funcional de Investighost como trabajador personal de investigación para alimentar Trawel.
- Se documentó la arquitectura inicial orientada a herramienta local/de escritorio.
- Se cerraron decisiones estratégicas sobre:
  - enfoque híbrido de contenido,
  - revisión humana,
  - stack técnico,
  - metodología de trabajo con Cline,
  - persistencia y documentación viva,
  - integración futura con Trawel rehecho por el propio equipo.
- Se inicializó el repositorio Git local y se subió a GitHub.

### Decisiones importantes fijadas
- Investighost comenzará como herramienta local/de escritorio.
- Stack cerrado inicial:
  - Electron
  - React
  - TypeScript
  - Vite
  - SQLite
  - Drizzle ORM
  - Zod
- Trawel será rehecho por el propio equipo y la integración futura será nativa.
- El flujo central será:
  - investigar,
  - revisar,
  - publicar.
- El desarrollo seguirá un enfoque SDD con bloques pequeños y auditables.
- Cline implementará la app por fases, leyendo primero la documentación viva.

### Estado final
Proyecto documentalmente preparado para comenzar la implementación del esqueleto técnico.

### Problemas detectados
- Se detectaron problemas iniciales al configurar Git y el remoto `origin`, ya resueltos.
- Todavía no existe estructura técnica del proyecto ni app ejecutable.


---

## Sesión 2 — Esqueleto inicial de Investighost

### Objetivo
Crear el esqueleto técnico inicial de Investighost como aplicación de escritorio local, preparando la base para desarrollo futuro sin implementar lógica de negocio real.

### Archivos tocados

**Configuración base:**
- `package.json` — Dependencias Electron + React + TypeScript + Vite + SQLite + Drizzle + Zod
- `tsconfig.json` — Configuración TypeScript con paths
- `tsconfig.node.json` — Configuración para scripts de build
- `vite.config.ts` — Configuración Vite con plugin Electron
- `.eslintrc.cjs` — Configuración ESLint
- `.gitignore` — Exclusiones completas (node_modules, builds, DBs, logs, env)
- `index.html` — Entry point HTML
- `drizzle.config.ts` — Configuración Drizzle ORM

**Proceso Electron:**
- `src/main/index.ts` — Main process, gestión de ventana, IPC handlers
- `src/main/preload.ts` — Preload script, API segura expuesta al renderer

**Renderer (React):**
- `src/renderer/main.tsx` — Entry point React
- `src/renderer/App.tsx` — Componente principal con UI de estado del sistema
- `src/renderer/App.css` — Estilos minimalistas oscuros

**Shared:**
- `src/shared/constants.ts` — Constantes de la aplicación
- `src/shared/types.ts` — Tipos TypeScript base
- `src/vite-env.d.ts` — Tipos para Vite

**Utilidades:**
- `src/utils/helpers.ts` — Funciones auxiliares
- `src/utils/validation.ts` — Esquemas Zod para validación

**Módulos (placeholders):**
- `src/modules/research/index.ts`
- `src/modules/signals/index.ts`
- `src/modules/editorial/index.ts`
- `src/modules/review/index.ts`
- `src/modules/publishing/index.ts`
- `src/modules/persistence/index.ts`

**Servicios (placeholders):**
- `src/services/ai/index.ts`
- `src/services/web/index.ts`
- `src/services/trawel/index.ts`
- `src/services/db/index.ts`
- `src/services/db/schema.ts` — Esquemas Drizzle completos preparados

**Directorios:**
- `database/.gitkeep`
- `drizzle/migrations/.gitkeep`

### Cambios realizados

1. **Stack completo inicializado:** Electron + React + TypeScript + Vite funcionando
2. **Estructura de carpetas:** Según especificación en DECISIONES.md
3. **UI mínima funcional:** Pantalla de estado del sistema con:
   - Título y subtítulo de Investighost
   - Indicadores de estado (UI cargada, entorno, persistencia, módulos)
   - Lista de próximos módulos (research, signals, editorial, review, publishing)
   - Footer con stack técnico
4. **SQLite + Drizzle preparados:** Esquemas completos definidos, sin activar (requiere build tools nativas)
5. **Zod configurado:** Esquemas de validación base listos
6. **Todos los módulos como placeholders:** Interfaces definidas, implementación pendiente
7. **Build funcional:** `npm run build:vite` compila sin errores

### Decisiones importantes fijadas

- No se implementó lógica de negocio real (research, scraping, IA) — siguiendo instrucciones
- SQLite desactivado temporalmente: better-sqlite3 requiere Visual Studio Build Tools en Windows
- Los servicios AI, Web y Trawel son placeholders — se activarán en bloques futuros
- Código limpio con cabeceras documentales en cada archivo
- TypeScript estricto habilitado

### Estado final

✅ Proyecto arrancable localmente con `npm run dev`
✅ Build de producción funcional
✅ TypeScript compila sin errores
✅ Estructura lista para crecer iterativamente

### Problemas detectados / Limitaciones

1. **SQLite no activo:** better-sqlite3 requiere "Visual Studio Build Tools" con workload "Desktop development with C++" en Windows. Esto es esperado en fase de esqueleto.

2. **Dependencia opcional de Rollup:** Hubo que instalar manualmente `@rollup/rollup-win32-x64-msvc` por bug conocido de npm con dependencias opcionales.

3. **Drizzle config:** La configuración está lista pero las migraciones no se han ejecutado (depende de punto 1).

### Siguiente paso recomendado

Opciones para siguiente bloque:
1. **Instalar build tools nativas** y activar SQLite + Drizzle completamente
2. **Implementar módulo Research** con lógica básica de input/estructuración
3. **Configurar integración AI** (requiere API keys)
4. **Añadir tests unitarios** base


---

## Sesión 3 — Corrección arranque desarrollo

### Objetivo
Corregir el arranque en modo desarrollo que fallaba porque Electron intentaba cargar archivos que aún no existían.

### Problema
- El script `dev` usaba `npm-run-all --parallel` que no funciona bien con `vite-plugin-electron`
- El preload script no se compilaba porque faltaba en la configuración
- Electron intentaba leer `dist-electron/main.js` antes de que Vite lo generara

### Archivos tocados
- `package.json` — Simplificado script `dev` a solo `vite`
- `vite.config.ts` — Configurado array de entradas: main + preload

### Solución
`vite-plugin-electron` gestiona automáticamente el ciclo de vida: compila main y preload, luego inicia Electron cuando están listos. No hace falta paralelización manual.

### Estado final
✅ `npm run dev` inicia Vite + Electron correctamente
✅ Preload script se compila y carga en el renderer
✅ Hot reload funcional

### Siguiente paso
Activar SQLite instalando build tools nativas, o comenzar implementación de módulo Research con persistencia en memoria temporal.
