import { describe, expect, it } from 'vitest'
import { defaultRedoGuidance, RedoGenerationGuidanceSchema, redoGenerationStrategy, redoVariation } from '../src/shared/redo-guidance-contracts'

describe('guided editorial redo contracts', () => {
  it('provides balanced, scope-specific defaults without technical provider parameters', () => {
    expect(defaultRedoGuidance('ADVENTURE')).toEqual({
      scope: 'ADVENTURE',
      controls: { quality: 'HIGH', visualImpact: 'NORMAL', adventureIntensity: 'NORMAL', originality: 'DIFFERENT', detail: 'BALANCED', variationFromPrevious: 'CLEAR' },
    })
    expect(defaultRedoGuidance('STUDENT')).toMatchObject({ scope: 'STUDENT', controls: { academicRigor: 'HIGH', formality: 'ACCESSIBLE' } })
    expect(defaultRedoGuidance('VISUALS')).toMatchObject({ scope: 'VISUALS', controls: { avoidPreviousSimilarity: 'ON' } })
  })

  it('maps very different Adventure and high-rigor Student requests to distinct factual-safe strategies', () => {
    const adventure = RedoGenerationGuidanceSchema.parse({
      scope: 'ADVENTURE',
      controls: { quality: 'MAXIMUM', visualImpact: 'VERY_VISUAL', adventureIntensity: 'MORE_ADVENTUROUS', originality: 'REINVENT_APPROACH', detail: 'BALANCED', variationFromPrevious: 'VERY_DIFFERENT' },
    })
    const student = RedoGenerationGuidanceSchema.parse({
      scope: 'STUDENT',
      controls: { academicRigor: 'MAXIMUM', depth: 'DEEP', clarity: 'VERY_CLEAR', historicalCulturalContext: 'DEEP_CONTEXT', detail: 'MORE_DETAILED', formality: 'ACADEMIC', variationFromPrevious: 'CLEAR' },
    })
    expect(redoVariation(adventure)).toBe('VERY_DIFFERENT')
    expect(redoGenerationStrategy(adventure, 'adventure')).toMatchObject({ variation: 'alta controlada' })
    expect(redoGenerationStrategy(adventure, 'adventure').instruction).toContain('visual-first')
    expect(redoGenerationStrategy(student, 'student').instruction).toContain('no turístico')
    expect(redoGenerationStrategy(student, 'student').instruction).toContain('no introduzcas logística de viaje')
  })
})
