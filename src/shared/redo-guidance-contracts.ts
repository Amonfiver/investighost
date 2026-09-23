import { z } from 'zod'

const scope = z.enum(['STUDENT', 'ADVENTURE', 'VISUALS', 'EDITORIAL'])
const variation = z.enum(['LIGHT', 'CLEAR', 'VERY_DIFFERENT'])

const adventure = z.object({
  quality: z.enum(['STANDARD', 'HIGH', 'MAXIMUM']),
  visualImpact: z.enum(['NORMAL', 'MORE_VISUAL', 'VERY_VISUAL']),
  adventureIntensity: z.enum(['NORMAL', 'MORE_ADVENTUROUS', 'INTENSE']),
  originality: z.enum(['SIMILAR_APPROACH', 'DIFFERENT', 'REINVENT_APPROACH']),
  detail: z.enum(['CONCISE', 'BALANCED', 'MORE_DESCRIPTIVE']),
  variationFromPrevious: variation,
}).strict()

const student = z.object({
  academicRigor: z.enum(['STANDARD', 'HIGH', 'MAXIMUM']),
  depth: z.enum(['CONCISE', 'BALANCED', 'DEEP']),
  clarity: z.enum(['STANDARD', 'CLEARER', 'VERY_CLEAR']),
  historicalCulturalContext: z.enum(['NORMAL', 'MORE_CONTEXT', 'DEEP_CONTEXT']),
  detail: z.enum(['CONCISE', 'BALANCED', 'MORE_DETAILED']),
  formality: z.enum(['ACCESSIBLE', 'FORMAL', 'ACADEMIC']),
  variationFromPrevious: variation,
}).strict()

const visuals = z.object({
  impact: z.enum(['BALANCED', 'MORE_SPECTACULAR', 'HIGH_IMPACT']),
  representativeness: z.enum(['BALANCED', 'MORE_REPRESENTATIVE']),
  variety: z.enum(['NORMAL', 'MORE_VARIED', 'VERY_VARIED']),
  landscape: z.enum(['NORMAL', 'PRIORITIZE']),
  heritage: z.enum(['NORMAL', 'PRIORITIZE']),
  localLife: z.enum(['NORMAL', 'PRIORITIZE']),
  avoidPreviousSimilarity: z.enum(['OFF', 'ON', 'STRONG']),
}).strict()

const editorial = z.object({
  quality: z.enum(['STANDARD', 'HIGH', 'MAXIMUM']),
  depth: z.enum(['BALANCED', 'DEEPER']),
  originality: z.enum(['NORMAL', 'DIFFERENT', 'REINVENT_APPROACH']),
  studentAcademicWeight: z.enum(['NORMAL', 'HIGHER']),
  adventureEmotionalWeight: z.enum(['NORMAL', 'HIGHER']),
  variationFromPrevious: variation,
  detail: z.enum(['CONCISE', 'BALANCED', 'MORE_DETAILED']),
}).strict()

export const RedoGenerationGuidanceSchema = z.discriminatedUnion('scope', [
  z.object({ scope: z.literal('ADVENTURE'), controls: adventure }).strict(),
  z.object({ scope: z.literal('STUDENT'), controls: student }).strict(),
  z.object({ scope: z.literal('VISUALS'), controls: visuals }).strict(),
  z.object({ scope: z.literal('EDITORIAL'), controls: editorial }).strict(),
])

export type RedoGenerationGuidance = z.infer<typeof RedoGenerationGuidanceSchema>
export type RedoGuidanceScope = z.infer<typeof scope>

export function defaultRedoGuidance(value: RedoGuidanceScope): RedoGenerationGuidance {
  if (value === 'ADVENTURE') return { scope: value, controls: { quality: 'HIGH', visualImpact: 'NORMAL', adventureIntensity: 'NORMAL', originality: 'DIFFERENT', detail: 'BALANCED', variationFromPrevious: 'CLEAR' } }
  if (value === 'STUDENT') return { scope: value, controls: { academicRigor: 'HIGH', depth: 'BALANCED', clarity: 'CLEARER', historicalCulturalContext: 'NORMAL', detail: 'BALANCED', formality: 'ACCESSIBLE', variationFromPrevious: 'CLEAR' } }
  if (value === 'VISUALS') return { scope: value, controls: { impact: 'BALANCED', representativeness: 'BALANCED', variety: 'NORMAL', landscape: 'NORMAL', heritage: 'NORMAL', localLife: 'NORMAL', avoidPreviousSimilarity: 'ON' } }
  return { scope: value, controls: { quality: 'HIGH', depth: 'BALANCED', originality: 'DIFFERENT', studentAcademicWeight: 'NORMAL', adventureEmotionalWeight: 'NORMAL', variationFromPrevious: 'CLEAR', detail: 'BALANCED' } }
}

export function redoVariation(value: RedoGenerationGuidance | undefined): 'LIGHT' | 'CLEAR' | 'VERY_DIFFERENT' {
  if (!value || value.scope === 'VISUALS') return 'CLEAR'
  return value.controls.variationFromPrevious
}

/** Provider-neutral strategy: adapters may map it to supported sampling
 * parameters, but the factual/evidence constraints never change. */
export function redoGenerationStrategy(value: RedoGenerationGuidance, profile: 'student' | 'adventure'): { variation: string; instruction: string } {
  const variation = redoVariation(value)
  const strength = variation === 'VERY_DIFFERENT' ? 'alta controlada' : variation === 'LIGHT' ? 'ligera' : 'clara'
  const profileRule = profile === 'student'
    ? 'Mantén el canon enciclopédico, elegante, no turístico y no escolar; no introduzcas logística de viaje.'
    : 'Prioriza una solución visual-first, emocional y selectiva; no conviertas Adventure en un texto enciclopédico largo.'
  const controls = value.scope === 'ADVENTURE'
    ? `Calidad ${value.controls.quality}; impacto visual ${value.controls.visualImpact}; intensidad de aventura ${value.controls.adventureIntensity}; originalidad ${value.controls.originality}; detalle ${value.controls.detail}.`
    : value.scope === 'STUDENT'
      ? `Rigor académico ${value.controls.academicRigor}; profundidad ${value.controls.depth}; claridad ${value.controls.clarity}; contexto histórico-cultural ${value.controls.historicalCulturalContext}; formalidad ${value.controls.formality}; detalle ${value.controls.detail}.`
      : value.scope === 'EDITORIAL'
        ? `Calidad ${value.controls.quality}; profundidad ${value.controls.depth}; originalidad ${value.controls.originality}; peso académico Student ${value.controls.studentAcademicWeight}; peso emocional Adventure ${value.controls.adventureEmotionalWeight}; detalle ${value.controls.detail}.`
        : 'Aplica la dirección visual en búsqueda, ranking y selección; conserva derechos y procedencia fail-closed.'
  return { variation: strength, instruction: `Produce una revisión materialmente distinta, no una paráfrasis. Conserva sólo hechos verificados y evidencia. Variación solicitada: ${strength}. ${controls} ${profileRule}` }
}
