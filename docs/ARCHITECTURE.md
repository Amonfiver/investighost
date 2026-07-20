# ARCHITECTURE.md — Investighost

## 1. Propósito
Este documento define la arquitectura de Investighost, el agente personal de investigación diseñado para recopilar, estructurar y preparar contenido útil que luego podrá revisarse y publicarse en Trawel.

La arquitectura está pensada para:
- evitar prompts genéricos,
- apoyarse en investigación real,
- producir salidas estructuradas y editoriales,
- mantener contexto y trazabilidad,
- facilitar una futura integración con Trawel,
- y soportar múltiples proveedores de IA con publicación regulada.

---

## 2. Principios de arquitectura

### 2.1. Investigación antes que redacción
Investighost no debe generar contenido directamente a partir de una petición vacía.  
Primero debe investigar, recopilar señales y estructurar información.  
Después debe redactar.

### 2.2. Separación entre datos y texto
La salida del sistema debe estar dividida en:
- una capa estructurada reutilizable,
- una capa editorial orientada a publicación.

Esto evita depender solo de texto libre y permite reutilizar la información en Trawel.

### 2.3. Revisión humana obligatoria
La publicación no será automática en la primera fase.  
Todo contenido generado por Investighost debe pasar por revisión manual del usuario.

### 2.4. Persistencia de contexto
Investighost debe conservar memoria operativa:
- resultados de investigación,
- estados de revisión,
- borradores generados,
- cola editorial,
- auditoría de proveedores,
- y documentación viva del proyecto.

### 2.5. Escalabilidad por módulos
La arquitectura debe ser modular para permitir crecer poco a poco sin rehacer el sistema completo.

### 2.6. Separación producción vs publicación (NUEVO)
Investighost acumula trabajo internamente sin presión de publicación inmediata.  
La publicación hacia Trawel es un proceso separado y regulado.

---

## 3. Visión general del flujo

### Flujo principal
1. El usuario indica un destino.
2. Investighost interpreta la petición.
3. El sistema genera queries de investigación web.
4. Un proveedor de búsqueda recopila fuentes, snippets y señales reales.
5. El sistema organiza ese material en un `WebResearchBundle`.
6. Kimi u otro proveedor IA analiza el bundle recopilado.
7. El sistema transforma lo investigado en datos estructurados.
8. El sistema genera un borrador editorial (usando proveedor IA configurado).
9. El usuario revisa el resultado.
10. El usuario aprueba (el contenido va a cola editorial).
11. El sistema publica según ritmo configurado (ej: 3 piezas/día).
12. El sistema registra auditoría de proveedores y costes.

---

## 4. Módulos principales

### 4.1. Input Interpreter
#### Función
Interpretar la petición inicial del usuario y convertirla en un input claro y normalizado para el sistema.

#### Responsabilidades
- recibir país, ciudad, zona o barrio,
- detectar parámetros opcionales,
- validar que la petición tenga suficiente contexto,
- construir una petición estructurada interna.

#### Ejemplo de entrada humana
- "Italia > Roma > Trastevere"
- "Japón > Tokio > viaje de 3 días"
- "México > CDMX > viaje en pareja"

#### Ejemplo de salida interna
```json
{
  "country": "Italia",
  "city": "Roma",
  "zone": "Trastevere",
  "traveler_profile": null,
  "trip_duration_days": null,
  "research_mode": "general"
}
```

---

## 5. Arquitectura Multi-Proveedor (Sesión 7+)

### Visión
Investighost debe separar proveedores de búsqueda y proveedores de IA.

Los proveedores de búsqueda recolectan material real de internet. Los proveedores de IA, como Kimi, actúan como analistas/redactores sobre ese material.

Investighost debe poder trabajar con múltiples proveedores de IA para:
- Elegir el más adecuado según coste/disponibilidad
- Usar fallback si uno falla o no tiene saldo
- Comparar coste/calidad entre proveedores
- Analizar bundles de investigación web y redactar borradores

