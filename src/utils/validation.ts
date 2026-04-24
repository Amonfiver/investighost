/**
 * Investighost - Validación con Zod (MVP)
 * 
 * Propósito: Esquemas Zod alineados con el contrato de datos del MVP
 * Alcance: Validación de todos los inputs y entidades del flujo
 * Estado: Consolidado para MVP
 */

import { z } from 'zod'

// ============================================
// Enums como Zod
// ============================================

export const ResearchStatusSchema = z.enum([
  'pending',
  'researching',
  'structured',
  'drafted',
  'under_review',
  'approved',
  'published',
  'error',
])

export const DraftStatusSchema = z.enum([
  'generating',
  'ready',
  'in_review',
  'approved',
  'rejected',
])

export const ToneSchema = z.enum([
  'friendly',
  'informative',
  'enthusiastic',
  'relaxed',
])

export const PlaceCategorySchema = z.enum([
  'landmark',
  'neighborhood',
  'museum',
  'viewpoint',
  'beach',
  'park',
  'market',
  'other',
])

export const ActivityCategorySchema = z.enum([
  'experience',
  'tour',
  'food',
  'nightlife',
  'shopping',
  'relax',
  'other',
])

export const SourceTypeSchema = z.enum([
  'official',
  'blog',
  'guide',
  'review',
  'other',
])

// ============================================
// Entrada de investigación
// ============================================

export const ResearchInputSchema = z.object({
  country: z.string().min(1).max(100),
  region: z.string().min(1).max(100).optional(),
  focus: z.string().max(50).optional(),
  outputLanguage: z.string().length(2).default('es'),
  userNotes: z.string().max(500).optional(),
})

export type ResearchInputValidated = z.infer<typeof ResearchInputSchema>

// ============================================
// Request de investigación completo
// ============================================

export const ResearchRequestSchema = z.object({
  id: z.string(),
  input: ResearchInputSchema,
  status: ResearchStatusSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
  errorMessage: z.string().optional(),
})

// ============================================
// Entidades del resultado estructurado
// ============================================

export const SourceSchema = z.object({
  id: z.string(),
  url: z.string().url(),
  title: z.string().min(1),
  type: SourceTypeSchema,
  reliability: z.number().min(0).max(1),
  accessedAt: z.date(),
})

export const PlaceSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  category: PlaceCategorySchema,
  description: z.string().min(1),
  whyVisit: z.string().min(1),
  bestFor: z.string().optional(),
  estimatedTime: z.string().optional(),
  practicalInfo: z.string().optional(),
})

export const ActivitySchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().min(1),
  category: ActivityCategorySchema,
  idealFor: z.string().optional(),
  duration: z.string().optional(),
})

export const ResearchResultSchema = z.object({
  id: z.string(),
  researchId: z.string(),
  destination: z.object({
    country: z.string(),
    region: z.string(),
    description: z.string(),
  }),
  summary: z.string(),
  places: z.array(PlaceSchema),
  activities: z.array(ActivitySchema),
  tips: z.array(z.string()),
  sources: z.array(SourceSchema),
  confidence: z.number().min(0).max(1),
  generatedAt: z.date(),
})

// ============================================
// Borrador editorial
// ============================================

export const DraftSectionSchema = z.object({
  id: z.string(),
  heading: z.string().min(1),
  content: z.string().min(1),
  order: z.number().int().min(0),
})

export const EditorialDraftSchema = z.object({
  id: z.string(),
  researchResultId: z.string(),
  title: z.string().min(1),
  introduction: z.string(),
  sections: z.array(DraftSectionSchema),
  tone: ToneSchema,
  language: z.string(),
  status: DraftStatusSchema,
  wordCount: z.number().int().min(0),
  generatedAt: z.date(),
  reviewedAt: z.date().optional(),
  reviewNotes: z.string().optional(),
  publishedAt: z.date().optional(),
})

// ============================================
// Validadores exportados
// ============================================

export const validators = {
  researchInput: ResearchInputSchema,
  researchRequest: ResearchRequestSchema,
  researchResult: ResearchResultSchema,
  place: PlaceSchema,
  activity: ActivitySchema,
  source: SourceSchema,
  editorialDraft: EditorialDraftSchema,
  draftSection: DraftSectionSchema,
}

/**
 * Valida un input de investigación
 */
export function validateResearchInput(
  data: unknown
): { success: true; data: ResearchInputValidated } | { success: false; errors: string[] } {
  const result = ResearchInputSchema.safeParse(data)
  
  if (result.success) {
    return { success: true, data: result.data }
  }
  
  return {
    success: false,
    errors: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
  }
}