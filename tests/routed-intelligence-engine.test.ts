import { describe, expect, it } from 'vitest'
import { RoutedIntelligenceEngine } from '@modules/real-pipeline/routed-intelligence-engine'

function fake(providerId: string, model: string, calls: string[]) {
  return {
    id: providerId,
    model,
    simulation: true,
    analyze: async () => ({ usage: { providerId, model, inputTokens: 1, outputTokens: 1, estimatedCost: 0, currency: 'USD' } }),
    draft: async (mission: { profiles: Array<{ profile: 'adventure' | 'student' }> }) => {
      const profile = mission.profiles[0].profile
      calls.push(`${providerId}:${profile}`)
      return [{ profile, title: profile, content: profile, approximateWordCount: 1, promptVersion: 'fixture', schemaVersion: 'fixture', usage: { providerId, model, inputTokens: 1, outputTokens: 1, estimatedCost: 0, currency: 'USD' } }]
    },
    review: async () => ({ outcome: 'passed', issues: [], promptVersion: 'fixture', schemaVersion: 'fixture', usage: { providerId, model, inputTokens: 1, outputTokens: 1, estimatedCost: 0, currency: 'USD' } }),
  }
}

describe('RoutedIntelligenceEngine', () => {
  it('despacha Adventure y Student por rutas independientes sin exponer proveedor al workflow', async () => {
    const calls: string[] = []
    const deepseek = fake('deepseek', 'deepseek-flash', calls)
    const openai = fake('openai', 'gpt-5.6-luna', calls)
    const route = (providerId: 'openai' | 'deepseek', model: string) => ({ providerId, model, apiModel: model })
    const router = new RoutedIntelligenceEngine({
      analysis: { route: route('deepseek', 'deepseek-flash'), engine: deepseek as never },
      draft_adventure: { route: route('deepseek', 'deepseek-flash'), engine: deepseek as never },
      draft_student: { route: route('openai', 'gpt-5.6-luna'), engine: openai as never },
      review: { route: route('openai', 'gpt-5.6-luna'), engine: openai as never },
    })
    const drafts = await router.draft({ profiles: [{ profile: 'adventure', enabled: true }, { profile: 'student', enabled: true }] } as never, {} as never, new AbortController().signal)
    const review = await router.review({} as never, {} as never, drafts, new AbortController().signal)
    expect(calls).toEqual(['deepseek:adventure', 'openai:student'])
    expect(drafts.map(draft => [draft.profile, draft.usage.providerId, draft.usage.model])).toEqual([
      ['adventure', 'deepseek', 'deepseek-flash'], ['student', 'openai', 'gpt-5.6-luna'],
    ])
    expect(review.usage).toMatchObject({ providerId: 'openai', model: 'gpt-5.6-luna' })
    expect(router.routeFor('analysis')).toMatchObject({ providerId: 'deepseek' })
  })
})
