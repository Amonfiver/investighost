import { z } from 'zod'
import {
  CreateLibraryVersionDraftCommandSchema,
  CreateLibraryVersionDraftResultSchema,
  LibraryVersionDraftApplicationErrorSchema,
  LibraryVersionDraftOperationReceiptSchema,
  RecoverLibraryVersionOperationCommandSchema,
  RecoverLibraryVersionOperationResultSchema,
  SaveLibraryVersionDraftCommandSchema,
  SaveLibraryVersionDraftResultSchema,
  type CreateLibraryVersionDraftResult,
  type LibraryVersionDraftApplicationError,
  type LibraryVersionDraftApplicationWarning,
  type LibraryVersionDraftOperation,
  type LibraryVersionDraftOperationReceipt,
  type RecoverLibraryVersionOperationResult,
  type SaveLibraryVersionDraftResult,
} from '@shared/real-editorial-library-draft-application-contracts'
import {
  REAL_EDITORIAL_LIBRARY_CANONICALIZATION_CONTRACT,
  REAL_EDITORIAL_LIBRARY_CONTENT_SCHEMA_CONTRACT,
  type LibraryVersionCommandResult,
  type LibraryVersionDomainErrorCode,
} from '@shared/real-editorial-library-contracts'
import {
  canonicalizeLibraryAuditText,
  canonicalizeLibraryDocument,
  LibraryCanonicalizationError,
} from './canonicalization'
import {
  LibraryVersioningRepositoryError,
  LocalLibraryVersionActorAuthorizer,
  prepareCreateLibraryVersionCommand,
  prepareSaveLibraryVersionRevisionCommand,
  type LibraryVersionActorAuthorizer,
  type PreparedCreateLibraryVersionCommand,
  type PreparedSaveLibraryVersionRevisionCommand,
  type RealEditorialLibraryDraftOperationReceiptRepository,
  type RealEditorialLibraryVersioningReadRepository,
  type RealEditorialLibraryVersioningRepository,
} from './repository'

type ApplicationOperation = 'create_draft' | 'save_draft' | 'recover_operation'
type ApplicationErrorCode = LibraryVersionDomainErrorCode | 'VALIDATION_ERROR'

export interface LibraryVersionDraftApplicationLogEvent {
  event: 'library_version_draft_application'
  operation: ApplicationOperation
  operationKeyPrefix: string | null
  targetId: string | null
  outcome: 'ok' | 'confirmed' | 'not_found' | 'error'
  errorCode: ApplicationErrorCode | null
  durationMs: number
}

export interface LibraryVersionDraftApplicationLogger {
  info(event: LibraryVersionDraftApplicationLogEvent): void
  warn(event: LibraryVersionDraftApplicationLogEvent): void
}

export class ConsoleLibraryVersionDraftApplicationLogger
implements LibraryVersionDraftApplicationLogger {
  info(event: LibraryVersionDraftApplicationLogEvent): void {
    console.info('[LibraryVersionDraft]', event)
  }

  warn(event: LibraryVersionDraftApplicationLogEvent): void {
    console.warn('[LibraryVersionDraft]', event)
  }
}

class LibraryVersionDraftIntegrityError extends Error {
  constructor(readonly code: Extract<ApplicationErrorCode, 'HASH_MISMATCH' | 'INVALID_VERSION_HISTORY'>) {
    super(code)
    this.name = 'LibraryVersionDraftIntegrityError'
  }
}

export class RealEditorialLibraryVersionDraftApplicationService {
  constructor(
    private readonly writes: RealEditorialLibraryVersioningRepository,
    private readonly reads: RealEditorialLibraryVersioningReadRepository,
    private readonly receipts: RealEditorialLibraryDraftOperationReceiptRepository,
    private readonly actors: LibraryVersionActorAuthorizer =
      new LocalLibraryVersionActorAuthorizer(),
    private readonly logger: LibraryVersionDraftApplicationLogger =
      new ConsoleLibraryVersionDraftApplicationLogger(),
  ) {}

