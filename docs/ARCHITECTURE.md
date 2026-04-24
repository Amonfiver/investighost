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
3. El sistema investiga fuentes y recopila señales (usando proveedor configurado).
4. El sistema transforma lo investigado en datos estructurados.
5. El sistema genera un borrador editorial (usando proveedor configurado).
6. El usuario revisa el resultado.
7. El usuario aprueba (el contenido va a cola editorial).
8. El sistema publica según ritmo configurado (ej: 3 piezas/día).
9. El sistema registra auditoría de proveedores y costes.

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
Investighost debe poder trabajar con múltiples proveedores de IA para:
- Elegir el más adecuado según coste/disponibilidad
- Usar fallback si uno falla o no tiene saldo
- Comparar coste/calidad entre proveedores
- Usar uno para búsqueda y otro para redacción

### Proveedores soportados
- **OpenAI**: GPT-4o, GPT-4o-mini (búsqueda + chat + estructurado)
- **Kimi**: Moonshot AI (búsqueda + chat + estructurado)
- **Local**: Ollama, LM Studio (chat + estructurado, sin búsqueda)

### Estrategias de uso
- `auto`: Selección automática según preferencia y disponibilidad
- `openai`/`kimi`: Fuerza uso de proveedor específico
- `fallback`: Intenta en cadena (OpenAI → Kimi → Local)
- `compare`: Ejecuta múltiples y permite comparar resultados

### Contrato común
Todos los proveedores implementan `AIProviderContract`:
- `generateText()`: Generación de texto libre
- `generateStructured()`: Generación con salida JSON
- `searchAndSummarize()`: Búsqueda web + resumen
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
│   ├── web/             # Búsqueda web
│   ├── db/              # Persistencia
│   │   └── schema.ts    # Esquemas incluyendo cola y auditoría
│   └── trawel/          # Integración futura con Trawel
└── shared/
    └── types.ts         # Tipos incluyendo multi-proveedor y cola