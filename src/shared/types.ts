/**
 * Investighost - Tipos Compartidos
 * 
 * Propósito: Definiciones TypeScript usadas en toda la app
 * Alcance: Main y renderer processes
 * Estado: Esqueleto inicial, se expandirá con los modelos de datos
 */

// ============================================
// Tipos base de entrada
// ============================================

export interface ResearchInput {
  country: string
  city?: string
  zone?: string
  travelerProfile?: string
  tripDurationDays?: number
  researchMode?: 'general' | 'specific' | 'deep'
}

// ============================================
// Tipos de datos estructurados (capa de datos)
// ============================================

export interface StructuredData {
  id: string
  country: string
  city: string
  zone?: string
  category: string
  name: string
  type: string
  factualSummary: string
  whyWorthIt: string
  idealTravelerProfile: string
  recommendedTime: string
  budgetEstimate: string
  practicalTips: string[]
  highlightedSignals: Signal[]
  sources: Source[]
  researchDate: Date
  reviewStatus: ReviewStatus
}

export interface Signal {
  id: string
  type: 'mention' | 'recommendation' | 'review' | 'image' | 'video'
  source: string
  content: string
  relevance: number // 0-1
  verified: boolean
}

export interface Source {
  id: string
  url: string
  title: string
  type: 'official' | 'blog' | 'social' | 'review_site' | 'other'
  trustScore: number // 0-1
  accessedAt: Date
}

export type ReviewStatus = 
  | 'pending' 
  | 'in_review' 
  | 'approved' 
  | 'rejected' 
  | 'published'

// ============================================
// Tipos de salida editorial (capa editorial)
// ============================================

export interface EditorialDraft {
  id: string
  structuredDataId: string
  title: string
  content: string
  tone: 'friendly' | 'informative' | 'enthusiastic'
  targetAudience: string
  wordCount: number
  generatedAt: Date
  reviewedAt?: Date
  reviewNotes?: string
}

// ============================================
// Tipos de sistema
// ============================================

export interface AppState {
  currentPhase: string
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