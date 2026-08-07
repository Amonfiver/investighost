import type { SupabaseClient } from '@supabase/supabase-js'
import {
  CreateLibraryVersionCommandSchema,
  DecideLibraryVersionCommandSchema,
  LibraryVersionCommandResultSchema,
  LibraryVersionUuidSchema,
  ReconcileLibraryVersionFindingsCommandSchema,
  SaveLibraryVersionRevisionCommandSchema,
  SubmitLibraryVersionForReviewCommandSchema,
  type CreateLibraryVersionCommand,
  type DecideLibraryVersionCommand,
  type LibraryVersionCommandResult,
  type LibraryVersionDecisionType,
  type LibraryVersionDomainErrorCode,
  type LibraryVersionFindingInput,
  type ReconcileLibraryVersionFindingsCommand,
  type SaveLibraryVersionRevisionCommand,
  type SubmitLibraryVersionForReviewCommand,
} from '@shared/real-editorial-library-contracts'
import {
  type LibraryVersionDraftOperationReceipt,
} from '@shared/real-editorial-library-draft-application-contracts'
import {
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
import { MANUAL_LOCAL_ACTOR_ID } from '@modules/editorial-pipeline/manual-runtime'
import {
  canonicalizeLibraryAuditText,
  canonicalizeLibraryDocument,
  libraryRequestFingerprint,
} from './canonicalization'

export type LibraryVersioningOperation =
  | 'create_version'
  | 'save_revision'
  | 'reconcile_findings'
  | 'submit_for_review'
  | 'decide_version'

export type LibraryActorAction = 'edit' | 'submit' | LibraryVersionDecisionType

export interface LibraryActorAuthorization {
  actorId: string
  roleSnapshot: string
}

export interface LibraryVersionActorAuthorizer {
  authorize(actorId: string, action: LibraryActorAction): Promise<LibraryActorAuthorization>
}

export class LocalLibraryVersionActorAuthorizer implements LibraryVersionActorAuthorizer {
  async authorize(actorId: string, action: LibraryActorAction): Promise<LibraryActorAuthorization> {
    if (actorId !== MANUAL_LOCAL_ACTOR_ID) {
      throw new LibraryVersioningRepositoryError(
        'ACTOR_NOT_AUTHORIZED',
        `El actor no esta autorizado para ${action}`,
      )
    }
    return { actorId, roleSnapshot: `local_owner:${action}` }
  }
}

interface PreparedCommandBase {
  operationKey: string
  requestPayload: Record<string, unknown>
  requestFingerprint: string
}

export interface PreparedCreateLibraryVersionCommand extends PreparedCommandBase {
  libraryEntryId: string
  expectedHeadHash: string
  canonicalizationContract: string
  contentSchemaContract: string
  title: string
  content: string
  creationReason: string
  actor: LibraryActorAuthorization
}

export interface PreparedSaveLibraryVersionRevisionCommand extends PreparedCommandBase {
  versionId: string
  expectedState: 'draft'
  expectedPreviousRevisionHash: string
  canonicalizationContract: string
  contentSchemaContract: string
  title: string
  content: string
  changeSummary: string
  actor: LibraryActorAuthorization
}

export interface PreparedReconcileLibraryVersionFindingsCommand extends PreparedCommandBase {
  versionId: string
  revisionId: string
  expectedState: 'draft'
  expectedRevisionHash: string
  expectedTraceabilityHash: string
  finding: LibraryVersionFindingInput
  actor: LibraryActorAuthorization
}

export interface PreparedSubmitLibraryVersionForReviewCommand extends PreparedCommandBase {
  versionId: string
  revisionId: string
  expectedState: 'draft'
  expectedRevisionHash: string
  expectedTraceabilityHash: string
  reason: string
  actor: LibraryActorAuthorization
}

export interface PreparedDecideLibraryVersionCommand extends PreparedCommandBase {
  versionId: string
  revisionId: string
  decisionType: Exclude<LibraryVersionDecisionType, 'submit_for_review'>
  expectedPreviousState: 'draft' | 'ready_for_review'
  expectedDecisionTargetHash: string
  reason: string
  affectedFindingKeys: string[]
  changeInstructions: string[]
  acceptedRiskFindingKeys: string[]
  separationOfDutiesException: boolean
  separationOfDutiesReason: string | null
  actor: LibraryActorAuthorization
}

export interface RealEditorialLibraryVersioningRepository {
  createVersion(command: PreparedCreateLibraryVersionCommand): Promise<LibraryVersionCommandResult>
  saveRevision(command: PreparedSaveLibraryVersionRevisionCommand): Promise<LibraryVersionCommandResult>
  reconcileFindings(
    command: PreparedReconcileLibraryVersionFindingsCommand,
  ): Promise<LibraryVersionCommandResult>
  submitForReview(
    command: PreparedSubmitLibraryVersionForReviewCommand,
  ): Promise<LibraryVersionCommandResult>
  decideVersion(command: PreparedDecideLibraryVersionCommand): Promise<LibraryVersionCommandResult>
  getCurrentApproved(libraryEntryId: string): Promise<CurrentApprovedLibraryContent | null>
}

export interface RealEditorialLibraryVersioningReadRepository {
  getVersioningSummary(libraryEntryId: string): Promise<LibraryEntryVersioningSummary>
  listVersions(libraryEntryId: string): Promise<LibraryVersionListItem[]>
  getVersionDetail(versionId: string): Promise<LibraryVersionDetail>
  listVersionRevisions(versionId: string): Promise<LibraryVersionRevisionDetail[]>
  getVersionRevision(versionId: string, revisionId: string): Promise<LibraryVersionRevisionDetail>
  listVersionFindingHistory(versionId: string): Promise<LibraryVersionFindingHistoryItem[]>
  getEffectiveVersionFindings(
    versionId: string,
    revisionId?: string,
  ): Promise<EffectiveLibraryVersionFindings>
  listVersionDecisions(versionId: string): Promise<LibraryVersionDecisionDetail[]>
  getVersionStateSnapshot(versionId: string): Promise<LibraryVersionStateReadSnapshot>
  getCurrentApprovedVersion(libraryEntryId: string): Promise<CurrentApprovedLibraryContent>
  getVersionTimeline(libraryEntryId: string): Promise<LibraryVersionTimeline>
}

export interface RealEditorialLibraryDraftOperationReceiptRepository {
  getDraftOperationReceipt(
    operationKey: string,
  ): Promise<LibraryVersionDraftOperationReceipt | null>
}

export class LibraryVersioningRepositoryError extends Error {
  constructor(
    readonly code: LibraryVersionDomainErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'LibraryVersioningRepositoryError'
  }
}

export class RealEditorialLibraryVersioningService {
  constructor(
    private readonly repository: RealEditorialLibraryVersioningRepository,
    private readonly actors: LibraryVersionActorAuthorizer = new LocalLibraryVersionActorAuthorizer(),
  ) {}

  async createVersion(candidate: CreateLibraryVersionCommand): Promise<LibraryVersionCommandResult> {
    return this.repository.createVersion(
      await prepareCreateLibraryVersionCommand(candidate, this.actors),
    )
  }

  async saveRevision(
    candidate: SaveLibraryVersionRevisionCommand,
  ): Promise<LibraryVersionCommandResult> {
    return this.repository.saveRevision(
      await prepareSaveLibraryVersionRevisionCommand(candidate, this.actors),
    )
  }

  async reconcileFindings(
    candidate: ReconcileLibraryVersionFindingsCommand,
  ): Promise<LibraryVersionCommandResult> {
    const command = ReconcileLibraryVersionFindingsCommandSchema.parse(candidate)
    const actor = await this.actors.authorize(command.createdByActorId, 'edit')
    const finding = canonicalFinding(command.finding)
    return this.repository.reconcileFindings(prepare(
      'reconcile_findings',
      command.operationKey,
      {
        versionId: command.versionId,
        revisionId: command.revisionId,
        expectedState: command.expectedState,
        expectedRevisionHash: command.expectedRevisionHash,
        expectedTraceabilityHash: command.expectedTraceabilityHash,
        finding,
        actor,
      },
    ))
  }

  async submitForReview(
    candidate: SubmitLibraryVersionForReviewCommand,
  ): Promise<LibraryVersionCommandResult> {
    const command = SubmitLibraryVersionForReviewCommandSchema.parse(candidate)
    const actor = await this.actors.authorize(command.actorId, 'submit')
    return this.repository.submitForReview(prepare(
      'submit_for_review',
      command.operationKey,
      {
        versionId: command.versionId,
        revisionId: command.revisionId,
        expectedState: command.expectedState,
        expectedRevisionHash: command.expectedRevisionHash,
        expectedTraceabilityHash: command.expectedTraceabilityHash,
        reason: canonicalizeLibraryAuditText(command.reason),
        actor,
      },
    ))
  }

  async decideVersion(
    candidate: DecideLibraryVersionCommand,
  ): Promise<LibraryVersionCommandResult> {
    const command = DecideLibraryVersionCommandSchema.parse(candidate)
    const actor = await this.actors.authorize(command.actorId, command.decisionType)
    return this.repository.decideVersion(prepare(
      'decide_version',
      command.operationKey,
      {
        versionId: command.versionId,
        revisionId: command.revisionId,
        decisionType: command.decisionType,
        expectedPreviousState: command.expectedPreviousState,
        expectedDecisionTargetHash: command.expectedDecisionTargetHash,
        reason: canonicalizeLibraryAuditText(command.reason),
        affectedFindingKeys: [...command.affectedFindingKeys].sort(),
        changeInstructions: command.changeInstructions.map(canonicalizeLibraryAuditText),
        acceptedRiskFindingKeys: [...command.acceptedRiskFindingKeys].sort(),
        separationOfDutiesException: command.separationOfDutiesException,
        separationOfDutiesReason: command.separationOfDutiesReason === null
          ? null
          : canonicalizeLibraryAuditText(command.separationOfDutiesReason),
        actor,
      },
    ))
  }

  async getCurrentApproved(libraryEntryId: string): Promise<CurrentApprovedLibraryContent | null> {
    return this.repository.getCurrentApproved(libraryEntryId)
  }
}

export async function prepareCreateLibraryVersionCommand(
  candidate: CreateLibraryVersionCommand,
  actors: LibraryVersionActorAuthorizer = new LocalLibraryVersionActorAuthorizer(),
): Promise<PreparedCreateLibraryVersionCommand> {
  const command = CreateLibraryVersionCommandSchema.parse(candidate)
  const document = canonicalizeLibraryDocument(command.title, command.content)
  const actor = await actors.authorize(command.createdByActorId, 'edit')
  return prepare<PreparedCreateLibraryVersionCommand>('create_version', command.operationKey, {
    libraryEntryId: command.libraryEntryId,
    expectedHeadHash: command.expectedHeadHash,
    canonicalizationContract: command.canonicalizationContract,
    contentSchemaContract: command.contentSchemaContract,
    ...document,
    creationReason: canonicalizeLibraryAuditText(command.creationReason),
    actor,
  })
}

export async function prepareSaveLibraryVersionRevisionCommand(
  candidate: SaveLibraryVersionRevisionCommand,
  actors: LibraryVersionActorAuthorizer = new LocalLibraryVersionActorAuthorizer(),
): Promise<PreparedSaveLibraryVersionRevisionCommand> {
  const command = SaveLibraryVersionRevisionCommandSchema.parse(candidate)
  const document = canonicalizeLibraryDocument(command.title, command.content)
  const actor = await actors.authorize(command.createdByActorId, 'edit')
  return prepare<PreparedSaveLibraryVersionRevisionCommand>(
    'save_revision',
    command.operationKey,
    {
      versionId: command.versionId,
      expectedState: command.expectedState,
      expectedPreviousRevisionHash: command.expectedPreviousRevisionHash,
      canonicalizationContract: command.canonicalizationContract,
      contentSchemaContract: command.contentSchemaContract,
      ...document,
      changeSummary: canonicalizeLibraryAuditText(command.changeSummary),
      actor,
    },
  )
}

export class RealEditorialLibraryVersioningReadService {
  constructor(private readonly repository: RealEditorialLibraryVersioningReadRepository) {}

  getVersioningSummary(libraryEntryId: string): Promise<LibraryEntryVersioningSummary> {
    return this.repository.getVersioningSummary(LibraryVersionUuidSchema.parse(libraryEntryId))
  }

  listVersions(libraryEntryId: string): Promise<LibraryVersionListItem[]> {
    return this.repository.listVersions(LibraryVersionUuidSchema.parse(libraryEntryId))
  }

  getVersionDetail(versionId: string): Promise<LibraryVersionDetail> {
    return this.repository.getVersionDetail(LibraryVersionUuidSchema.parse(versionId))
  }

  listVersionRevisions(versionId: string): Promise<LibraryVersionRevisionDetail[]> {
    return this.repository.listVersionRevisions(LibraryVersionUuidSchema.parse(versionId))
  }

  getVersionRevision(versionId: string, revisionId: string): Promise<LibraryVersionRevisionDetail> {
    return this.repository.getVersionRevision(
      LibraryVersionUuidSchema.parse(versionId),
      LibraryVersionUuidSchema.parse(revisionId),
    )
  }

  listVersionFindingHistory(versionId: string): Promise<LibraryVersionFindingHistoryItem[]> {
    return this.repository.listVersionFindingHistory(LibraryVersionUuidSchema.parse(versionId))
  }

  getEffectiveVersionFindings(
    versionId: string,
    revisionId?: string,
  ): Promise<EffectiveLibraryVersionFindings> {
    return this.repository.getEffectiveVersionFindings(
      LibraryVersionUuidSchema.parse(versionId),
      revisionId === undefined ? undefined : LibraryVersionUuidSchema.parse(revisionId),
    )
  }

  listVersionDecisions(versionId: string): Promise<LibraryVersionDecisionDetail[]> {
    return this.repository.listVersionDecisions(LibraryVersionUuidSchema.parse(versionId))
  }

  getVersionStateSnapshot(versionId: string): Promise<LibraryVersionStateReadSnapshot> {
    return this.repository.getVersionStateSnapshot(LibraryVersionUuidSchema.parse(versionId))
  }

  getCurrentApprovedVersion(libraryEntryId: string): Promise<CurrentApprovedLibraryContent> {
    return this.repository.getCurrentApprovedVersion(
      LibraryVersionUuidSchema.parse(libraryEntryId),
    )
  }

  getVersionTimeline(libraryEntryId: string): Promise<LibraryVersionTimeline> {
    return this.repository.getVersionTimeline(LibraryVersionUuidSchema.parse(libraryEntryId))
  }
}

function prepare<T extends PreparedCommandBase>(
  operation: LibraryVersioningOperation,
  operationKey: string,
  semantic: Omit<T, keyof PreparedCommandBase>,
): T {
  const requestPayload = semantic as Record<string, unknown>
  return {
    ...semantic,
    operationKey,
    requestPayload,
    requestFingerprint: libraryRequestFingerprint(operation, requestPayload),
  } as T
}

function canonicalFinding(finding: LibraryVersionFindingInput): LibraryVersionFindingInput {
  return {
    ...finding,
    findingKey: canonicalizeLibraryAuditText(finding.findingKey),
    sourceFindingId: canonicalizeLibraryAuditText(finding.sourceFindingId),
    subjectText: canonicalizeLibraryAuditText(finding.subjectText),
    editorDeclaration: canonicalizeLibraryAuditText(finding.editorDeclaration),
    justification: finding.justification
      ? canonicalizeLibraryAuditText(finding.justification)
      : '',
    claimIds: [...finding.claimIds].sort(),
    evidenceReferences: [...finding.evidenceReferences].sort((left, right) =>
      `${left.kind}:${left.referenceId}:${left.locator}`.localeCompare(
        `${right.kind}:${right.referenceId}:${right.locator}`,
      )),
    sourceIds: [...finding.sourceIds].sort(),
  }
}

export function parseLibraryVersionCommandResult(value: unknown): LibraryVersionCommandResult {
  return LibraryVersionCommandResultSchema.parse(value)
}

export type LibraryVersioningSupabaseClient = Pick<SupabaseClient, 'rpc'>
