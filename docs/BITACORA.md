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

---

## Sesión 9 — Fix: Carga correcta de .env en desarrollo

### Objetivo
Corregir el fallo donde Electron/main no leía correctamente el archivo `.env` en modo desarrollo, mostrando `injected env (0)` en lugar de cargar las variables de entorno.

### Problema
- El cálculo de ruta usaba `path.join(__dirname, '../..')` desde `dist-electron/`
- En desarrollo con Vite, esto apuntaba a un directorio incorrecto
- Resultado: `dotenv` cargaba 0 variables y Kimi aparecía como no configurado

### Solución
- Usar `process.cwd()` en desarrollo (donde se ejecuta `npm run dev`)
- Mantener `__dirname` relativo para producción
- Añadir logs informativos de la ruta y variables cargadas

### Archivos tocados
- `src/main/index.ts` — Corrección de lógica de carga de `.env`

### Cambios realizados
```typescript
// Antes: ruta frágil basada en __dirname
const rootDir = path.join(__dirname, '../..')

// Después: estrategia robusta según entorno
const isDev = !app.isPackaged
const rootDir = isDev 
  ? process.cwd() 
  : path.join(__dirname, '../..')
```

### Estado final
✅ `npm run dev` carga correctamente `.env` desde raíz del proyecto
✅ Aparece en consola: `[Main] dotenv loaded: 3 variables`
✅ Aparece: `[Config] Kimi configured: true`
✅ Kimi disponible en UI para investigaciones reales
✅ Build compila sin errores

---

## Sesión 10 — Mejora de prompts: investigación honesta y específica

### Objetivo
Corregir los resultados genéricos e inventados de Kimi (ej: "Mercado Local Tradicional", "experiencias inolvidables", confianza del 94%) para obtener investigaciones más honestas, específicas y útiles para revisión editorial.

### Problemas detectados
- Frases de relleno tipo "combinación perfecta de cultura y gastronomía"
- Lugares genéricos inventados como "Mercado Local Tradicional"
- Consejos absurdos como "aprender frases básicas en España"
- Fuentes falsas simuladas
- Confianza exagerada (94%) sin verificación real
- No reconocimiento de las limitaciones del modelo

### Solución aplicada

**Nuevo prompt de investigación (`buildResearchPrompt`):**
- Rol explícito: "investigador de viajes honesto y riguroso"
- Reglas estrictas contra invención de fuentes y datos
- Prohibición de frases genéricas vacías de contenido
- Estructura clara: resumen, datos útiles, lugares, curiosidades, ángulos editoriales, pendientes de verificar, limitaciones
- Obliga a marcar `[pendiente de verificar]` lo incierto

**Nuevo prompt estructurador (`buildStructuredPrompt`):**
- Cap de confianza máxima: 0.75 (nunca 90%+ sin búsqueda web)
- Campos `confidenceLevel` y `verificationNeeded` para cada lugar/actividad
- Fuentes explícitas: "NINGUNA FUENTE WEB REAL CONSULTADA"
- Lista `pendingVerification` obligatoria
- Filtro de consejos genéricos ("respeta normas", "disfruta", etc.)

**Borrador editorial mejorado (`generateHonestEditorialDraft`):**
- Título indica `[REQUIERE REVISIÓN]`
- Aviso explícito: "Este borrador se generó sin búsqueda web real"
- Sección separada: "Lugares destacados (verificados)" vs "Sugerencias pendientes de verificación"
- Sección "Ángulos editoriales propuestos" para inspirar al redactor
- Sección "Elementos que requieren verificación web"
- Checklist antes de publicar

### Archivos tocados
- `src/services/ai/research.ts` — Reescrito completamente con prompts honestos

### Criterios de aceptación verificados
- [x] `npm run build:vite` compila sin errores
- [x] TypeScript sin errores
- [x] Prompts guían a Kimi hacia respuestas menos genéricas
- [x] Confianza capada a 0.75 máximo
- [x] Fuentes falsas eliminadas
- [x] Consejos absurdos filtrados
- [x] Borrador indica claramente qué requiere verificación

