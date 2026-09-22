import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { IntelligenceDraft } from '@modules/real-pipeline/ports'
import type { CreateLibraryVersionDraftResult } from '@shared/real-editorial-library-draft-application-contracts'
import type { RealEditorialLibraryVersionDraftApplicationService } from './draft-application-service'

export type BatchLibraryProfile = 'student' | 'adventure'

export interface BatchLibraryCandidateInput {
  executionOwnerId: string
  destination: {
    name: string
    countryCode: string
    destinationType: 'country' | 'region' | 'locality' | 'zone'
  }
  sourceArtifact: {
    id: string
    payloadHash: string
  }
  draft: IntelligenceDraft
  actorId: string
}

export interface BatchLibraryCandidateOrigin {
  libraryEntryId: string
  originHash: string
  reused: boolean
}

export interface BatchLibraryDraftReference {
  libraryEntryId: string
  versionId: string
  revisionId: string
  versionHash: string
  revisionHash: string
  entryReused: boolean
  versionReplayed: boolean
}

export interface BatchLibraryCandidateGateway {
  createCandidate(input: BatchLibraryCandidateInput): Promise<BatchLibraryCandidateOrigin>
}

/**
 * The batch transition creates an immutable origin in the *existing* Library,
 * then uses the normal Library draft operation for version/revision lineage.
 * It never approves or publishes a profile.
 */
export class BatchSharedLibraryTransition {
  constructor(
    private readonly candidates: BatchLibraryCandidateGateway,
    private readonly drafts: Pick<RealEditorialLibraryVersionDraftApplicationService, 'createDraft'>,
  ) {}

  async materialize(input: BatchLibraryCandidateInput): Promise<BatchLibraryDraftReference> {
    const origin = await this.candidates.createCandidate(input)
    const result = await this.drafts.createDraft({
      libraryEntryId: origin.libraryEntryId,
      expectedHeadHash: origin.originHash,
      title: input.draft.title,
      content: input.draft.content,
      changeSummary: `Borrador generado por batch para ${input.draft.profile}.`,
      actorId: input.actorId,
      operationKey: stableHash({
        operation: 'batch-library-create-draft-v1',
        executionOwnerId: input.executionOwnerId,
        profile: input.draft.profile,
        sourceArtifactHash: input.sourceArtifact.payloadHash,
      }),
    })
    return draftReference(origin, result)
  }
}

/** Supabase adapter for the generic, pre-approval Library origin RPC. */
export class SupabaseBatchLibraryCandidateGateway implements BatchLibraryCandidateGateway {
  constructor(private readonly client: SupabaseClient) {}

  async createCandidate(input: BatchLibraryCandidateInput): Promise<BatchLibraryCandidateOrigin> {
    const entryKey = stableHash({
      schema: 'investighost-library-batch-entry-v1',
      executionOwnerId: input.executionOwnerId,
      profile: input.draft.profile,
      sourceArtifactHash: input.sourceArtifact.payloadHash,
    })
    const { data, error } = await this.client.rpc('real_editorial_library_create_batch_candidate', {
      p_execution_owner_id: input.executionOwnerId,
      p_profile: input.draft.profile,
      p_entry_key: entryKey,
      p_source_artifact_id: input.sourceArtifact.id,
      p_destination_name: input.destination.name,
      p_country_code: input.destination.countryCode,
      p_destination_type: input.destination.destinationType,
    })
    if (error || !isRecord(data) || typeof data.libraryEntryId !== 'string' || typeof data.originHash !== 'string' || typeof data.reused !== 'boolean') {
      throw new BatchSharedLibraryTransitionError(
        'BATCH_LIBRARY_CANDIDATE_FAILED',
        error?.message ?? 'La Library no devolvió una transición batch válida.',
      )
    }
    return { libraryEntryId: data.libraryEntryId, originHash: data.originHash, reused: data.reused }
  }
}

export class BatchSharedLibraryTransitionError extends Error {
  constructor(readonly code: 'BATCH_LIBRARY_CANDIDATE_FAILED' | 'BATCH_LIBRARY_DRAFT_FAILED', message: string) {
    super(message)
    this.name = 'BatchSharedLibraryTransitionError'
  }
}

function draftReference(
  origin: BatchLibraryCandidateOrigin,
  result: CreateLibraryVersionDraftResult,
): BatchLibraryDraftReference {
  if (result.status !== 'ok') {
    throw new BatchSharedLibraryTransitionError('BATCH_LIBRARY_DRAFT_FAILED', `${result.code}: ${result.message}`)
  }
  return {
    libraryEntryId: result.receipt.libraryEntryId,
    versionId: result.receipt.versionId,
    revisionId: result.receipt.revisionId,
    versionHash: result.receipt.versionHash,
    revisionHash: result.receipt.revisionHash,
    entryReused: origin.reused,
    versionReplayed: result.operationReplayed,
  }
}

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
