import { describe, expect, it } from 'vitest'
import {
  ResearchInputSchema,
  ResearchStatusSchema,
  validateResearchInput,
} from '@utils/validation'

describe('ResearchInput contract', () => {
  it('applies the canonical Spanish output language default', () => {
    const result = ResearchInputSchema.parse({ country: 'España' })

    expect(result).toEqual({ country: 'España', outputLanguage: 'es' })
  })

  it('rejects empty countries and invalid language codes', () => {
    const result = validateResearchInput({
      country: '',
      outputLanguage: 'spanish',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors).toEqual(expect.arrayContaining([
        expect.stringContaining('country'),
        expect.stringContaining('outputLanguage'),
      ]))
    }
  })
})

describe('ResearchStatus contract', () => {
  it.each([
    'pending',
    'researching',
    'structured',
    'drafted',
    'under_review',
    'approved',
    'rejected',
    'error',
    'not_published',
    'queued',
    'scheduled',
    'publishing',
    'published',
    'unpublished',
  ])('accepts canonical status %s', status => {
    expect(ResearchStatusSchema.parse(status)).toBe(status)
  })

  it('rejects unknown workflow states', () => {
    expect(ResearchStatusSchema.safeParse('completed').success).toBe(false)
  })
})
