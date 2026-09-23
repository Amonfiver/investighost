import { MANUAL_LOCAL_ACTOR_ID } from '@modules/editorial-pipeline/manual-runtime'
import { DestinationBatchRedoScopeSchema, type DestinationBatchJob, type DestinationBatchRedoScope } from '@shared/factory-batch-contracts'
import { RedoGenerationGuidanceSchema, type RedoGenerationGuidance } from '@shared/redo-guidance-contracts'
import type { DestinationBatchRepository } from './contracts'

/** Explicit human redo command; phase invalidation remains repository-owned. */
export class DestinationBatchRedoService {
  constructor(private readonly repository: DestinationBatchRepository, private readonly now: () => Date = () => new Date()) {}

  request(input: { jobId: string; scope: DestinationBatchRedoScope; guidance?: RedoGenerationGuidance; reason?: string; requestedBy?: string }): Promise<DestinationBatchJob> {
    const scope = DestinationBatchRedoScopeSchema.parse(input.scope)
    const guidance = input.guidance ? RedoGenerationGuidanceSchema.parse(input.guidance) : undefined
    if (guidance && guidance.scope !== scope) throw new Error('BATCH_REDO_GUIDANCE_SCOPE_MISMATCH')
    return this.repository.requestRedo({ jobId: input.jobId, scope, guidance, reason: input.reason?.trim() || undefined, requestedBy: input.requestedBy ?? MANUAL_LOCAL_ACTOR_ID, now: this.now() })
  }
}