### Proveedores soportados
- **OpenAI**: GPT-4o, GPT-4o-mini (chat + estructurado, futuro fallback)
- **Kimi**: Moonshot AI (analista/redactor principal)
- **Local**: Ollama, LM Studio (chat + estructurado, sin búsqueda)

### Proveedores de búsqueda previstos
- **mock**: proveedor temporal local, no llama a internet.
- **SerpAPI/SearchAPI**: candidatos para resultados de buscador general.
- **Brave Search API**: candidato sencillo para búsqueda web.
- **Tavily**: candidato orientado a extracción/resumen para agentes.

### Estrategias de uso
- `auto`: Selección automática según preferencia y disponibilidad
- `openai`/`kimi`: Fuerza uso de proveedor específico
- `fallback`: Intenta en cadena (OpenAI → Kimi → Local)
- `compare`: Ejecuta múltiples y permite comparar resultados

### Contrato común
Todos los proveedores implementan `AIProviderContract`:
- `generateText()`: Generación de texto libre
- `generateStructured()`: Generación con salida JSON
- `searchAndSummarize()`: compatibilidad heredada; no sustituye al motor de búsqueda web real
- `estimateCost()`: Estimación de coste en USD

### Arquitectura de clases
```
BaseAIProvider (abstracta)
├── OpenAIProvider
├── KimiProvider
└── LocalProvider

ProviderFactory → Gestiona instancias
```

---

## 5.1. Motor de Búsqueda Web

### Responsabilidad
El motor de búsqueda web es el primer paso real de una investigación. Su objetivo no es redactar, sino recolectar material verificable:
- queries generadas desde el destino,
- resultados con URL, título y snippet,
- clasificación aproximada de fuente,
- puntuación inicial de fiabilidad,
- fecha de captura,
- proveedor usado.

### Contrato base
Los proveedores de búsqueda implementan `BaseSearchProvider` y devuelven `WebSearchResult[]`.

El resultado agregado se guarda como `WebResearchBundle`, que después será la entrada natural para Kimi u otro proveedor IA.

### Estado actual
Existen dos proveedores:
- `LocalMockSearchProvider`, etiquetado como `MOCK_SEARCH_PROVIDER`, para desarrollar el pipeline sin llamar a APIs externas.
- `BraveSearchProvider`, primer proveedor real, usando Brave Search API para obtener títulos, URLs y snippets.

La recolección web todavía no está conectada al flujo principal de creación de investigación; queda preparada para el siguiente bloque.

---

## 6. Separación Producción vs Publicación

### Concepto central
Investighost acumula trabajo internamente sin presión de publicación inmediata. La publicación hacia Trawel es un proceso separado y regulado.

### Estados separados

**Producción interna (`ProductionStatus`):**
```
pending → researching → structured → drafted → under_review → approved
                                                                     ↓
                                                                  rejected
                                                                     ↓
                                                                   error
```

**Publicación externa (`PublishingStatus`):**
```
not_published → queued → scheduled → publishing → published
                                              ↓
                                          unpublished
```

### Entidad ContentPiece
Agrupa todo el trabajo de una investigación:
- Referencias a: request, result, draft
- `productionStatus`: dónde está en el flujo interno
- `publishingStatus`: dónde está en el flujo externo
- `providerLogs`: auditoría de proveedores usados

### Flujo completo
1. **Producción**: El usuario investiga, revisa y aprueba contenido
2. **Encolado**: El contenido aprobado entra en la cola editorial
3. **Regulación**: La cola controla el ritmo de salida (ej: 3 piezas/día)
4. **Publicación**: Cuando toca, se publica en Trawel

---

## 7. Cola Editorial (Publishing Queue)

### Propósito
Regular la salida de contenido hacia Trawel para mantener un ritmo constante en lugar de publicar todo de golpe.