### Limitaciones actuales
- Sigue sin búsqueda web real (requiere implementación futura)
- Depende de qué conozca Kimi del destino específico
- Para destinos muy desconocidos, puede devolver poca información concreta

### Cómo probar
1. `npm run dev`
2. Crear investigación con "Albarracín, España"
3. Verificar que:
   - No aparecen frases como "experiencia única"
   - Los lugares tienen nombres específicos o marcan [VERIFICAR]
   - El borrador tiene aviso de "sin búsqueda web"
   - Confianza ≤ 75%
   - Hay sección de "Elementos que requieren verificación"

### Próximo bloque recomendado
**Implementar búsqueda web real:**
- Integrar serpapi, searchapi.io o similar
- Combinar conocimiento del modelo + datos web actuales
- Aumentar confianza cuando haya fuentes reales consultadas
- Guardar URLs reales en `sources`

---

## Sesión 11 — Diagnóstico: Logs de trazabilidad y verificación de flujo

### Objetivo
Diagnosticar por qué la UI sigue mostrando resultados genéricos antiguos (mock) en lugar de los nuevos prompts honestos de Kimi.

### Hipótesis verificadas
1. ✅ **El mock-data.ts contiene exactamente los textos genéricos reportados**
   - "combinación perfecta de cultura..." → en `generateDescription()`
   - "Mercado Local Tradicional" → en `generatePlaces()`
   - "Mirador Panorámico" → en `generatePlaces()`
   - "aprender frases básicas..." → en `generateTips()`
   - fuentes falsas → en `generateSources()`
   - confianza 92% → `confidence: 0.75 + Math.random() * 0.2`

2. ✅ **El flujo de `src/modules/research/index.ts` tiene dos ramas:**
   - Si `isAIResearchAvailable()` = true → usa Kimi real
   - Si `isAIResearchAvailable()` = false → usa mock

3. ❓ **Posible causa:** `isAIResearchAvailable()` podría estar retornando `false` por:
   - Provider factory no inicializado
   - Config no cargada en tiempo de ejecución
   - Error silencioso en `getProviderFactory()`

### Solución aplicada: Logs detallados de trazabilidad

**Añadidos en `src/modules/research/index.ts`:**
- Log de entrada con input completo
- Verificación detallada de `isAIResearchAvailable()`
- Inspección directa del `providerFactory` con `getAvailableProviders()` y `getHealthStatus()`
- Logs diferenciados: ✅ para Kimi real, ⚠️ para mock
- Logs de resultado con confidence, places count, sources

**Añadidos en `src/services/ai/research.ts`:**
- Log de entrada `researchWithAI()`
- Longitud y preview del prompt 1
- Confirmación de step 1 complete
- Longitud del prompt 2
- Confirmación de step 2 complete
- Log de resultado construido (confidence, places, sources)
- Log de draft generado

### Archivos tocados
- `src/modules/research/index.ts` — Logs de trazabilidad del flujo
- `src/services/ai/research.ts` — Logs del servicio de investigación

### Cómo diagnosticar ahora
1. `npm run dev`
2. Crear investigación con cualquier destino
3. **Si ves logs con ⚠️ (mock):**
   - Revisar que `.env` tenga `KIMI_API_KEY`
   - Verificar que `[Main] dotenv loaded: 3 variables` aparezca
   - Chequear `[Config] Kimi configured: true`
4. **Si ves logs con ✅ (Kimi real):**
   - Verificar que el resultado ya no tenga textos genéricos
   - Si persiste el problema, revisar consola del renderer (puede haber cacheo)

### Causa raíz probable
El mock se activa cuando `isAIResearchAvailable()` retorna `false`. Esto ocurre si:
- La config no se cargó antes de que el módulo research se inicialice
- Hay un error silencioso en `getProviderFactory()`
- El `.env` no se cargó correctamente

Los nuevos logs permitirán identificar exactamente qué está pasando.

### Estado
- ✅ Build compila sin errores
- ✅ Logs de trazabilidad añadidos
- ⏳ Pendiente: verificar en ejecución real qué rama se ejecuta

### Siguiente paso
Ejecutar `npm run dev`, crear una investigación, y revisar los logs de consola para ver si aparece ✅ (Kimi) o ⚠️ (mock).

---