  async createDraft(candidate: unknown): Promise<CreateLibraryVersionDraftResult> {
    const startedAt = Date.now()
    try {
      const input = CreateLibraryVersionDraftCommandSchema.parse(candidate)
      const canonical = canonicalInput(input.title, input.content, input.changeSummary)
      const prepared = await prepareCreateLibraryVersionCommand({
        libraryEntryId: input.libraryEntryId,
        expectedHeadHash: input.expectedHeadHash,
        canonicalizationContract: REAL_EDITORIAL_LIBRARY_CANONICALIZATION_CONTRACT,
        contentSchemaContract: REAL_EDITORIAL_LIBRARY_CONTENT_SCHEMA_CONTRACT,
        title: canonical.title,
        content: canonical.content,
        creationReason: canonical.changeSummary,
        createdByActorId: input.actorId,
        operationKey: input.operationKey,
      }, this.actors)

      const existing = await this.receipts.getDraftOperationReceipt(input.operationKey)
      if (existing !== null) {
        const conflict = receiptConflict(existing, 'create_draft', prepared, input.actorId)
        if (conflict !== null) return this.finish(
          this.failure('create_draft', conflict, input.operationKey),
          startedAt, input.operationKey, input.libraryEntryId,
        )
        const replayed = await this.createProjection(existing, true, canonical.warnings)
        return this.finish(replayed, startedAt, input.operationKey, input.libraryEntryId)
      }

      const commandResult = await this.writes.createVersion(prepared)
      if (commandResult.status === 'error') return this.finish(
        this.commandFailure('create_draft', commandResult),
        startedAt, input.operationKey, input.libraryEntryId,
      )
      if (commandResult.operation !== 'create_version') {
        throw new LibraryVersionDraftIntegrityError('INVALID_VERSION_HISTORY')
      }
      const receipt = await this.requireReceipt(input.operationKey)
      assertReceiptMatchesCommand(receipt, 'create_draft', prepared, commandResult, input.actorId)
      const result = await this.createProjection(
        receipt,
        commandResult.reused,
        canonical.warnings,
        !commandResult.reused,
      )
      return this.finish(result, startedAt, input.operationKey, input.libraryEntryId)
    } catch (error) {
      const result = this.caughtFailure('create_draft', candidate, error)
      return this.finish(result, startedAt, result.operationKey, candidateTarget(candidate))
    }
  }

  async saveDraft(candidate: unknown): Promise<SaveLibraryVersionDraftResult> {
    const startedAt = Date.now()
    try {
      const input = SaveLibraryVersionDraftCommandSchema.parse(candidate)
      const canonical = canonicalInput(input.title, input.content, input.changeSummary)
      const prepared = await prepareSaveLibraryVersionRevisionCommand({
        versionId: input.versionId,
        expectedState: 'draft',
        expectedPreviousRevisionHash: input.expectedPreviousRevisionHash,
        canonicalizationContract: REAL_EDITORIAL_LIBRARY_CANONICALIZATION_CONTRACT,
        contentSchemaContract: REAL_EDITORIAL_LIBRARY_CONTENT_SCHEMA_CONTRACT,
        title: canonical.title,
        content: canonical.content,
        changeSummary: canonical.changeSummary,
        createdByActorId: input.actorId,
        operationKey: input.operationKey,
      }, this.actors)

      const existing = await this.receipts.getDraftOperationReceipt(input.operationKey)
      if (existing !== null) {
        const conflict = receiptConflict(existing, 'save_draft', prepared, input.actorId)
        if (conflict !== null) return this.finish(
          this.failure('save_draft', conflict, input.operationKey),
          startedAt, input.operationKey, input.versionId,
        )
        const replayed = await this.saveProjection(existing, true, canonical.warnings)
        return this.finish(replayed, startedAt, input.operationKey, input.versionId)
      }

      const before = await this.reads.getVersionStateSnapshot(input.versionId)
      if (before.effectiveState !== 'draft') return this.finish(
        this.failure('save_draft', 'INVALID_STATE_TRANSITION', input.operationKey),
        startedAt, input.operationKey, input.versionId,
      )
      if (before.currentRevisionHash !== input.expectedPreviousRevisionHash) {
        return this.finish(
          this.failure('save_draft', 'STALE_REVISION', input.operationKey),
          startedAt, input.operationKey, input.versionId,
        )
      }

      const commandResult = await this.writes.saveRevision(prepared)
      if (commandResult.status === 'error') {
        const code = commandResult.code === 'STALE_VERSION_STATE'
          ? 'INVALID_STATE_TRANSITION'
          : commandResult.code
        return this.finish(
          this.failure('save_draft', code, input.operationKey),
          startedAt, input.operationKey, input.versionId,
        )
      }
      if (commandResult.operation !== 'save_revision') {
        throw new LibraryVersionDraftIntegrityError('INVALID_VERSION_HISTORY')
      }
      const receipt = await this.requireReceipt(input.operationKey)
      assertReceiptMatchesCommand(receipt, 'save_draft', prepared, commandResult, input.actorId)
      const result = await this.saveProjection(
        receipt,
        commandResult.reused,
        canonical.warnings,
        !commandResult.reused,
        input.expectedPreviousRevisionHash,
      )
      return this.finish(result, startedAt, input.operationKey, input.versionId)
    } catch (error) {
      const result = this.caughtFailure('save_draft', candidate, error)
      return this.finish(result, startedAt, result.operationKey, candidateTarget(candidate))
    }
  }

