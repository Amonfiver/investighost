import { MANUAL_LOCAL_ACTOR_ID } from '@modules/editorial-pipeline/manual-runtime'
import { DestinationBatchRedoScopeSchema, type DestinationBatchJob, type DestinationBatchRedoScope } from '@shared/factory-batch-contracts'
import type { DestinationBatchRepository } from './contracts'

/** Explicit human redo command; phase invalidation remains repository-owned. */
export class DestinationBatchRedoService {
  constructor(private readonly repository: DestinationBatchRepository, private readonly now: () => Date = () => new Date()) {}

  request(input: { jobId: string; scope: DestinationBatchRedoScope; reason?: string; requestedBy?: string }): Promise<DestinationBatchJob> {
    return this.repository.requestRedo({ jobId: input.jobId, scope: DestinationBatchRedoScopeSchema.parse(input.scope), reason: input.reason?.trim() || undefined, requestedBy: input.requestedBy ?? MANUAL_LOCAL_ACTOR_ID, now: this.now() })
  }
}
