import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import {
  LibraryVersionDraftOperationReceiptSchema,
  type LibraryVersionDraftOperationReceipt,
} from '@shared/real-editorial-library-draft-application-contracts'
import {
  LibraryVersionDomainErrorCodeSchema,
  LibraryVersionOperationKeySchema,
  LibraryVersionUuidSchema,
  type LibraryVersionCommandResult,
  type LibraryVersionDomainErrorCode,
} from '@shared/real-editorial-library-contracts'
import {
  CurrentApprovedLibraryContentSchema,
  EffectiveLibraryVersionFindingsSchema,
  LibraryEntryVersioningSummarySchema,
  LibraryVersionDecisionDetailSchema,
  LibraryVersionDetailSchema,
  LibraryVersionFindingHistoryItemSchema,
  LibraryVersionListItemSchema,
  LibraryVersionRevisionDetailSchema,
  LibraryVersionStateReadSnapshotSchema,
  LibraryVersionTimelineSchema,
  type CurrentApprovedLibraryContent,
  type EffectiveLibraryVersionFindings,
  type LibraryEntryVersioningSummary,
  type LibraryVersionDecisionDetail,
  type LibraryVersionDetail,
  type LibraryVersionFindingHistoryItem,
  type LibraryVersionListItem,
  type LibraryVersionRevisionDetail,
  type LibraryVersionStateReadSnapshot,
  type LibraryVersionTimeline,
} from '@shared/real-editorial-library-read-contracts'
import {
  LibraryVersioningRepositoryError,
  parseLibraryVersionCommandResult,
  type PreparedCreateLibraryVersionCommand,
  type PreparedDecideLibraryVersionCommand,
  type PreparedReconcileLibraryVersionFindingsCommand,
  type PreparedSaveLibraryVersionRevisionCommand,
  type PreparedSubmitLibraryVersionForReviewCommand,
  type RealEditorialLibraryDraftOperationReceiptRepository,
  type RealEditorialLibraryVersioningReadRepository,
  type RealEditorialLibraryVersioningRepository,
} from './repository'

type RpcError = { message: string; details?: string; hint?: string; code?: string } | null

