import { describe, expect, it } from 'vitest'
import { EditorialGenerationService } from '@modules/editorial-pipeline/editorial-generation'
import { MockEditorialGenerationProvider } from '@modules/editorial-pipeline/mock-editorial-provider'
import { RevisiatorService, type QualityReviewInput } from '@modules/editorial-pipeline/quality-review'
import { buildEditorialFixture } from './support/editorial-fixture'

const now = new Date('2026-07-21T13:00:00.000Z')

async function buildInput(): Promise<QualityReviewInput> {
  const fixture = buildEditorialFixture()
  const generated = await new EditorialGenerationService(
    new MockEditorialGenerationProvider(),
    {},
    { now: () => now },
  ).generate({
    requestId: fixture.request.id,
    runId: fixture.run.id,
    actorId: fixture.request.actorId,
    destinationName: fixture.destination.name,
    language: fixture.request.language,
    facts: fixture.facts,
    places: fixture.places,
    activities: fixture.activities,
    profiles: ['adventure', 'student'],
  })
  return {
    destinationName: fixture.destination.name,
    language: fixture.request.language,
    requestedProfiles: ['adventure', 'student'],
    sources: fixture.sources,
    facts: fixture.facts,
    drafts: generated.drafts,
  }
}

describe('RevisIAtor deterministic quality checks', () => {
  it('passes complete traceable and differentiated drafts without approving them', async () => {
    const input = await buildInput()
    const originalStates = input.drafts.map(bundle => bundle.draft.state)
    const result = new RevisiatorService(() => now).review(input)
    expect(result.summary.passed).toBe(2)
    expect(result.checks).toHaveLength(34)
    expect(result.requiresHumanDecision).toBe(true)
    expect(result.checks.filter(check => check.code === 'human.decision_required').every(check => check.result === 'passed')).toBe(true)
    expect(input.drafts.map(bundle => bundle.draft.state)).toEqual(originalStates)
    expect(input.drafts.every(bundle => bundle.draft.state === 'ready')).toBe(true)
  })

  it('returns warnings for weak, dated and contradictory evidence', async () => {
    const input = await buildInput()
    input.sources[0].reliability = 0.4
    input.sources[0].freshness = 'dated'
    input.facts[0].contradiction = 'suspected'
    input.facts[0].reviewStatus = 'disputed'
    const result = new RevisiatorService(() => now).review(input)
    expect(result.summary.passed_with_warnings).toBe(2)
    expect(result.checks.filter(check => check.result === 'warning').map(check => check.code))
      .toEqual(expect.arrayContaining(['sources.reliability', 'sources.freshness', 'facts.contradictions']))
  })

  it('requests changes when canonical geography is absent from title and introduction', async () => {
    const input = await buildInput()
    input.drafts[0].draft.title = 'Guía sin identidad territorial'
    input.drafts[0].draft.introduction = 'Esta introducción deliberadamente no menciona el destino canónico y necesita una corrección editorial completa.'
    const result = new RevisiatorService(() => now).review(input)
    const adventure = result.reviews.find(review => review.draftId === input.drafts[0].draft.id)
    expect(adventure?.outcome).toBe('changes_requested')
    expect(result.checks.find(check => check.reviewId === adventure?.id && check.code === 'geography.identity')?.result).toBe('failed')
  })

  it('blocks a draft whose source-to-fact-to-text chain is broken', async () => {
    const input = await buildInput()
    input.sources = []
    const result = new RevisiatorService(() => now).review(input)
    expect(result.summary.blocked).toBe(2)
    expect(result.checks.filter(check => check.code === 'traceability.source_fact_text').every(check => check.severity === 'blocker' && check.result === 'failed')).toBe(true)
  })

  it('rejects a generated profile that was not requested', async () => {
    const input = await buildInput()
    input.requestedProfiles = ['adventure']
    const result = new RevisiatorService(() => now).review(input)
    const studentDraft = input.drafts.find(bundle => bundle.draft.profile === 'student')
    const studentReview = result.reviews.find(review => review.draftId === studentDraft?.draft.id)
    expect(studentReview?.outcome).toBe('rejected')
  })

  it('detects duplicated sections and insufficient profile differentiation', async () => {
    const input = await buildInput()
    const adventure = input.drafts.find(bundle => bundle.draft.profile === 'adventure')
    const student = input.drafts.find(bundle => bundle.draft.profile === 'student')
    if (!adventure || !student) throw new Error('missing profiles')
    adventure.sections[1].content = adventure.sections[0].content
    student.sections = adventure.sections.map((section, index) => ({
      ...structuredClone(section),
      id: `c0000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      draftId: student.draft.id,
      position: index,
    }))
    const result = new RevisiatorService(() => now).review(input)
    expect(result.checks.some(check => check.code === 'editorial.duplicates' && check.result === 'failed')).toBe(true)
    expect(result.checks.some(check => check.code === 'profiles.differentiation' && check.result === 'failed')).toBe(true)
  })

  it('requires explicit caution wherever a volatile fact is used', async () => {
    const input = await buildInput()
    input.facts[0].volatility = 'volatile'
    const result = new RevisiatorService(() => now).review(input)
    expect(result.checks.some(check => check.code === 'facts.volatility' && check.result === 'failed')).toBe(true)
    expect(result.summary.changes_requested).toBeGreaterThan(0)
  })

  it('rejects invalid schemas before producing misleading checks', async () => {
    const input = await buildInput()
    input.drafts[0].sections[0].factIds = []
    expect(() => new RevisiatorService(() => now).review(input)).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }))
  })
})