  async recoverOperationResult(candidate: unknown): Promise<RecoverLibraryVersionOperationResult> {
    const startedAt = Date.now()
    try {
      const input = RecoverLibraryVersionOperationCommandSchema.parse(candidate)
      await this.actors.authorize(input.actorId, 'edit')
      const receipt = await this.receipts.getDraftOperationReceipt(input.operationKey)
      if (receipt === null) return this.finish(
        RecoverLibraryVersionOperationResultSchema.parse({
          status: 'not_found', operation: 'recover_operation', operationKey: input.operationKey,
        }),
        startedAt, input.operationKey, null,
      )
      if (
        receipt.operation !== input.expectedOperation
        || receipt.requestFingerprint !== input.expectedRequestFingerprint
        || receipt.actorId !== input.actorId
      ) return this.finish(
        this.failure('recover_operation', 'IDEMPOTENCY_CONFLICT', input.operationKey),
        startedAt, input.operationKey, receipt.versionId,
      )

      const projection = await this.recoveryProjection(receipt)
      return this.finish(projection, startedAt, input.operationKey, receipt.versionId)
    } catch (error) {
      const result = this.caughtFailure('recover_operation', candidate, error)
      return this.finish(result, startedAt, result.operationKey, candidateTarget(candidate))
    }
  }

  private async requireReceipt(operationKey: string): Promise<LibraryVersionDraftOperationReceipt> {
    const receipt = await this.receipts.getDraftOperationReceipt(operationKey)
    if (receipt === null) throw new LibraryVersionDraftIntegrityError('INVALID_VERSION_HISTORY')
    return LibraryVersionDraftOperationReceiptSchema.parse(receipt)
  }

  private async createProjection(
    receipt: LibraryVersionDraftOperationReceipt,
    operationReplayed: boolean,
    warnings: LibraryVersionDraftApplicationWarning[],
    requireFreshDraft = false,
  ): Promise<CreateLibraryVersionDraftResult> {
    const [detail, operationRevision, stateSnapshot, entrySummary] = await Promise.all([
      this.reads.getVersionDetail(receipt.versionId),
      this.reads.getVersionRevision(receipt.versionId, receipt.revisionId),
      this.reads.getVersionStateSnapshot(receipt.versionId),
      this.reads.getVersioningSummary(receipt.libraryEntryId),
    ])
    assertCommonProjection(receipt, detail, operationRevision, stateSnapshot, entrySummary)
    if (receipt.operation !== 'create_draft' || operationRevision.revisionNumber !== 1) {
      throw new LibraryVersionDraftIntegrityError('INVALID_VERSION_HISTORY')
    }
    if (requireFreshDraft) assertFreshDraft(detail, stateSnapshot, entrySummary)
    return CreateLibraryVersionDraftResultSchema.parse({
      status: 'ok', operation: 'create_draft', operationReplayed,
      receipt, version: detail.version, currentRevision: detail.currentRevision,
      stateSnapshot, entrySummary, warnings,
    })
  }

