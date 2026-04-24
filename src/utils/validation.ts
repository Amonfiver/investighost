/**
 * Investighost - Validación con Zod
 * 
 * Propósito: Esquemas Zod para validación de datos
 * Alcance: Validación de inputs y contratos de datos
 * Estado: Esqueleto inicial, esquemas base preparados
 */

import { z } from 'zod'

// ============================================
// Esquemas base
// ============================================

export const ResearchInputSchema = z.object({
  country: z.string().min(1).max(100),
  city: z.string().min(1).max(100).optional(),
  zone: z.string().min(1).max(100).optional(),
  travelerProfile: z.string().max(200).optional(),
  tripDurationDays: z.number().int().min(1).max(365).optional(),
  researchMode: z.enum(['general', 'specific', 'deep']).default('general'),
})

export type ResearchInputValidated = z.infer<typeof ResearchInputSchema>

// ============================================
// Esquemas de respuesta/estructura
// ============================================

export const SignalSchema = z.object({
  id: z.string(),
  type: z.enum(['mention', 'recommendation', 'review', 'image', 'video']),
  source: z.string(),
  content: z.string(),
  relevance: z.number().min(0).max(1),
  verified: z.boolean(),
})

export const SourceSchema = z.object({
  id: z.string(),
  url: z.string().url(),
  title: z.string(),
  type: z.enum(['official', 'blog', 'social', 'review_site', 'other']),
  trustScore: z.number().min(0).max(1),
  accessedAt: z.date(),
})

// ============================================
// Validadores exportados
// ============================================

export const validators = {
  researchInput: ResearchInputSchema,
  signal: SignalSchema,
  source: SourceSchema,
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