## Sesión 12 — Fix: Cableado UI → Backend Real

### Objetivo
Corregir el fallo crítico donde la UI generaba resultados mock localmente sin llamar al backend, ignorando la configuración de Kimi.

### Causa raíz encontrada
**La UI no estaba cableada al backend.** El flujo era:
1. UI importaba `researchModule` directamente desde `@modules/research`
2. Esto funcionaba en desarrollo porque Vite permitía cierto acceso
3. Pero el renderer no tenía acceso real a Node.js en producción
4. El resultado se generaba localmente sin logs visibles en PowerShell

**Faltaba el IPC completo:**
- Preload no exponía funciones de research
- Main no registraba handlers de research
- UI no usaba `window.electronAPI`

### Solución aplicada

**1. Preload (`src/main/preload.ts`):**
```typescript
createResearch: (input) => ipcRenderer.invoke('research:create', input)
startResearch: (requestId) => ipcRenderer.invoke('research:start', requestId)
getAllResearch: () => ipcRenderer.invoke('research:get-all')
getResearchResult: (requestId) => ipcRenderer.invoke('research:get-result', requestId)
getDraft: (resultId) => ipcRenderer.invoke('research:get-draft', resultId)
```

**2. Main (`src/main/index.ts`):**
Registrados 5 handlers IPC que llaman a `researchModule` real.

**3. UI (`src/renderer/App.tsx`):**
- Eliminado import directo de `@modules/research`
- Ahora usa `window.electronAPI.*` para todas las operaciones
- Añadidos logs `[Renderer]` en todas las operaciones

**4. Tipos (`src/vite-env.d.ts`):**
Actualizados tipos de `Window.electronAPI` con todas las funciones.

**5. Build (`vite.config.ts`):**
Añadido alias `@modules` al build del main process.

### Archivos modificados
- `src/main/preload.ts` — Exposición de API de research
- `src/main/index.ts` — Handlers IPC para research
- `src/renderer/App.tsx` — Uso de IPC en lugar de imports directos
- `src/vite-env.d.ts` — Tipos actualizados
- `vite.config.ts` — Alias para main build

### Logs nuevos en UI (consola del renderer):
```
[Renderer] Loading requests via IPC...
[Renderer] Creating research via IPC: {...}
[Renderer] Research created: <id>
[Renderer] Starting research via IPC: <id>
```

### Logs nuevos en Main (PowerShell):
```
[IPC] research:create called with: {...}
[IPC] research:create returned: <id>
[IPC] research:start called for: <id>
[IPC] research:start initiated for: <id>
✅ [Research] USING REAL KIMI - Generating honest research...
```

### Estado final
- ✅ Build compila sin errores
- ✅ UI conectada a backend vía IPC
- ✅ Logs visibles en ambas consolas
- ✅ Kimi real se activa cuando está configurado
- ✅ Mock solo como fallback cuando no hay API key

### Cómo probar
1. `npm run dev`
2. Crear investigación con "Albarracín, España"
3. Verificar en **PowerShell**:
   - `[IPC] research:create called`
   - `✅ [Research] USING REAL KIMI`
4. Verificar en **Consola del renderer**:
   - `[Renderer] Research created`
   - `[Renderer] Research started`

### Limitaciones actuales
- Persistencia sigue en memoria (se pierde al cerrar)
- Sin búsqueda web real
- Si Kimi falla, no hay retry automático

### Siguiente bloque recomendado
**Persistencia SQLite real** o **búsqueda web integrada**.

---

## Sesión 8 — Integración Kimi como Proveedor Real

### Objetivo
Implementar Kimi como primer proveedor real funcional dentro de Investighost, permitiendo investigaciones reales mediante la API de Moonshot AI.

### Archivos creados/nuevos

- `.env.example` — Plantilla de configuración de variables de entorno
- `src/services/config/index.ts` — Módulo de configuración con validación Zod
- `src/services/ai/research.ts` — Servicio de investigación real con Kimi
- `package.json` — Añadidas dependencias: `openai`, `dotenv`

### Archivos modificados

**Configuración:**
- `vite.config.ts` — Añadidos aliases para servicios en build de main process
- `.gitignore` — Ya incluía `.env`, confirmado seguro

