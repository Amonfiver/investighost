import type { FactualProposal, FactualStructuringProvider } from './factual-structuring'
import type { EvaluatedSourceDocument } from './source-providers'
import { normalizeSourceUrl, SourceProviderError } from './source-providers'

export interface MockFactualSeed {
  sourceUrl: string
  proposal: FactualProposal
  fail?: boolean
}

export class MockFactualStructuringProvider implements FactualStructuringProvider {
  readonly id = 'mock-factual-provider'
  readonly model = 'deterministic-factual-fixture-v1'
  readonly contractVersion = 'factual-v1'
  readonly simulation = true
  readonly calls: string[] = []

  constructor(private readonly seeds: MockFactualSeed[]) {}

  async structure(input: {
    document: EvaluatedSourceDocument
    destinationId: string
    language: string
    signal: AbortSignal
  }): Promise<FactualProposal> {
    if (input.signal.aborted) throw new SourceProviderError('CANCELLED', 'Estructuración mock cancelada')
    const sourceUrl = normalizeSourceUrl(input.document.source.url)
    this.calls.push(sourceUrl)
    const seed = this.seeds.find(item => normalizeSourceUrl(item.sourceUrl) === sourceUrl)
    if (!seed) throw new Error(`No factual fixture for ${sourceUrl}`)
    if (seed.fail) throw new Error(`Synthetic factual failure for ${sourceUrl}`)
    return structuredClone(seed.proposal)
  }
}
