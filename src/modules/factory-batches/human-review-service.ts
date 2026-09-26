import { createHash } from 'node:crypto'
import { MANUAL_LOCAL_ACTOR_ID } from '@modules/editorial-pipeline/manual-runtime'
import {
  RealEditorialLibraryVersioningService,
  type RealEditorialLibraryVersioningReadRepository,
  type RealEditorialLibraryVersioningRepository,
} from '@modules/library-versioning'
import type { DestinationBatchJob, DestinationBatchJobReviewReadModel } from '@shared/factory-batch-contracts'
import type { DestinationBatchRepository } from './contracts'
import { assessStructuredPackageReadiness, type StructuredPackageApprovalRepository } from './structured-package-approval'

/** Coordinates the existing Library human approval commands for a completed
 * batch job. It creates neither a review store nor a delivery. */
export class DestinationBatchHumanReviewService {
  private readonly library: RealEditorialLibraryVersioningService
  private readonly reader: RealEditorialLibraryVersioningReadRepository

  constructor(
    private readonly batches: DestinationBatchRepository,
    repository: RealEditorialLibraryVersioningRepository & RealEditorialLibraryVersioningReadRepository,
    private readonly structuredApprovals?: StructuredPackageApprovalRepository,
  ) { this.library = new RealEditorialLibraryVersioningService(repository); this.reader = repository }

  async approve(jobId: string, expected?: { structuredPackageArtifactId: string; packageId: string }): Promise<DestinationBatchJob> {
    const job = await this.batches.getJob(jobId)
    if (!job) throw new Error('BATCH_REVIEW_JOB_NOT_FOUND')
    if (job.status === 'APPROVED') return job
    const review = await this.batches.readJobForReview(jobId)
    if (!review || job.status !== 'READY_FOR_REVIEW' || !review.student || !review.adventure || !review.visualPackageId || !review.reviewArtifactId) {
      throw new Error('BATCH_REVIEW_APPROVAL_GATE: faltan revisiones, visuales o auto-review requeridos')
    }
    if (this.structuredApprovals) {
      if (!expected || !review.structuredPackage || review.structuredPackageArtifactId !== expected.structuredPackageArtifactId || review.structuredPackage.packageId !== expected.packageId) throw new Error('REVIEWED_PACKAGE_ID_MATCH_REQUIRED')
      const readiness = assessStructuredPackageReadiness(review)
      if (!readiness.ready) throw new Error(`PACKAGE_READINESS_GATE:${readiness.blocking.join(',')}`)
      await this.structuredApprovals.approveStructuredEditorialPackage({
        jobId: job.id, structuredPackageArtifactId: expected.structuredPackageArtifactId,
        packageId: expected.packageId, reviewerId: MANUAL_LOCAL_ACTOR_ID,
      })
      const approved = await this.batches.getJob(job.id)
      if (!approved || approved.status !== 'APPROVED') throw new Error('STRUCTURED_PACKAGE_APPROVAL_NOT_COMMITTED')
      return approved
    }
    if (review.structuredPackage && unresolvedVisualIntentCount(review.structuredPackage) > 0) {
      throw new Error('BATCH_REVIEW_APPROVAL_GATE: el package estructurado conserva visuales sin resolver')
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

function unresolvedVisualIntentCount(value: NonNullable<DestinationBatchJobReviewReadModel['structuredPackage']>): number {
  return value.visualIntents.filter(intent => {
    const student = value.student.document.blocks.some(block => block.type === 'figure' && block.resolution === 'INTENT' && block.visualIntentId === intent.id)
    const hero = value.adventure.document.hero.asset.status === 'INTENT' && value.adventure.document.hero.asset.visualIntentId === intent.id
    const story = value.adventure.document.visualStory.items.some(item => item.asset.status === 'INTENT' && item.asset.visualIntentId === intent.id)
    const place = value.adventure.document.placesToGo.items.some(item => item.asset?.status === 'INTENT' && item.asset.visualIntentId === intent.id)
    return student || hero || story || place
  }).length
}

function operationKey(value: string): string {
  return createHash('sha256').update(`factory-human-review-v1:${value}`).digest('hex')
}
