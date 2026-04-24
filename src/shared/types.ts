/**
 * Investighost - Tipos Compartidos (MVP + Arquitectura Multi-Proveedor)
 * 
 * Propósito: Definiciones TypeScript alineadas con el contrato de datos
 * Alcance: Investigación → Producción interna → Revisión → Cola editorial → Publicación
 * Estado: Actualizado con soporte multi-proveedor y separación producción/publicación
 */

// ============================================
// Proveedores de IA y servicios
// ============================================

export type AIProvider = 'openai' | 'kimi' | 'local'

export type SearchProvider = 'openai' | 'kimi' | 'web' | 'local'

export type ProviderStrategy = 
  | 'auto'        // Elige automáticamente según disponibilidad y coste
  | 'openai'      // Fuerza uso de OpenAI
  | 'kimi'        // Fuerza uso de Kimi
  | 'fallback'    // Intenta primario, fallback a secundario si falla
  | 'compare'     // Ejecuta ambos y permite comparar resultados

// ============================================
// Estados del flujo de producción interna
// Separado del flujo de publicación externa
// ============================================

export type ProductionStatus = 
  | 'pending'      // Solicitud creada, esperando iniciar
  | 'researching'  // En proceso de investigación
  | 'structured'   // Datos estructurados listos
  | 'drafted'      // Borrador editorial generado
  | 'under_review' // En revisión humana
  | 'approved'     // Aprobado, listo para cola editorial
  | 'rejected'     // Rechazado en revisión
  | 'error'        // Error en alguna fase

// Estados de publicación (independientes de producción)
export type PublishingStatus =
  | 'not_published'   // Aún no en cola de publicación
  | 'queued'          // En cola editorial, esperando turno
  | 'scheduled'       // Programado para fecha específica
  | 'publishing'      // En proceso de publicación
  | 'published'       // Publicado en Trawel
  | 'unpublished'     // Despublicado manualmente

// Tipo combinado para compatibilidad (obsoleto, usar ProductionStatus)
export type ResearchStatus = ProductionStatus | PublishingStatus

// ============================================
// Entrada de investigación
// ============================================

export interface ResearchInput {
  country: string
  region?: string      // ciudad, zona, barrio, etc.
  focus?: string       // tipo de búsqueda: "general", "gastronomía", "cultura", etc.
  outputLanguage: string  // idioma del resultado: "es", "en", etc.
  userNotes?: string   // notas opcionales del usuario
}

export interface ResearchRequest {
  id: string
  input: ResearchInput
  status: ResearchStatus
  createdAt: Date
  updatedAt: Date
  errorMessage?: string
}

// ============================================
// Resultado estructurado de investigación
// ============================================

export interface ResearchResult {
  id: string
  researchId: string
  destination: {
    country: string
    region: string
    description: string
  }
  summary: string           // resumen breve del destino
  places: Place[]           // lugares recomendados
  activities: Activity[]    // planes/cosas que hacer
  tips: string[]            // consejos útiles
  sources: Source[]         // fuentes consultadas
  confidence: number        // 0-1, nivel de confianza general
  generatedAt: Date
}

export interface Place {
  id: string
  name: string
  category: 'landmark' | 'neighborhood' | 'museum' | 'viewpoint' | 'beach' | 'park' | 'market' | 'other'
  description: string
  whyVisit: string
  bestFor?: string         // perfil de viajero ideal
  estimatedTime?: string   // tiempo recomendado
  practicalInfo?: string   // horarios, precios, etc. (orientativo)
}

export interface Activity {
  id: string
  name: string
  description: string
  category: 'experience' | 'tour' | 'food' | 'nightlife' | 'shopping' | 'relax' | 'other'
  idealFor?: string
  duration?: string
}

export interface Source {
  id: string
  url: string
  title: string
  type: 'official' | 'blog' | 'guide' | 'review' | 'other'
  reliability: number      // 0-1
  accessedAt: Date
}

// ============================================
// Borrador editorial
// ============================================

export type DraftStatus = 
  | 'generating' 
  | 'ready' 
  | 'in_review' 
  | 'approved' 
  | 'rejected'

export type Tone = 'friendly' | 'informative' | 'enthusiastic' | 'relaxed'

export interface EditorialDraft {
  id: string
  researchResultId: string
  title: string
  introduction: string
  sections: DraftSection[]   // bloques de contenido
  tone: Tone
  language: string
  status: DraftStatus
  wordCount: number
  generatedAt: Date
  reviewedAt?: Date
  reviewNotes?: string
  publishedAt?: Date
}

export interface DraftSection {
  id: string
  heading: string
  content: string
  order: number
}

// ============================================
// Tipos de sistema (mantenidos, sin cambios)
// ============================================

export interface AppState {
  currentPhase: ResearchStatus
  lastResearchId?: string
  pendingReviews: number
  publishedCount: number
}

export interface SystemHealth {
  dbConnected: boolean
  aiServiceAvailable: boolean
  webSearchAvailable: boolean
  lastError?: string
}

// ============================================
// AUDITORÍA Y METADATOS DE PROVEEDORES
// ============================================

/**
 * Registro de uso de proveedores para auditoría de coste/calidad
 * Se guarda en cada operación que use servicios externos
 */
export interface ProviderUsageLog {
  id: string
  operationId: string        // ID de la operación (research, draft, etc.)
  operationType: 'research' | 'draft_generation' | 'text_improvement' | 'search'
  
  // Estrategia usada
  strategy: ProviderStrategy
  