### Funcionalidades
- **Encolar**: Añadir contenido aprobado a la cola
- **Priorizar**: Asignar prioridad 1-10 a cada pieza
- **Programar**: Fecha específica de publicación
- **Reordenar**: Cambiar prioridades según necesidad editorial
- **Ritmo configurable**: Máximo diario, ventana horaria, días permitidos

### Configuración de ritmo (`PublishingRateConfig`)
- `maxDailyPosts`: Límite de publicaciones por día (ej: 3, 5)
- `preferredHoursStart/End`: Ventana horaria preferida
- `allowedDays`: Días de la semana permitidos
- `minIntervalMinutes`: Intervalo mínimo entre publicaciones

### Algoritmo de selección
1. Primero los programados para ya (`scheduled` + fecha pasada)
2. Luego por prioridad (mayor primero)
3. Luego por orden de llegada (FIFO)

---

## 8. Auditoría de Coste/Calidad

### Registro por operación (`ProviderUsageLog`)
Cada uso de proveedor guarda:
- `operationType`: research, draft_generation, text_improvement, search
- `strategy`: auto, fallback, compare, etc.
- `aiProvider` + `aiModel`: qué se usó
- `aiCostEstimated`: coste estimado en USD
- `tokensInput/Output`: consumo de tokens
- `qualityRating` (1-5): evaluación del usuario
- `wasUseful`: si el resultado fue útil

### Análisis disponible
- Estadísticas por proveedor: operaciones, coste total, calidad media
- Logs filtrables por tipo de operación, proveedor, fecha
- Comparación coste/calidad para optimizar estrategias

### Casos de uso
- "¿Me sale más rentable OpenAI o Kimi para investigación?"
- "¿Qué modelo da mejor calidad para borradores?"
- "¿Cuánto he gastado este mes en IA?"

---

## 9. Estructura de módulos actualizada

```
src/
├── modules/
│   ├── research/        # Investigación y estructuración
│   ├── editorial/       # Generación de borradores
│   ├── review/          # Revisión humana
│   └── publishing/      # Cola editorial + publicación Trawel
│       ├── index.ts     # API pública del módulo
│       └── queue.ts     # Gestión de cola editorial
├── services/
│   ├── ai/              # Servicios de IA
│   │   ├── index.ts     # Orquestador multi-proveedor
│   │   └── providers.ts # Implementaciones de proveedores
│   ├── search/          # Motor de búsqueda web por proveedores
│   ├── web/             # Fetch/extracción futura de páginas
│   ├── db/              # Persistencia
│   │   └── schema.ts    # Esquemas incluyendo cola y auditoría
│   └── trawel/          # Integración futura con Trawel
└── shared/
    └── types.ts         # Tipos incluyendo multi-proveedor y cola
```

---

## 10. Fundación técnica estabilizada (FASE 1A)

### Arranque de desarrollo

El proceso main se mantiene compilado como CommonJS y usa imports nombrados de Electron. `npm run dev` pasa por `scripts/dev.mjs`, un lanzador mínimo que elimina `ELECTRON_RUN_AS_NODE` únicamente del entorno hijo antes de iniciar Vite.

Si esa variable heredada vale `1`, Electron se comporta como Node y no expone `app`, `BrowserWindow` ni `ipcMain`. El lanzador no modifica el entorno global ni cambia las garantías del renderer: continúan `contextIsolation: true`, `nodeIntegration: false` y `sandbox: true`.

### Verificación automatizada mínima

- Vitest usa `vitest.config.ts`, separado de la configuración Electron.
- La suite cubre el contrato Zod de entrada, los estados actuales de producción/publicación y utilidades compartidas.
- Los comandos canónicos son `npm run lint`, `npm run typecheck` y `npm test`.

`npm run build` compila los tres bundles. En el entorno Windows auditado, el empaquetado posterior sigue bloqueado porque `electron-builder` no puede extraer `winCodeSign` sin privilegio para crear enlaces simbólicos.

