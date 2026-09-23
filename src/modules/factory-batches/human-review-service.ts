import { createHash } from 'node:crypto'
import { MANUAL_LOCAL_ACTOR_ID } from '@modules/editorial-pipeline/manual-runtime'
import {
  RealEditorialLibraryVersioningService,
  type RealEditorialLibraryVersioningReadRepository,
  type RealEditorialLibraryVersioningRepository,
} from '@modules/library-versioning'
import type { DestinationBatchJob } from '@shared/factory-batch-contracts'
import type { DestinationBatchRepository } from './contracts'

/** Coordinates the existing Library human approval commands for a completed
 * batch job. It creates neither a review store nor a delivery. */
export class DestinationBatchHumanReviewService {
  private readonly library: RealEditorialLibraryVersioningService
  private readonly reader: RealEditorialLibraryVersioningReadRepository

  constructor(
    private readonly batches: DestinationBatchRepository,
    repository: RealEditorialLibraryVersioningRepository & RealEditorialLibraryVersioningReadRepository,
  ) { this.library = new RealEditorialLibraryVersioningService(repository); this.reader = repository }

  async approve(jobId: string): Promise<DestinationBatchJob> {
    const job = await this.batches.getJob(jobId)
    if (!job) throw new Error('BATCH_REVIEW_JOB_NOT_FOUND')
    if (job.status === 'APPROVED') return job
    const review = await this.batches.readJobForReview(jobId)
    if (!review || job.status !== 'READY_FOR_REVIEW' || !review.student || !review.adventure || !review.visualPackageId || !review.reviewArtifactId) {
      throw new Error('BATCH_REVIEW_APPROVAL_GATE: faltan revisiones, visuales o auto-review requeridos')
    }
    await Promise.all([this.approveRevision(review.student), this.approveRevision(review.adventure)])
    return this.batches.approveReadyJob(job.id, new Date())
  }

  private async approveRevision(reference: { libraryEntryId: string; versionId: string; revisionId: string }) {
    let detail = await this.reader.getVersionDetail(reference.versionId)
    if (detail.currentRevision.id !== reference.revisionId) throw new Error('BATCH_REVIEW_STALE_REVISION')
    if (detail.state.effectiveState === 'draft') {
      const submitted = await this.library.submitForReview({
        versionId: reference.versionId, revisionId: reference.revisionId, expectedState: 'draft',
        expectedRevisionHash: detail.currentRevision.revisionHash,
        expectedTraceabilityHash: detail.effectiveFindings.traceabilityHash,
        reason: 'Revisión humana de lote completada.', actorId: MANUAL_LOCAL_ACTOR_ID,
        operationKey: operationKey(`submit:${reference.versionId}:${reference.revisionId}`),
      })
      if (submitted.status !== 'ok') throw new Error(`BATCH_REVIEW_SUBMIT_FAILED:${submitted.code}`)
      detail = await this.reader.getVersionDetail(reference.versionId)
    }
    if (detail.state.effectiveState !== 'ready_for_review' || !detail.state.aggregateHash) throw new Error('BATCH_REVIEW_NOT_READY')
    const approved = await this.library.decideVersion({
      versionId: reference.versionId, revisionId: reference.revisionId, decisionType: 'approve', expectedPreviousState: 'ready_for_review',
      expectedDecisionTargetHash: detail.state.aggregateHash, reason: 'Aprobación humana del destino en mesa de lote.', actorId: MANUAL_LOCAL_ACTOR_ID,
      affectedFindingKeys: [], changeInstructions: [], acceptedRiskFindingKeys: [], separationOfDutiesException: true,
      separationOfDutiesReason: 'El propietario local actúa como revisor humano de este entorno local.',
      operationKey: operationKey(`approve:${reference.versionId}:${reference.revisionId}`),
    })
    if (approved.status !== 'ok') throw new Error(`BATCH_REVIEW_APPROVE_FAILED:${approved.code}`)
  }
}

function operationKey(value: string): string {
  return createHash('sha256').update(`factory-human-review-v1:${value}`).digest('hex')
}