  // Proveedor de búsqueda (si aplica)
  searchProvider?: SearchProvider
  searchModel?: string
  searchCostEstimated?: number  // en USD o moneda base
  
  // Proveedor de redacción/IA (si aplica)
  aiProvider?: AIProvider
  aiModel?: string
  aiCostEstimated?: number      // en USD o moneda base
  
  // Tokens consumidos (si el proveedor lo reporta)
  tokensInput?: number
  tokensOutput?: number
  tokensTotal?: number
  
  // Timestamp
  usedAt: Date
  
  // Evaluación de calidad (opcional, para análisis posterior)
  qualityNotes?: string
  qualityRating?: number        // 1-5, valoración subjetiva del usuario
  wasUseful?: boolean           // ¿el resultado fue útil?
}

// ============================================
// COLA EDITORIAL / PUBLISHING QUEUE
// ============================================

/**
 * Elemento en cola editorial listo para publicación regulada
 * Permite acumular contenido aprobado y publicar con ritmo controlado
 */
export interface PublishingQueueItem {
  id: string
  draftId: string              // Referencia al borrador aprobado
  researchResultId: string     // Referencia al resultado de investigación
  
  // Contenido para publicación (copia en el momento de encolar)
  title: string
  destination: {
    country: string
    region: string
  }
  
  // Estado en la cola
  status: PublishingStatus
  
  // Prioridad y orden
  priority: number             // 1-10, mayor = más prioritario
  queuePosition: number        // Posición en la cola (se recalcula)
  
  // Fechas de publicación
  addedToQueueAt: Date
  scheduledPublishAt?: Date    // Fecha sugerida/programada
  publishedAt?: Date
  publishedBy?: string         // usuario o sistema que publicó
  
  // Metadatos de publicación
  targetPlatform: 'trawel'     // Futuro: podría soportar más plataformas
  publishOptions?: {
    category?: string
    tags?: string[]
    featured?: boolean
  }
  
  // Notas editoriales
  editorialNotes?: string
}

/**
 * Configuración de ritmo de publicación
 */
export interface PublishingRateConfig {
  id: string
  name: string                 // ej: "Ritmo estándar", "Modo lento"
  
  // Límites diarios
  maxDailyPosts: number        // máximo de publicaciones por día (ej: 3, 5)
  
  // Ventana de publicación
  preferredHoursStart?: number // hora inicio (0-23)
  preferredHoursEnd?: number   // hora fin (0-23)
  
  // Días permitidos
  allowedDays: ('mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun')[]
  
  // Reglas adicionales
  minIntervalMinutes?: number  // intervalo mínimo entre publicaciones
  
  // Estado
  isActive: boolean
  createdAt: Date
}

// ============================================
// MODELO DE DOMINIO SEPARADO: PRODUCCIÓN vs PUBLICACIÓN
// ============================================

/**
 * Entidad principal de contenido producido internamente
 * Acumula trabajo sin presión de publicación inmediata
 */
export interface ContentPiece {
  id: string
  
  // Identificación
  destination: {
    country: string
    region: string
  }
  
  // Producción
  production: {
    request: ResearchRequest
    result: ResearchResult
    draft: EditorialDraft
  }
  
  // Estado de producción (flujo interno)
  productionStatus: ProductionStatus
  
  // Estado de publicación (flujo externo, independiente)
  publishingStatus: PublishingStatus
  
  // Auditoría de proveedores usados
  providerLogs: ProviderUsageLog[]
  
  // Fechas clave
  createdAt: Date
  approvedAt?: Date            // Cuando se aprobó para cola editorial
  queuedAt?: Date              // Cuando entró en cola de publicación
  publishedAt?: Date           // Cuando se publicó realmente
  
  // Control de versiones
  version: number
  previousVersions?: string[]  // IDs de versiones anteriores si hay re-escrituras
}

/**
 * Resumen de la cola editorial para la UI
 */
export interface EditorialQueueSummary {
  totalApproved: number        // Contenido aprobado esperando cola
  totalQueued: number          // En cola editorial
  totalScheduled: number       // Programado para fechas específicas
  totalPublished: number       // Publicado este mes/semana
  
  // Próximas publicaciones
  nextInQueue?: {
    id: string
    title: string
    destination: string
    scheduledFor?: Date
  }
  
  // Ritmo actual
  currentRate: {
    configName: string
    maxDaily: number
    publishedToday: number
    remainingToday: number
  }
}

/**
 * Contrato de servicio multi-proveedor
 * Define la interfaz común para cualquier proveedor de IA
 */
export interface AIProviderContract {
  readonly name: AIProvider
  readonly isAvailable: boolean
  
  // Capacidades
  supportsSearch: boolean      // ¿puede hacer búsqueda web?
  supportsChat: boolean        // ¿soporta conversación?
  supportsStructured: boolean  // ¿devuelve JSON estructurado?
  
  // Métodos
  generateText(prompt: string, options?: unknown): Promise<string>
  generateStructured<T>(prompt: string, schema: unknown): Promise<T>
  searchAndSummarize(query: string): Promise<string>
  estimateCost(tokensInput: number, tokensOutput: number): number
}

/**
 * Resultado de estrategia compare (comparación entre proveedores)
 */
export interface ProviderComparisonResult {
  operationId: string
  operationType: string
  timestamp: Date
  
  results: {
    provider: AIProvider
    result: string
    costEstimated: number
    latencyMs: number
    tokensUsed?: number
  }[]
  
  selectedResult?: AIProvider   // Cuál se eligió finalmente
  selectionReason?: string
}
