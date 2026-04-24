/**
 * Investighost - Tipos Compartidos (MVP)
 * 
 * Propósito: Definiciones TypeScript alineadas con el contrato de datos del MVP
 * Alcance: Todo el flujo de investigación → revisión → publicación
 * Estado: Consolidado para MVP - simple y funcional
 */

// ============================================
// Estados del flujo
// ============================================

export type ResearchStatus = 
  | 'pending'      // Creada, esperando iniciar
  | 'researching'  // En proceso de investigación
  | 'structured'   // Datos estructurados listos
  | 'drafted'      // Borrador editorial generado
  | 'under_review' // En revisión humana
  | 'approved'     // Aprobado, listo para publicar
  | 'published'    // Publicado en Trawel
  | 'error'        // Error en alguna fase

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