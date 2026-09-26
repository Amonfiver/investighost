import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import {
  AdventurePackageV1Schema,
  StudentDocumentV1Schema,
  StructuredEditorialPackageV1Schema,
  type StructuredEditorialPackageV1,
} from '@shared/structured-editorial-package-contracts'
import type { DestinationBatchJobReviewReadModel } from '@shared/factory-batch-contracts'

export type StructuredPackageReadiness = {
  ready: boolean
  blocking: string[]
  nonBlocking: string[]
}

/** Pure gate used by the Desk and by the durable command.  Optional figures
 * and absent Place categories are warnings, never quota requirements. */
export function assessStructuredPackageReadiness(review: DestinationBatchJobReviewReadModel): StructuredPackageReadiness {
  const blocking: string[] = []
  const nonBlocking: string[] = [...review.warnings]
  const value = review.structuredPackage
  if (!value || !review.structuredPackageArtifactId || !review.student || !review.adventure || !review.visualPackageId || !review.reviewArtifactId) {
    blocking.push('PACKAGE_SNAPSHOT_REQUIRED')
    return { ready: false, blocking, nonBlocking }
  }
  try { StudentDocumentV1Schema.parse(value.student.document); AdventurePackageV1Schema.parse(value.adventure.document) } catch { blocking.push('STRUCTURED_DOCUMENT_INVALID') }
  if (value.student.libraryRevision.revisionId !== review.student.revisionId || value.adventure.libraryRevision.revisionId !== review.adventure.revisionId) blocking.push('MIXED_REVISIONS_BLOCKED')
  if (value.state !== 'PACKAGE_READY_FOR_REVIEW') blocking.push('PACKAGE_NOT_READY_FOR_REVIEW')
  if (value.adventure.document.hero.asset.status !== 'RESOLVED') blocking.push('MANDATORY_HERO_UNRESOLVED')
  const resolution = value.visualResolution
  if (!resolution || resolution.unresolved.length > 0) blocking.push('UNRESOLVED_MANDATORY_VISUALS')
  if (resolution && resolution.resolved.some(slot => !slot.alt || slot.rightsStatus !== 'APPROVED_FOR_PUBLIC_USE')) blocking.push('VISUAL_RIGHTS_OR_ALT_NOT_APPROVED')
  if (!autoReviewPassed(review.reviewSummary)) blocking.push('AUTO_REVIEW_REQUIRED')
  for (const block of value.student.document.blocks) if (block.type === 'figure' && block.resolution === 'INTENT') nonBlocking.push(`OPTIONAL_STUDENT_FIGURE_UNRESOLVED:${block.visualIntentId}`)
  return { ready: blocking.length === 0, blocking: [...new Set(blocking)], nonBlocking: [...new Set(nonBlocking)] }
}

function autoReviewPassed(review: Record<string, unknown> | null): boolean {
  return review?.outcome === 'passed' || review?.outcome === 'passed_with_warnings'
}

export const StructuredPackageApprovalCommandSchema = z.object({
  jobId: z.string().uuid(),
  structuredPackageArtifactId: z.string().uuid(),
  packageId: z.string().uuid(),
  reviewerId: z.string().uuid(),
  reason: z.string().trim().max(2000).optional(),
}).strict()
export type StructuredPackageApprovalCommand = z.infer<typeof StructuredPackageApprovalCommandSchema>

export const StructuredPackageApprovalReceiptSchema = z.object({
  approvalId: z.string().uuid(), packageId: z.string().uuid(), structuredPackageArtifactId: z.string().uuid(),
  studentRevisionId: z.string().uuid(), adventureRevisionId: z.string().uuid(), visualPackageId: z.string().uuid(),
  approvedAt: z.string().datetime({ offset: true }), reused: z.boolean(),
}).strict()
export type StructuredPackageApprovalReceipt = z.infer<typeof StructuredPackageApprovalReceiptSchema>

export interface StructuredPackageApprovalRepository {
  approveStructuredEditorialPackage(command: StructuredPackageApprovalCommand): Promise<StructuredPackageApprovalReceipt>
}

/** The RPC owns the transaction: both Library promotions, immutable package
 * decision and job status either commit together or roll back together. */
export class SupabaseStructuredPackageApprovalRepository implements StructuredPackageApprovalRepository {
  constructor(private readonly client: Pick<SupabaseClient, 'rpc'>) {}
  async approveStructuredEditorialPackage(input: StructuredPackageApprovalCommand): Promise<StructuredPackageApprovalReceipt> {
    const command = StructuredPackageApprovalCommandSchema.parse(input)
    const { data, error } = await this.client.rpc('factory_approve_structured_editorial_package', {
      p_job_id: command.jobId, p_structured_artifact_id: command.structuredPackageArtifactId,
      p_package_id: command.packageId, p_reviewer_id: command.reviewerId, p_reason: command.reason ?? null,
    })
    if (error) throw new Error(`STRUCTURED_PACKAGE_APPROVAL_FAILED:${error.message}`)
    return StructuredPackageApprovalReceiptSchema.parse(data)
  }
}

export function assertApprovedPackageSnapshot(value: StructuredEditorialPackageV1): StructuredEditorialPackageV1 {
  const packageValue = StructuredEditorialPackageV1Schema.parse(value)
  if (packageValue.state !== 'PACKAGE_READY_FOR_REVIEW' || packageValue.adventure.document.hero.asset.status !== 'RESOLVED' || packageValue.visualResolution?.unresolved.length) throw new Error('PACKAGE_READINESS_REQUIRED')
  return packageValue
}