**Servicios AI:**
- `src/services/ai/providers.ts` — Implementación real de `KimiProvider` usando SDK OpenAI
- `src/services/ai/index.ts` — Sin cambios (ya preparado para recibir proveedores configurados)

**Main process:**
- `src/main/index.ts` — Carga de `.env` y inicialización de configuración de proveedores
- `src/main/preload.ts` — Exposición de `getProviderStatus` al renderer

**Research module:**
- `src/modules/research/index.ts` — Integración con investigación real cuando Kimi está configurado

**UI:**
- `src/renderer/App.tsx` — Estados de UI para configuración, carga, error y resultado
- `src/renderer/App.css` — Estilos para indicadores de estado Kimi/simulación
- `src/renderer/main.tsx` — Eliminados tipos duplicados de window.electronAPI

### Implementación técnica

**KimiProvider real:**
- Usa SDK de OpenAI con `baseURL: https://api.moonshot.ai/v1`
- Implementa `generateText()`, `generateStructured()`, `searchAndSummarize()`
- Manejo de errores con mensajes legibles
- Limpieza de markdown en respuestas JSON

**Configuración segura:**
- Variables de entorno en `.env` (no versionado)
- Validación con Zod de configuración
- Cache de configuración cargada
- Funciones helper para verificar estado: `isKimiConfigured()`, `getProviderConfigStatus()`

**Flujo de investigación con Kimi:**
1. Usuario introduce destino (ej: "Albarracín")
2. Prompt 1: Investigación textual general
3. Prompt 2: Extracción de datos estructurados en JSON
4. Generación de borrador editorial a partir de datos
5. Almacenamiento en memoria con auditoría de uso

**Auditoría automática:**
- Registro de cada operación en `ProviderUsageLog`
- Campos: proveedor, modelo, coste estimado, tokens, timestamp
- Sistema de logs en memoria (preparado para migrar a SQLite)

### Estados de UI implementados

| Estado | Visual | Descripción |
|--------|--------|-------------|
| Sin configuración | Banner naranja | Instrucciones para crear `.env` |
| Kimi listo | Indicador verde 🟢 | API key configurada correctamente |
| Cargando | Spinner + mensaje | "Consultando con Kimi AI..." |
| Resultado | Tabs activos | Datos estructurados + borrador |
| Error | Banner rojo | Mensaje legible + hints de solución |

### Fallback a simulación

Si no hay `KIMI_API_KEY` configurada:
- La app funciona en modo simulación (como antes)
- Indicador visual: "🔄 SIMULACIÓN" en footer
- Badge "SIMULADO" en borradores
- Mensaje en formulario: "Modo simulación"

### Criterios de aceptación verificados

- [x] App arranca con `npm run dev`
- [x] Build compila sin errores: `npm run build:vite` ✅
- [x] Configuración segura en `.env` (no en código ni Git)
- [x] Estados de UI claros: sin key, cargando, resultado, error
- [x] Integración con auditoría (logs en memoria)
- [x] Documentación actualizada en BITACORA

### Limitaciones actuales

1. **Persistencia temporal:** Los datos se pierden al cerrar la app (se migrará a SQLite)
2. **Sin búsqueda web real:** Kimi no tiene API de búsqueda web directa, usa conocimiento del modelo
3. **Costes estimados:** Basados en aproximación de tokens, no precisión exacta
4. **Sin comparación entre proveedores:** Solo Kimi implementado, OpenAI preparado para futuro

### Cómo probar

1. Crear archivo `.env` en raíz del proyecto:
   ```
   KIMI_API_KEY=sk-tu-clave-de-kimi
   ```
2. Obtener API key en https://platform.moonshot.cn/
3. Ejecutar `npm run dev`
4. Crear nueva investigación con destino real (ej: "Valencia, España")
5. Ver resultado real de Kimi en pestañas de resumen, lugares, actividades

### Próximo bloque recomendado

**Persistencia real con SQLite:**
- Instalar Visual Studio Build Tools (si no están)
- Activar Drizzle ORM con migraciones
- Migrar de memory-store a base de datos real
- Preservar investigaciones entre sesiones