  private async saveProjection(
    receipt: LibraryVersionDraftOperationReceipt,
    operationReplayed: boolean,
    warnings: LibraryVersionDraftApplicationWarning[],
    requireFreshDraft = false,
    expectedPreviousRevisionHash?: string,
  ): Promise<SaveLibraryVersionDraftResult> {
    const [detail, savedRevision, stateSnapshot, entrySummary] = await Promise.all([
      this.reads.getVersionDetail(receipt.versionId),
      this.reads.getVersionRevision(receipt.versionId, receipt.revisionId),
      this.reads.getVersionStateSnapshot(receipt.versionId),
      this.reads.getVersioningSummary(receipt.libraryEntryId),
    ])
    assertCommonProjection(receipt, detail, savedRevision, stateSnapshot, entrySummary)
    if (receipt.operation !== 'save_draft' || savedRevision.revisionNumber < 2) {
      throw new LibraryVersionDraftIntegrityError('INVALID_VERSION_HISTORY')
    }
    if (
      expectedPreviousRevisionHash !== undefined
      && savedRevision.expectedPreviousRevisionHash !== expectedPreviousRevisionHash
    ) throw new LibraryVersionDraftIntegrityError('HASH_MISMATCH')
    if (requireFreshDraft) {
      assertFreshDraft(detail, stateSnapshot, entrySummary)
      if (detail.currentRevision.id !== savedRevision.id) {
        throw new LibraryVersionDraftIntegrityError('INVALID_VERSION_HISTORY')
      }
    }
    return SaveLibraryVersionDraftResultSchema.parse({
      status: 'ok', operation: 'save_draft', operationReplayed,
      receipt, savedRevision, versionDetail: detail, stateSnapshot, entrySummary, warnings,
    })
  }

  private async recoveryProjection(
    receipt: LibraryVersionDraftOperationReceipt,
  ): Promise<RecoverLibraryVersionOperationResult> {
    const [operationRevision, versionDetail, stateSnapshot, entrySummary] = await Promise.all([
      this.reads.getVersionRevision(receipt.versionId, receipt.revisionId),
      this.reads.getVersionDetail(receipt.versionId),
      this.reads.getVersionStateSnapshot(receipt.versionId),
      this.reads.getVersioningSummary(receipt.libraryEntryId),
    ])
    assertCommonProjection(
      receipt, versionDetail, operationRevision, stateSnapshot, entrySummary,
    )
    return RecoverLibraryVersionOperationResultSchema.parse({
      status: 'confirmed', operation: 'recover_operation',
      recoveredOperation: receipt.operation, receipt, operationRevision,
      versionDetail, stateSnapshot, entrySummary,
    })
  }

  private commandFailure<T extends Extract<ApplicationOperation, 'create_draft' | 'save_draft'>>(
    operation: T,
    result: Extract<LibraryVersionCommandResult, { status: 'error' }>,
  ): LibraryVersionDraftApplicationError & { operation: T } {
    return this.failure(operation, result.code, result.operationKey ?? null)
  }

  private caughtFailure<T extends ApplicationOperation>(
    operation: T,
    candidate: unknown,
    error: unknown,
  ): LibraryVersionDraftApplicationError & { operation: T } {
    const operationKey = candidateOperationKey(candidate)
    if (error instanceof z.ZodError) {
      return this.failure(operation, 'VALIDATION_ERROR', operationKey, error.issues.map(issue => ({
        path: issue.path.join('.'), code: issue.code, message: safeValidationMessage(issue),
      })))
    }
    if (error instanceof LibraryCanonicalizationError) {
      return this.failure(operation, 'VALIDATION_ERROR', operationKey, [{
        path: '', code: 'canonicalization', message: 'El texto no cumple la canonicalización.',
      }])
    }
    if (error instanceof LibraryVersioningRepositoryError) {
      return this.failure(operation, error.code, operationKey)
    }
    if (error instanceof LibraryVersionDraftIntegrityError) {
      return this.failure(operation, error.code, operationKey)
    }
    return this.failure(operation, 'PERSISTENCE_ERROR', operationKey)
  }

  private failure<T extends ApplicationOperation>(
    operation: T,
    code: ApplicationErrorCode,
    operationKey: string | null,
    validationIssues: Array<{ path: string; code: string; message: string }> = [],
  ): LibraryVersionDraftApplicationError & { operation: T } {
    return LibraryVersionDraftApplicationErrorSchema.parse({
      status: 'error', operation, code, message: safeErrorMessage(code),
      retryable: ['STALE_REVISION', 'PERSISTENCE_ERROR'].includes(code),
      operationKey, validationIssues,
    }) as LibraryVersionDraftApplicationError & { operation: T }
  }

