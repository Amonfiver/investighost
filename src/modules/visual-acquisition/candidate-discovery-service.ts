import type { VisualCandidate, WikimediaCommonsDiscoveryQuery } from '@shared/visual-candidate-contracts'
import { type VisualCandidateRepository } from './candidate-repository'
import { WikimediaCommonsDiscoveryAdapter } from './wikimedia-commons'

/** Orchestrates only discovery and durable candidate upsert; it never creates a public visual asset. */
export class VisualCandidateDiscoveryService {
  constructor(private readonly adapter: WikimediaCommonsDiscoveryAdapter, private readonly repository: VisualCandidateRepository) {}
  async discover(query: WikimediaCommonsDiscoveryQuery): Promise<VisualCandidate[]> {
    const candidates = await this.adapter.discover(query)
    return Promise.all(candidates.map(candidate => this.repository.upsert(candidate)))
  }
}
