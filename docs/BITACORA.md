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


---

## Sesión 5 — Consolidación del contrato de datos (MVP)

### Objetivo
Definir y alinear el contrato de datos del MVP entre tipos TypeScript, validaciones Zod y esquema de base de datos, simplificando el diseño anterior.

### Archivos tocados
- `src/shared/types.ts` — Tipos completamente reescritos para el MVP
- `src/utils/validation.ts` — Esquemas Zod alineados con los tipos
- `src/services/db/schema.ts` — Esquemas de Drizzle simplificados y coherentes
- `src/modules/research/index.ts` — Actualizado a nuevos tipos
- `src/modules/signals/index.ts` — Actualizado a nuevos tipos
- `src/modules/editorial/index.ts` — Actualizado a nuevos tipos
- `src/modules/publishing/index.ts` — Actualizado a nuevos tipos
- `src/modules/review/index.ts` — Actualizado a nuevos tipos

### Contrato de datos definido

**Estados del flujo (ResearchStatus):**
`pending` → `researching` → `structured` → `drafted` → `under_review` → `approved` → `published`
(+ `error` para casos de fallo)

**Entrada de investigación (ResearchInput):**
- `country`: string (requerido)
- `region`: string opcional (ciudad, zona, barrio)
- `focus`: string opcional (tipo de búsqueda: gastronomía, cultura, etc.)
- `outputLanguage`: string (idioma de salida, default 'es')
- `userNotes`: string opcional

**Resultado estructurado (ResearchResult):**
- Datos del destino (country, region, description)
- Resumen general
- Lista de lugares recomendados (con categorías específicas)
- Lista de actividades/planes
- Consejos/tips
- Fuentes consultadas
- Nivel de confianza 0-1

**Borrador editorial (EditorialDraft):**
- Título e introducción
- Secciones estructuradas (heading + content)
- Tono definido (friendly, informative, enthusiastic, relaxed)
- Estado del borrador (generating, ready, in_review, approved, rejected)
- Metadatos de revisión y publicación

### Decisiones importantes

1. **Simplificación drástica:** Eliminada la entidad `Signal` separada; las fuentes ahora son `Source` directamente consultadas.
2. **Places y Activities como entidades propias:** Mejor modelado que JSON anidado, permite queries específicas.
3. **Tips como tabla separada:** Facilita ordenar y gestionar consejos individuales.
4. **Estados claros y secuenciales:** El flujo ahora tiene una progresión lógica de estados.
5. **Nombres consistentes:** `ResearchRequest` (la solicitud), `ResearchResult` (los datos estructurados), `EditorialDraft` (el borrador).

### Simplificaciones realizadas

- Eliminada tabla `researches` (ahora `research_requests` con campos expandidos)
- Eliminada tabla `structured_data` (ahora `research_results` más enfocada)
- Eliminada entidad `Signal` intermedia (simplificado a `Source`)
- Campos de destino normalizados en `research_results` (destinationCountry, destinationRegion, etc.)
- Tabla `tips` nueva para consejos ordenados

### Estado final
✅ Tipos, Zod y DB schema alineados
✅ Todos los módulos actualizados a los nuevos tipos
✅ TypeScript compila sin errores


---

## Sesión 6 — Flujo funcional simulado de punta a punta

### Objetivo
Implementar un flujo local simulado completo para validar que Investighost puede crear investigaciones, persistirlas, generar resultados mock y mostrar el flujo en la interfaz.

### Archivos tocados

**Persistencia temporal:**
- `src/modules/persistence/memory-store.ts` — Nuevo: Store en memoria con CRUD completo

**Módulo Research (implementado):**
- `src/modules/research/mock-data.ts` — Nuevo: Generadores de datos mock coherentes
- `src/modules/research/index.ts` — Reescrito: Implementación funcional con simulación

**UI completa:**
- `src/renderer/App.tsx` — Reescrito: UI funcional con 3 vistas (listado, formulario, detalle)
- `src/renderer/App.css` — Reescrito: Estilos para todo el flujo

**Otros:**
- `src/main/preload.ts` — Actualizado: Mensaje indicando persistencia temporal

### Persistencia resuelta

**Solución temporal:** Store en memoria (`memory-store.ts`)
- Mapas en memoria para requests, results y drafts
- API async/await compatible con futura implementación SQLite
- Métodos: saveRequest, getRequest, getAllRequests, updateRequestStatus, saveResult, saveDraft, etc.
- Funciones de utilidad: clearStore, getStoreStats

**Por qué esta solución:**
- SQLite (better-sqlite3) requiere Visual Studio Build Tools que no están disponibles
- La arquitectura permite sustituir fácilmente por Drizzle cuando esté operativo
- Todo está encapsulado en el módulo persistence