  private finish<T extends { status: string; operation: ApplicationOperation }>(
    result: T,
    startedAt: number,
    operationKey: string | null,
    targetId: string | null,
  ): T {
    const event: LibraryVersionDraftApplicationLogEvent = {
      event: 'library_version_draft_application',
      operation: result.operation,
      operationKeyPrefix: operationKey === null ? null : operationKey.slice(0, 12),
      targetId,
      outcome: result.status as LibraryVersionDraftApplicationLogEvent['outcome'],
      errorCode: result.status === 'error'
        ? (result as unknown as LibraryVersionDraftApplicationError).code
        : null,
      durationMs: Math.max(0, Date.now() - startedAt),
    }
    if (result.status === 'error') this.logger.warn(event)
    else this.logger.info(event)
    return result
  }
}

function canonicalInput(title: string, content: string, changeSummary: string): {
  title: string
  content: string
  changeSummary: string
  warnings: LibraryVersionDraftApplicationWarning[]
} {
  const document = canonicalizeLibraryDocument(title, content)
  const canonicalSummary = canonicalizeLibraryAuditText(changeSummary)
  const repeated = canonicalizeLibraryDocument(document.title, document.content)
  if (
    repeated.title !== document.title
    || repeated.content !== document.content
    || canonicalizeLibraryAuditText(canonicalSummary) !== canonicalSummary
  ) {
    throw new LibraryCanonicalizationError('La canonicalización no es estable')
  }
  const warnings: LibraryVersionDraftApplicationWarning[] = []
  if (document.title !== title) warnings.push('title_canonicalized')
  if (document.content !== content) warnings.push('content_canonicalized')
  if (canonicalSummary !== changeSummary) warnings.push('change_summary_canonicalized')
  return { ...document, changeSummary: canonicalSummary, warnings }
}

function receiptConflict(
  receipt: LibraryVersionDraftOperationReceipt,
  expectedOperation: LibraryVersionDraftOperation,
  prepared: PreparedCreateLibraryVersionCommand | PreparedSaveLibraryVersionRevisionCommand,
  actorId: string,
): ApplicationErrorCode | null {
  return receipt.operation === expectedOperation
    && receipt.requestFingerprint === prepared.requestFingerprint
    && receipt.actorId === actorId
    ? null
    : 'IDEMPOTENCY_CONFLICT'
}

function assertReceiptMatchesCommand(
  receipt: LibraryVersionDraftOperationReceipt,
  expectedOperation: LibraryVersionDraftOperation,
  prepared: PreparedCreateLibraryVersionCommand | PreparedSaveLibraryVersionRevisionCommand,
  result: Extract<LibraryVersionCommandResult, { status: 'ok' }>,
  actorId: string,
): void {
  if (
    receiptConflict(receipt, expectedOperation, prepared, actorId) !== null
    || receipt.versionId !== result.versionId
    || receipt.revisionId !== result.revisionId
    || receipt.versionHash !== result.versionHash
    || receipt.revisionHash !== result.revisionHash
  ) throw new LibraryVersionDraftIntegrityError('HASH_MISMATCH')
}

function assertCommonProjection(
  receipt: LibraryVersionDraftOperationReceipt,
  detail: Awaited<ReturnType<RealEditorialLibraryVersioningReadRepository['getVersionDetail']>>,
  revision: Awaited<ReturnType<RealEditorialLibraryVersioningReadRepository['getVersionRevision']>>,
  state: Awaited<ReturnType<RealEditorialLibraryVersioningReadRepository[
    'getVersionStateSnapshot'
  ]>>,
  summary: Awaited<ReturnType<RealEditorialLibraryVersioningReadRepository[
    'getVersioningSummary'
  ]>>,
): void {
  if (
    detail.version.versionId !== receipt.versionId
    || detail.version.libraryEntryId !== receipt.libraryEntryId
    || detail.version.versionHash !== receipt.versionHash
    || revision.id !== receipt.revisionId
    || revision.versionId !== receipt.versionId
    || revision.revisionHash !== receipt.revisionHash
    || state.versionId !== receipt.versionId
    || state.libraryEntryId !== receipt.libraryEntryId
    || summary.libraryEntryId !== receipt.libraryEntryId
  ) throw new LibraryVersionDraftIntegrityError('HASH_MISMATCH')
}