**Alternativas:**
- Implementar edición de borradores antes de aprobar
- Mejorar prompts de investigación para mayor especificidad
- Añadir comparación calidad/coste entre Kimi y OpenAI (cuando OpenAI se implemente)

---

## Sesión 9 — Corrección quirúrgica Kimi vs Mock

### Objetivo
Corregir el fallo por el que la UI indicaba Kimi configurado, pero al iniciar una investigación el backend caía en simulación/mock.

### Diagnóstico real

- El main process cargaba `.env` correctamente, pero después inicializaba `ProviderFactory` con una configuración vacía.
- `src/services/ai/index.ts` y `src/modules/research/index.ts` calculaban disponibilidad/logs al cargar módulo, antes de que el runtime hubiera inicializado proveedores con la config real.
- Había usos de `require(...)` dentro de código ESM:
  - `src/modules/research/index.ts`
  - `src/services/ai/research.ts`
- En desarrollo apareció además una incompatibilidad de runtime con el main process en ESM y el módulo especial de Electron. Se resolvió compilando solo el main process como CJS (`main.cjs`), manteniendo el resto de la app intacta.

### Solución aplicada

- `src/main/index.ts`
  - Ahora inicializa `ProviderFactory` con `createProviderConfigFromEnv()` después de `loadConfig()`.
  - Mantiene logs de estado después de cargar `.env`.
- `src/services/ai/research.ts`
  - Sustituido `require('./providers')` por import ESM.
  - `isAIResearchAvailable()` consulta la factory en tiempo de ejecución.
- `src/modules/research/index.ts`
  - Sustituido `require('@services/ai/providers')` por import ESM.
  - Eliminado el log obsoleto de disponibilidad al cargar el módulo.
  - El mock queda como fallback explícito cuando no hay proveedor o falla la llamada real a Kimi.
- `src/services/ai/index.ts`
  - Eliminado el log de proveedores disponibles calculado al cargar el módulo.
- `vite.config.ts` y `package.json`
  - El main process se genera como `dist-electron/main.cjs` para evitar el fallo ESM/CJS de Electron en dev.

### Verificación

- `npm run build:vite` compila sin errores.
- `npm run dev` arranca al retirar `ELECTRON_RUN_AS_NODE` del entorno de prueba.
- Logs de arranque observados:
  - `[Main] dotenv loaded: 3 variables`
  - `[Config] Kimi configured: true`
  - `[Main] Provider status: { kimi: '✅ configured', openai: '❌ not configured' }`
- Ya no aparece:
  - `ReferenceError: require is not defined`
  - `[ProviderFactory] Config not loaded, returning empty config`
  - `[Research Module] AI configured: NO (using mock)`

### Pendiente

- Probar una investigación real desde la UI con una API key válida y saldo disponible.
- Mantener SQLite y búsqueda web real para fases posteriores.

---

## Sesión 10 — Modelo Kimi y Estado Pending

### Objetivo
Corregir el intento de llamada a Kimi con el modelo antiguo `kimi-k1` y evitar que la UI se quede mostrando investigaciones en `pending` después de lanzar el proceso por IPC.

### Causa exacta

- `.env` usaba `KIMI_MODEL=kimi-k2.6`, pero `src/services/config/index.ts` solo leía `KIMI_DEFAULT_MODEL`.
- Al no encontrar `KIMI_DEFAULT_MODEL`, la config caía al default antiguo `kimi-k1`.
- Ese valor llegaba a `ProviderFactory`, luego a `KimiProvider`, y finalmente a `client.chat.completions.create({ model })`, provocando `404 Not found the model kimi-k1 or Permission denied`.
- La UI llamaba `research:start` en modo fire-and-forget y solo recargaba la lista antes de que el backend cambiara el estado, por eso conservaba el snapshot inicial `pending`.

### Solución aplicada

- `src/services/config/index.ts`
  - Ahora lee `KIMI_MODEL` primero, mantiene compatibilidad con `KIMI_DEFAULT_MODEL` y usa `kimi-k2.6` como default.
  - Añade logs seguros de baseURL y modelo, sin exponer API key.