---

## 11. Arquitectura canónica (FASE 1B)

```text
Electron renderer → preload/IPC Zod → proceso principal/repositorios
  → Supabase local (PostgreSQL/Auth/RLS/Storage; persistencia única del MVP)
  → futuro Supabase compartido Trawel+Investighost, solo tras aprobación humana
  → Edge Function privilegiada → adaptador/payload Zod → tablas Trawel (draft/review)
```

`src/shared/contracts.ts` es la fuente ejecutable para entidades, enums e invariantes. Drizzle y Supabase no se modificarán hasta FASE 2 y aprobación de migraciones.

Producción agrupa Request/Run/Source/Result/Draft/Revision/ContentPiece. Publicación comienza después de aprobación mediante QueueItem/Attempt. Moderación, CRM, campañas, anuncios y analytics comparten identidad, RBAC y AuditLog, pero no mezclan sus estados con el flujo editorial.

---

## 12. Actualización de persistencia de FASE 2A — sustituida

La decisión V2 definió la siguiente topología, hoy histórica por FASE 2C-A:

```text
Electron → repositorios → SQLite (cache/offline/outbox)
                       ↔ Supabase compartido Trawel+Investighost
                          ├─ tablas/vistas públicas: contenido autorizado
                          └─ esquema privado: operación Investighost + Auth/RLS/auditoría
```

- Producción tiene una sola base Supabase, no una base Investighost y otra Trawel.
- Desarrollo usa otro proyecto Supabase, con el esquema relevante y datos ficticios, nunca PII copiada.
- “Publicar hacia Trawel” significa validar y cambiar/escribir de forma controlada en las tablas compartidas; no transferir entre dos bases productivas.
- SQLite no era autoritativo y excluía secretos y PII por defecto.
- La arquitectura detallada, RLS, Storage y sync están en `PERSISTENCE_ARCHITECTURE.md`, `RLS_AND_AUTH_PLAN.md`, `STORAGE_PLAN.md` y `SQLITE_SYNC_STRATEGY.md`.
- FASE 2A es exclusivamente diseño: no hay proyecto, conexión, SQL ejecutado ni escritura productiva.

## 13. Arquitectura vinculante de persistencia — FASE 2C-A

Desde 2026-07-12, Supabase local es el entorno principal de desarrollo y la única persistencia del MVP. PostgreSQL contiene datos, colas, jobs, auditoría e idempotencia; Supabase Storage local contiene archivos. Las migraciones SQL versionadas reproducen el entorno.

```text
Electron → IPC/contratos → repositorios PostgreSQL → Supabase local
                                                ├─ base privada + proyección Trawel
                                                └─ Storage local
```

- SQLite no forma parte del MVP: no hay fallback, caché, outbox ni modo offline.
- La implementación SQLite de FASE 2B fue retirada completamente en FASE 2C-C. SQLite solo permanece en referencias históricas explícitas.
- Se reutilizan validación, SHA-256, idempotencia, reintentos, aislamiento por registro y borrado condicionado a verificación.
- El Supabase real de Trawel continúa desconectado. Cualquier conexión o escritura requiere una autorización humana explícita distinta.
- `INVESTIGHOST_DECISION_SUPABASE_UNICO.md` y `PERSISTENCE_ARCHITECTURE.md` sustituyen el diseño operativo de `SQLITE_SYNC_STRATEGY.md`, conservado solo como histórico.

## 14. Un solo pipeline: Manual y Automatic

El flujo descrito en “Visión general” es el pipeline canónico por destino. **Manual** lo invoca una vez. **Automatic**, cuando sus gates futuros estén cerrados, resolverá un alcance territorial y lo invocará repetidamente como orquestador; no tendrá módulos paralelos de investigación, prompts, contratos, validadores, persistencia, calidad ni publicación.