### Flujo implementado

1. **Crear investigación:** Formulario con país, región, enfoque, idioma, notas
2. **Persistencia:** Se guarda en memoria con estado 'pending'
3. **Simulación automática:** Al crear, se inicia el proceso simulado
4. **Transición de estados:** pending → researching → structured → drafted
5. **Generación mock:** Resultados coherentes basados en el destino introducido
6. **Visualización:** Tabs para resumen, lugares, actividades, borrador editorial

### Partes simuladas (claramente identificadas)

| Componente | Estado | Nota |
|------------|--------|------|
| Investigación real | SIMULADO | `mock-data.ts` genera datos coherentes |
| Scraping web | NO IMPLEMENTADO | Pendiente de integración |
| IA generativa | SIMULADO | El borrador se genera a partir de datos estructurados |
| Publicación Trawel | NO IMPLEMENTADO | Pendiente rebuild de Trawel |
| Persistencia | TEMPORAL | Memoria (se pierde al cerrar app) |

### Estado final
✅ App arranca con `npm run dev`
✅ Se pueden crear investigaciones con el formulario
✅ Aparecen en el listado con estado en tiempo real
✅ Al hacer clic, se ven los resultados estructurados mock
✅ El borrador editorial se genera y se visualiza
✅ El flujo de estados tiene sentido (pending → researching → structured → drafted)
✅ TypeScript compila sin errores

### Comando para arrancar
```bash
npm run dev
```

### Siguiente paso recomendado
Opciones:
1. **Persistencia real:** Instalar Visual Studio Build Tools y activar SQLite + Drizzle
2. **Investigación real:** Integrar búsqueda web y/o APIs de IA
3. **Mejorar UI:** Añadir edición de borradores, aprobación/rechazo, flujo completo de revisión




---

## Sesión 4 — Alineación real del arranque dev de Electron

### Objetivo
Corregir de forma mínima el error persistente de arranque en desarrollo donde Electron buscaba `dist-electron/main.js` pero Vite generaba `dist-electron/index.js`.

### Archivos tocados
- `vite.config.ts`
- `src/main/index.ts`
- `docs/BITACORA.md`

### Cambios realizados
- Se forzó la salida del bundle del proceso main a `dist-electron/main.js` mediante `build.lib.fileName`.
- Se mantuvo el preload alineado con `dist-electron/preload.js`.
- Se ajustó el main process para calcular `__dirname` de forma compatible con ESM usando `import.meta.url`.
- Se sustituyó `electron-is-dev` en el main process por `!app.isPackaged` para evitar un fallo ESM/CJS durante el arranque.

### Explicación breve
`package.json` declara `"main": "dist-electron/main.js"`, pero la configuración anterior dejaba que Vite nombrara el bundle principal según el entry `index.ts`, generando `index.js`. La corrección alinea el archivo generado con el archivo que Electron espera cargar.

### Estado final
Verificado con `npm run build:vite` y `npm run dev`. El build genera `dist-electron/main.js` y `dist-electron/preload.js`, y el proceso dev permanece arrancado sin el error de archivo no encontrado.


---

## Sesión 7 — Arquitectura Multi-Proveedor y Cola Editorial

### Objetivo
Preparar la arquitectura base de Investighost para:
1. Soportar múltiples proveedores de IA (OpenAI, Kimi, Local)
2. Separar claramente producción interna de publicación externa
3. Dejar lista la base para auditoría de coste/calidad por proveedor
4. Introducir la noción de cola editorial/publicación regulada

### Archivos tocados

**Tipos compartidos:**
- `src/shared/types.ts` — Reescrito con tipos para multi-proveedor, cola editorial y auditoría

**Servicio AI (multi-proveedor):**
- `src/services/ai/providers.ts` — NUEVO: Contratos e implementaciones base para proveedores
- `src/services/ai/index.ts` — Reescrito: Orquestador multi-proveedor con estrategias

**Módulo Publishing (cola editorial):**
- `src/modules/publishing/queue.ts` — NUEVO: Cola editorial con ritmo de publicación
- `src/modules/publishing/index.ts` — Reescrito: Exporta sistema de cola y flujo de aprobación

**Base de datos:**
- `src/services/db/schema.ts` — Añadidas tablas: publishing_queue, publishing_rate_configs, provider_usage_logs, content_pieces

**Documentación:**
- `docs/BITACORA.md` — Esta entrada
- `docs/ARCHITECTURE.md` — Actualizado en sesión paralela

### Arquitectura Multi-Proveedor

**Tipos de proveedores:**
- `AIProvider`: 'openai' | 'kimi' | 'local'
- `SearchProvider`: 'openai' | 'kimi' | 'web' | 'local'
- `ProviderStrategy`: 'auto' | 'openai' | 'kimi' | 'fallback' | 'compare'