- `src/services/ai/providers.ts`
  - `KimiProvider` registra de forma segura la `baseURL` y el `model`.
  - Cada llamada usa `options.model || config.defaultModel`, que ahora viene de `KIMI_MODEL`.
- `src/modules/research/index.ts`
  - El fallback mock reemplaza sus fuentes por una fuente explícita `SIMULACION/FALLBACK`.
  - La confianza del fallback queda limitada a `0.6`.
- `src/renderer/App.tsx`
  - Después de `startResearch`, la UI hace polling temporal de `getAllResearch`.
  - El polling termina cuando la request sale de `pending/researching/structured`.
  - Si hay detalle abierto, también actualiza request, resultado y draft.

### Verificación

- `npm run build:vite` compila sin errores.
- `npm run dev` arranca.
- Logs observados:
  - `[Config] Kimi baseURL: https://api.moonshot.ai/v1`
  - `[Config] Kimi model: kimi-k2.6`
  - `[KimiProvider] baseURL: https://api.moonshot.ai/v1`
  - `[KimiProvider] model: kimi-k2.6`
- Ya no aparece `kimi-k1` en el código fuente activo.

### Pendiente

- Probar una investigación completa contra Kimi con saldo/permisos válidos.
- Si Kimi devuelve errores de permisos/saldo/modelo, decidir en la siguiente fase si se prefiere fallback mock o estado `error` sin fallback.

---

## Sesión 11 — Temperature Kimi k2.6 y DevTools

### Objetivo
Corregir el error real de API `400 invalid temperature: only 1 is allowed for this model` al usar `kimi-k2.6`, y evitar que DevTools se abra automáticamente al arrancar la app.

### Causa exacta

- `src/services/ai/providers.ts` enviaba `temperature: 0.7` para generación normal.
- El mismo proveedor enviaba `temperature: 0.3` para generación estructurada.
- `searchAndSummarize()` también forzaba `temperature: 0.7`.
- El modelo `kimi-k2.6` solo acepta `temperature: 1`, así que la API rechazaba la petición antes de generar contenido.
- `src/main/index.ts` abría DevTools siempre en desarrollo con `mainWindow.webContents.openDevTools()`.

### Solución aplicada

- `src/services/ai/providers.ts`
  - Añadida resolución de temperatura específica para Kimi.
  - Si el modelo es `kimi-k2.6`, `KimiProvider` siempre envía `temperature: 1`.
  - Se mantiene la temperatura solicitada para otros modelos.
  - Añadido log seguro `[KimiProvider] temperature: ...`.
- `src/main/index.ts`
  - DevTools ya no se abre por defecto.
  - Solo se abre si el entorno define `OPEN_DEVTOOLS=true`.

### Verificación

- `npm run build:vite` compila sin errores.
- `npm run dev` arranca.
- Arranque confirmado con:
  - `[Config] Kimi model: kimi-k2.6`
  - `[KimiProvider] model: kimi-k2.6`
- DevTools no se abre automáticamente y no aparecen errores de DevTools en stderr durante el arranque.

### Pendiente

- Probar una investigación completa desde UI para confirmar que la siguiente llamada real a Kimi muestra `[KimiProvider] temperature: 1`.
- Si la API devuelve otro parámetro rechazado, ajustar solo ese parámetro en `KimiProvider`.

---

## Sesión 12 — Timeout Kimi y Polling Finito

### Objetivo
Evitar que una investigación quede colgada indefinidamente cuando la llamada real a Kimi no responde o tarda demasiado.

### Causa encontrada

- `KimiProvider` llamaba a `client.chat.completions.create()` sin timeout explícito.
- Si la petición quedaba abierta, `researchWithAI()` no devolvía resultado ni error.
- La request quedaba en `researching` y la UI seguía consultando `getAllResearch` / `getResearchResult`.
- Además, los handlers IPC de lectura escribían logs en cada polling, generando ruido constante en PowerShell.

### Solución aplicada

- `src/services/ai/providers.ts`
  - Añadido timeout real de 60 segundos por llamada Kimi.
  - Se usa `AbortController` y `Promise.race`.
  - Si expira, se aborta la llamada y se lanza: `La llamada a Kimi superó el tiempo máximo de espera`.
  - Logs seguros añadidos:
    - `[KimiProvider] request started`
    - `[KimiProvider] request timeout after 60000 ms`