```text
Manual ───────────────┐
                     ├→ ResearchDestination → fuentes → estructura → perfiles editoriales
Automatic/campaña ───┘                         → calidad → Supabase local → revisión humana
                                                                    ↓ aprobado
                                         TrawelMapper → contrato → cola → aprobación → Trawel
```

El nombre `ResearchDestination` es conceptual hasta consolidar el contrato ejecutable. Aventura y Estudiante son perfiles del mismo resultado canónico y deben demostrar diferenciación, cobertura y fuentes. Automatic persistirá progreso por objetivo, permitirá pausa/reanudación, retry e idempotencia y comenzará secuencialmente; la concurrencia llegará solo tras estabilidad.

Las campañas de investigación no son campañas de correo. Comparten identidad, RBAC y `AuditLog`, pero no contenido, estados, tablas ni reglas legales de envío. Automatic queda bloqueado hasta terminar 2C, aceptar el Manual extremo a extremo y consolidar calidad, trazabilidad y recuperación. Véase `INVESTIGHOST_PARCHE_ARQUITECTONICO_MODO_AUTOMATIC.md`.

## 15. Cierre técnico de FASE 2C-C

Supabase local/PostgreSQL es la única persistencia durable del MVP y Supabase Storage local es el único file store operativo. No existe SQLite, Drizzle, base alternativa, fallback, caché durable, outbox durable ni modo offline. Si Supabase local no está disponible, el runtime devuelve un error controlado y no inicializa otra persistencia.

Los stores actuales de investigación, cola editorial, mocks y logs/caché de configuración basados en `Map` o variables de proceso son memoria volátil: se pierden al cerrar la aplicación y no constituyen persistencia durable. Su migración corresponde a fases futuras.

La recuperación quedó verificada por mecanismos separados: PostgreSQL mediante dump custom `-Fc` y restauración real en CHECKPOINT 5; objetos Storage mediante backup/restauración por API en CHECKPOINT 7. `supabase db reset`, aprobado de nuevo en la auditoría del CHECKPOINT 8, demuestra reconstrucción por migración y seed, pero no sustituye ningún backup.

Manual y Automatic siguen siendo futuros. Ambos compartirán el pipeline canónico descrito en la sección 14; FASE 2C-C no implementó ninguno ni conectó Trawel o producción.

## 16. Dominio editorial cerrado en FASE 3A

`src/shared/editorial-contracts.ts` define el contrato neutral `ResearchDestination`: entrada idempotente, identidad geográfica versionada y un resultado con ejecuciones, fuentes, hechos, lugares, actividades, perfiles editoriales, calidad, costes y eventos.

```text
consulta → destino canónico → solicitud/ejecución → fuentes → hechos
  → lugares/actividades → Aventura + Estudiante → RevisIAtor → revisión humana
```

La trazabilidad ejecutable es `EditorialSection → ResearchFact → ResearchSource`. FASE 3B materializó las relaciones importantes con FKs y tablas puente en Supabase local; JSONB se reserva para snapshots/opciones/metadatos controlados. El repositorio neutral dispone de adaptador PostgreSQL y doble de tests, sin fallback durable. Manual y cualquier invocador futuro usan el mismo contrato. No existe código de Automatic ni conexión/publicación Trawel.

FASE 3C fija la identidad territorial antes de investigar. `GeographicResolver` consume un repositorio local respaldado por el snapshot GeoNames versionado y devuelve resolución, ambigüedad o ausencia; nunca genera destinos. Alias, búsqueda tolerante, jerarquía y correcciones humanas comparten UUID canónico y procedencia auditable.

FASE 3D sitúa `EditorialSourceProvider` entre el pipeline y cualquier adquisición. Descubrimiento, lectura y evaluación comparten timeout, cancelación, retry, límites, coste y circuit breaker; el único adaptador de esta fase es un mock sin red. Los resultados entran al dominio como fuentes y uso, no como objetos específicos de OpenAI/Kimi/Brave.
