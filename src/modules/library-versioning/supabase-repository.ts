import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import {
  LibraryVersionDomainErrorCodeSchema,
  LibraryVersionSha256Schema,
  LibraryVersionUuidSchema,
  type LibraryVersionCommandResult,
  type LibraryVersionDomainErrorCode,
} from '@shared/real-editorial-library-contracts'
import {
  LibraryVersioningRepositoryError,
  parseLibraryVersionCommandResult,
  type CurrentApprovedLibraryContent,
  type PreparedCreateLibraryVersionCommand,
  type PreparedDecideLibraryVersionCommand,
  type PreparedReconcileLibraryVersionFindingsCommand,
  type PreparedSaveLibraryVersionRevisionCommand,
  type PreparedSubmitLibraryVersionForReviewCommand,
  type RealEditorialLibraryVersioningRepository,
} from './repository'

type RpcError = { message: string; details?: string; hint?: string; code?: string } | null

const CurrentApprovedLibraryContentSchema = z.object({
  source: z.enum(['origin_v1', 'derived']),
  libraryEntryId: LibraryVersionUuidSchema,
  versionId: LibraryVersionUuidSchema.nullable(),
  versionNumber: z.number().int().positive(),
  revisionId: LibraryVersionUuidSchema.nullable(),
  title: z.string().min(1),
  content: z.string().min(1),
  contentHash: LibraryVersionSha256Schema,
  versionHash: LibraryVersionSha256Schema,
  revisionHash: LibraryVersionSha256Schema.nullable(),
  publicationState: z.literal('unpublished'),
}).strict()

export class SupabaseRealEditorialLibraryVersioningRepository
implements RealEditorialLibraryVersioningRepository {
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
    const { data, error } = await this.client.rpc(
      'real_editorial_library_current_approved',
      { p_library_entry_id: libraryEntryId },
    )
    if (error) throw repositoryError(error)
    return data === null ? null : CurrentApprovedLibraryContentSchema.parse(data)
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