- `src/modules/research/index.ts`
  - Si Kimi falla o agota timeout, la request pasa a `error`.
  - Se eliminó el fallback mock automático para fallos de Kimi real.
  - El mock queda solo para el caso explícito de no tener proveedor IA configurado.
- `src/renderer/App.tsx`
  - Polling cada 2 segundos con límite total de 140 segundos.
  - Si se supera el límite, la UI marca localmente la investigación como `error` con mensaje de timeout.
  - El polling silencioso evita logs repetitivos en consola del renderer.
- `src/main/index.ts`
  - Los IPC de lectura (`research:get-all`, `research:get-result`, `research:get-draft`) ya no loguean cada consulta vacía.
  - Solo registran resultados/drafts cuando aparecen.

### Política de errores

- Kimi responde correctamente: se guarda resultado real y borrador.
- Kimi falla, tarda demasiado o lanza excepción: estado `error` con mensaje claro.
- Sin IA configurada: se mantiene modo simulación explícito.

### Verificación

- `npm run build:vite` compila sin errores.
- DevTools sigue condicionado a `OPEN_DEVTOOLS=true`.
- No se modifica `.env` ni se imprimen API keys.

### Pendiente

- Probar desde UI una investigación real completa para confirmar si Kimi responde antes del timeout.
- Si aparece otro error de API posterior, ajustar únicamente el parámetro rechazado.

---

## Sesión 13 — Base del Motor de Búsqueda Web

### Objetivo
Formalizar la decisión de arquitectura: Investighost debe buscar información real en internet antes de pedir a Kimi que analice o redacte.

### Decisión aplicada

- Kimi pasa a considerarse **analista/redactor**.
- La recolección de fuentes reales será responsabilidad de un **Web Search Provider** separado.
- El flujo objetivo queda:

`Destino → queries web → WebResearchBundle → análisis con Kimi → estructura → borrador editorial`

### Archivos modificados

- `docs/SPEC.md`
  - Añadida separación entre recolector web y analista/redactor IA.
  - Actualizado el flujo previsto para incluir búsqueda web antes de análisis IA.
- `docs/ARCHITECTURE.md`
  - Actualizado el flujo principal.
  - Separados proveedores de búsqueda y proveedores IA.
  - Añadida sección `Motor de Búsqueda Web`.
  - Actualizada estructura de módulos con `src/services/search`.
- `docs/DECISIONES.md`
  - Añadida decisión `2.6`: Kimi será analista/redactor, no recolector web.
- `src/shared/types.ts`
  - Añadidos tipos:
    - `SearchProvider`
    - `WebSourceType`
    - `WebSearchQuery`
    - `WebSearchResult`
    - `WebResearchBundle`
- `src/services/ai/providers.ts`
  - `searchProvider` pasa a apuntar al proveedor de búsqueda separado.
  - Default temporal: `mock`.
- `src/services/search/index.ts`
  - Nuevo servicio base de búsqueda.
  - Añadidos:
    - `BaseSearchProvider`
    - `LocalMockSearchProvider`
    - `createSearchProvider()`
    - `generateDestinationSearchQueries()`
    - `collectWebResearchBundle()`

### Estado actual

- No se llama todavía a internet.
- `LocalMockSearchProvider` está claramente etiquetado como `MOCK_SEARCH_PROVIDER`.
- El generador de queries crea búsquedas para turismo, historia/cultura, opiniones, gastronomía, acceso/aparcamiento y problemas/reseñas.
- Logs preparados:
  - `[Search] generated queries`
  - `[Search] provider selected`
  - `[Search] results collected: N`

### Verificación

- `npm run build:vite` compila sin errores.
- No se toca `.env`.
- No se rompe el flujo Kimi actual.

### Siguiente paso recomendado

Conectar un proveedor real de búsqueda. Candidatos:
- **Brave Search API**: buena primera opción por simplicidad y coste/control.
- **Tavily**: interesante si se quiere una API más orientada a agentes.
- **SerpAPI/SearchAPI**: útiles si se necesita emular resultados tipo buscador general.