export class SupabaseRealEditorialLibraryVersioningRepository
implements RealEditorialLibraryVersioningRepository,
RealEditorialLibraryVersioningReadRepository,
RealEditorialLibraryDraftOperationReceiptRepository {
  constructor(private readonly client: SupabaseClient) {}

  createVersion(
    command: PreparedCreateLibraryVersionCommand,
  ): Promise<LibraryVersionCommandResult> {
    return this.command('real_editorial_library_create_version', command)
  }

  saveRevision(
    command: PreparedSaveLibraryVersionRevisionCommand,
  ): Promise<LibraryVersionCommandResult> {
    return this.command('real_editorial_library_save_revision', command)
  }

  reconcileFindings(
    command: PreparedReconcileLibraryVersionFindingsCommand,
  ): Promise<LibraryVersionCommandResult> {
    return this.command('real_editorial_library_reconcile_finding', command)
  }

  submitForReview(
    command: PreparedSubmitLibraryVersionForReviewCommand,
  ): Promise<LibraryVersionCommandResult> {
    return this.command('real_editorial_library_submit_for_review', command)
  }

  decideVersion(
    command: PreparedDecideLibraryVersionCommand,
  ): Promise<LibraryVersionCommandResult> {
    return this.command('real_editorial_library_decide_version', command)
  }

  async getCurrentApproved(
    libraryEntryId: string,
  ): Promise<CurrentApprovedLibraryContent | null> {
    return this.getCurrentApprovedVersion(libraryEntryId)
  }

  getVersioningSummary(libraryEntryId: string): Promise<LibraryEntryVersioningSummary> {
    return this.readRpc(
      'real_editorial_library_versioning_summary',
      { p_library_entry_id: parseUuid(libraryEntryId) },
      LibraryEntryVersioningSummarySchema,
    )
  }

  listVersions(libraryEntryId: string): Promise<LibraryVersionListItem[]> {
    return this.readRpc(
      'real_editorial_library_list_versions',
      { p_library_entry_id: parseUuid(libraryEntryId) },
      LibraryVersionListItemSchema.array(),
    )
  }

  getVersionDetail(versionId: string): Promise<LibraryVersionDetail> {
    return this.readRpc(
      'real_editorial_library_version_detail',
      { p_version_id: parseUuid(versionId) },
      LibraryVersionDetailSchema,
    )
  }

  listVersionRevisions(versionId: string): Promise<LibraryVersionRevisionDetail[]> {
    return this.readRpc(
      'real_editorial_library_list_revisions',
      { p_version_id: parseUuid(versionId) },
      LibraryVersionRevisionDetailSchema.array(),
    )
  }

  getVersionRevision(
    versionId: string,
    revisionId: string,
  ): Promise<LibraryVersionRevisionDetail> {
    return this.readRpc(
      'real_editorial_library_version_revision',
      { p_version_id: parseUuid(versionId), p_revision_id: parseUuid(revisionId) },
      LibraryVersionRevisionDetailSchema,
    )
  }

  listVersionFindingHistory(versionId: string): Promise<LibraryVersionFindingHistoryItem[]> {
    return this.readRpc(
      'real_editorial_library_list_finding_history',
      { p_version_id: parseUuid(versionId) },
      LibraryVersionFindingHistoryItemSchema.array(),
    )
  }

  getEffectiveVersionFindings(
    versionId: string,
    revisionId?: string,
  ): Promise<EffectiveLibraryVersionFindings> {
    return this.readRpc(
      'real_editorial_library_effective_findings',
      {
        p_version_id: parseUuid(versionId),
        p_revision_id: revisionId === undefined ? null : parseUuid(revisionId),
      },
      EffectiveLibraryVersionFindingsSchema,
    )
  }

  listVersionDecisions(versionId: string): Promise<LibraryVersionDecisionDetail[]> {
    return this.readRpc(
      'real_editorial_library_list_decisions',
      { p_version_id: parseUuid(versionId) },
      LibraryVersionDecisionDetailSchema.array(),
    )
  }

  getVersionStateSnapshot(versionId: string): Promise<LibraryVersionStateReadSnapshot> {
    return this.readRpc(
      'real_editorial_library_state_snapshot',
      { p_version_id: parseUuid(versionId) },
      LibraryVersionStateReadSnapshotSchema,
    )
  }

  getCurrentApprovedVersion(libraryEntryId: string): Promise<CurrentApprovedLibraryContent> {
    return this.readRpc(
      'real_editorial_library_current_approved_detail',
      { p_library_entry_id: parseUuid(libraryEntryId) },
      CurrentApprovedLibraryContentSchema,
    )
  }

  getVersionTimeline(libraryEntryId: string): Promise<LibraryVersionTimeline> {
    return this.readRpc(
      'real_editorial_library_timeline',
      { p_library_entry_id: parseUuid(libraryEntryId) },
      LibraryVersionTimelineSchema,
    )
  }

  async getDraftOperationReceipt(
    operationKey: string,
  ): Promise<LibraryVersionDraftOperationReceipt | null> {
    const parsedOperationKey = LibraryVersionOperationKeySchema.parse(operationKey)
    const { data, error } = await this.client.rpc(
      'real_editorial_library_draft_operation_receipt',
      { p_operation_key: parsedOperationKey },
    )
    if (error) throw repositoryError(error)
    return data === null ? null : LibraryVersionDraftOperationReceiptSchema.parse(data)
  }

  private async command(
    functionName: string,
    command: {
      operationKey: string
      requestPayload: Record<string, unknown>
      requestFingerprint: string
      actor: { actorId: string; roleSnapshot: string }
    },
  ): Promise<LibraryVersionCommandResult> {
    const pCommand = {
      ...command.requestPayload,
      operationKey: command.operationKey,
      requestFingerprint: command.requestFingerprint,
      actorRoleSnapshot: command.actor.roleSnapshot,
    }
    const { data, error } = await this.client.rpc(functionName, { p_command: pCommand })
    if (!error) return parseLibraryVersionCommandResult(data)
    const mapped = repositoryError(error)
    return {
      status: 'error',
      code: mapped.code,
      message: mapped.message,
      retryable: [
        'STALE_REVISION', 'STALE_VERSION_STATE', 'STALE_DECISION_TARGET',
      ].includes(mapped.code),
      operationKey: command.operationKey,
    }
  }

  private async readRpc<T>(
    functionName: string,
    parameters: Record<string, string | null>,
    schema: z.ZodType<T>,
  ): Promise<T> {
    const { data, error } = await this.client.rpc(functionName, parameters)
    if (error) throw repositoryError(error)
    return schema.parse(data)
  }
}

function parseUuid(value: string): string {
  return LibraryVersionUuidSchema.parse(value)
}

function repositoryError(error: Exclude<RpcError, null>): LibraryVersioningRepositoryError {
  const message = [error.message, error.details, error.hint].filter(Boolean).join(' ')
  const code = LibraryVersionDomainErrorCodeSchema.options.find(candidate =>
    message.includes(candidate),
  ) ?? mapPostgresCode(error.code)
  return new LibraryVersioningRepositoryError(code, message || 'Fallo de persistencia', error)
}

function mapPostgresCode(code?: string): LibraryVersionDomainErrorCode {
  if (code === '23505') return 'IDEMPOTENCY_CONFLICT'
  if (code === '23503') return 'ORIGIN_REFERENCE_INVALID'
  return 'PERSISTENCE_ERROR'
}