function assertFreshDraft(
  detail: Awaited<ReturnType<RealEditorialLibraryVersioningReadRepository['getVersionDetail']>>,
  state: Awaited<ReturnType<RealEditorialLibraryVersioningReadRepository[
    'getVersionStateSnapshot'
  ]>>,
  summary: Awaited<ReturnType<RealEditorialLibraryVersioningReadRepository[
    'getVersioningSummary'
  ]>>,
): void {
  if (
    state.effectiveState !== 'draft'
    || state.currentRevisionId !== detail.currentRevision.id
    || state.currentRevisionHash !== detail.currentRevision.revisionHash
    || state.transitions.length !== 0
    || detail.decisions.length !== 0
    || summary.openVersion?.versionId !== detail.version.versionId
    || summary.publication.publicationCount !== 0
    || summary.publication.trawelConnected
    || summary.publication.automaticEnabled
  ) throw new LibraryVersionDraftIntegrityError('INVALID_VERSION_HISTORY')
}

function safeErrorMessage(code: ApplicationErrorCode): string {
  const messages: Record<ApplicationErrorCode, string> = {
    VALIDATION_ERROR: 'El comando no cumple el contrato de aplicación.',
    ACTOR_NOT_AUTHORIZED: 'El actor no está autorizado para esta operación.',
    LIBRARY_ENTRY_NOT_FOUND: 'La entrada de Biblioteca no existe.',
    VERSION_NOT_FOUND: 'La versión no existe.',
    REVISION_NOT_FOUND: 'La revisión no existe.',
    REVISION_VERSION_MISMATCH: 'La revisión no pertenece a la versión.',
    VERSION_ALREADY_OPEN: 'La entrada ya tiene una versión abierta.',
    STALE_REVISION: 'La revisión vigente ha cambiado.',
    STALE_VERSION_STATE: 'El estado vigente ha cambiado.',
    STALE_DECISION_TARGET: 'El objetivo de decisión ha cambiado.',
    IDEMPOTENCY_CONFLICT: 'La clave de operación pertenece a otro payload.',
    INVALID_STATE_TRANSITION: 'La versión ya no admite guardados.',
    HASH_MISMATCH: 'Los hashes confirmados no coinciden.',
    INVALID_VERSION_HISTORY: 'La historia de la versión no es íntegra.',
    INVALID_DECISION_HISTORY: 'La historia de decisiones no es íntegra.',
    ORIGIN_REFERENCE_INVALID: 'La referencia de origen no es válida.',
    FINDINGS_NOT_RECONCILED: 'Los findings todavía no están reconciliados.',
    UNSUPPORTED_CLAIM_BLOCKS_APPROVAL: 'Existe una afirmación sin respaldo.',
    PERSISTENCE_ERROR: 'No se pudo confirmar la operación interna.',
  }
  return messages[code]
}

function safeValidationMessage(issue: z.ZodIssue): string {
  if (issue.code === 'unrecognized_keys') return 'El comando contiene campos no admitidos.'
  if (issue.code === 'invalid_string') return 'El campo tiene un formato inválido.'
  if (issue.code === 'too_big') return 'El campo supera el límite permitido.'
  if (issue.code === 'too_small') return 'El campo obligatorio está vacío.'
  return 'El campo no cumple el contrato.'
}

function candidateOperationKey(candidate: unknown): string | null {
  if (typeof candidate !== 'object' || candidate === null) return null
  const value = (candidate as Record<string, unknown>).operationKey
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) ? value : null
}

function candidateTarget(candidate: unknown): string | null {
  if (typeof candidate !== 'object' || candidate === null) return null
  const value = candidate as Record<string, unknown>
  for (const key of ['versionId', 'libraryEntryId']) {
    if (typeof value[key] === 'string' && z.string().uuid().safeParse(value[key]).success) {
      return value[key] as string
    }
  }
  return null
}