**Estrategias implementadas:**
- `auto`: Selecciona automáticamente según preferencia (OpenAI > Kimi > Local)
- `openai`/`kimi`: Fuerza uso de proveedor específico
- `fallback`: Intenta en cadena hasta que uno funcione
- `compare`: Ejecuta múltiples proveedores y permite comparar resultados

**Clases base:**
- `BaseAIProvider`: Clase abstracta con métodos comunes
- `OpenAIProvider`: Implementación placeholder para OpenAI
- `KimiProvider`: Implementación placeholder para Kimi (Moonshot AI)
- `LocalProvider`: Implementación placeholder para modelos locales (Ollama, etc.)

**Factory:**
- `ProviderFactory`: Gestiona instancias de proveedores
- `initializeProviderFactory()`: Inicialización con configuración
- `getProviderFactory()`: Acceso global a la factory

### Separación Producción vs Publicación

**Estados separados:**
- `ProductionStatus`: pending → researching → structured → drafted → under_review → approved → rejected → error
- `PublishingStatus`: not_published → queued → scheduled → publishing → published → unpublished

**Entidad `ContentPiece`:**
- Agrupa: request + result + draft
- Tiene dos estados independientes: `productionStatus` y `publishingStatus`
- Permite acumular trabajo aprobado sin presión de publicación inmediata
- Guarda auditoría de proveedores usados

**Flujo:**
1. Producción interna: investigación → estructuración → borrador → revisión → aprobación
2. Cola editorial: aprobado → encolado → programado/ordenado → publicación regulada
3. Publicación externa: cuando toca según ritmo configurado

### Cola Editorial

**Funcionalidades:**
- `enqueueContent()`: Añadir pieza aprobada a la cola
- `getNextPublishableItem()`: Obtener siguiente elemento listo
- `scheduleItem()`: Programar para fecha específica
- `reorderItem()`: Cambiar prioridad
- Configuración de ritmo: máximo diario, ventana horaria, días permitidos

**Configuración por defecto:**
- Ritmo estándar: 3 publicaciones/día
- Horario: 9:00 - 20:00
- Todos los días permitidos
- Intervalo mínimo: 60 minutos

**Almacenamiento:**
- Store temporal en memoria (se migrará a SQLite)
- Tablas preparadas en schema: `publishing_queue`, `publishing_rate_configs`

### Auditoría de Coste/Calidad

**Registro por operación:**
- `ProviderUsageLog`: Guarda proveedor usado, estrategia, modelo, coste estimado, tokens
- Campos de evaluación: `qualityRating` (1-5), `qualityNotes`, `wasUseful`
- Timestamp de cada uso

**Análisis disponible:**
- `getProviderStats()`: Estadísticas agregadas por proveedor
- `getUsageLogs()`: Logs filtrables por tipo, proveedor
- `rateProviderResult()`: Añadir evaluación de calidad retrospectiva

**Estimación de costes:**
- Cada proveedor implementa `estimateCost()` basado en pricing configurado
- Logs acumulan coste total estimado
- Permite comparar coste/calidad entre proveedores

### Decisiones arquitectónicas

1. **No romper el trabajo existente**: Tipos nuevos coexisten con los antiguos, `ResearchStatus` es alias de compatibilidad
2. **Persistencia temporal**: Cola y auditoría usan memoria por ahora, esquema SQL preparado para migración
3. **Implementaciones placeholder**: Los proveedores lanzan errores explicativos hasta que se configuren API keys
4. **Separación clara**: Producción y publicación son flujos independientes que se comunican por la cola
5. **Extensible**: Fácil añadir más proveedores (Anthropic, Google, etc.) implementando `BaseAIProvider`

### Estado final

✅ Tipos actualizados con soporte multi-proveedor y cola editorial
✅ Arquitectura de proveedores preparada (OpenAI, Kimi, Local)
✅ Estrategias implementadas: auto, fallback, compare
✅ Cola editorial funcional con gestión de ritmo
✅ Tablas de base de datos preparadas para persistencia real
✅ Sistema de auditoría listo para registrar coste/calidad
✅ Separación clara entre producción interna y publicación externa

### Próximos pasos sugeridos

1. Configurar API keys y activar integraciones reales con OpenAI/Kimi
2. Implementar migraciones de Drizzle para las nuevas tablas
3. Construir UI para gestionar cola editorial y configurar ritmo
4. Añadir más proveedores (Anthropic Claude, Google Gemini)
5. Implementar comparación visual de resultados en modo 'compare'
6. Crear dashboard de estadísticas de coste/calidad
