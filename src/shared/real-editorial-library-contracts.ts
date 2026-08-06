import { z } from 'zod'

export const REAL_EDITORIAL_LIBRARY_CANONICALIZATION_CONTRACT =
  'investighost-library-c14n-v1' as const
export const REAL_EDITORIAL_LIBRARY_CONTENT_SCHEMA_CONTRACT =
  'investighost-library-content-v1' as const
export const REAL_EDITORIAL_LIBRARY_MAX_TITLE_LENGTH = 500
export const REAL_EDITORIAL_LIBRARY_MAX_CONTENT_LENGTH = 100_000
export const REAL_EDITORIAL_LIBRARY_MAX_REASON_LENGTH = 2_000

export const LibraryVersionStateSchema = z.enum([
  'draft',
  'ready_for_review',
  'changes_requested',
  'approved',
  'rejected',
  'abandoned',
])

export const LibraryVersionDecisionTypeSchema = z.enum([
  'submit_for_review',
  'approve',
  'request_changes',
  'reject',
  'abandon',
])

export const LibraryVersionFindingTypeSchema = z.enum([
  'warning',
  'gap',
  'contradiction',
  'claim',
])

export const LibraryVersionFindingOriginSchema = z.enum(['inherited', 'new'])

export const LibraryVersionFindingDispositionSchema = z.enum([
  'pending',
  'resolved_editorially',
  'accepted_risk',
  'not_applicable',
])

export const LibraryVersionClaimRelationSchema = z.enum([
  'preserved',
  'removed',
  'modified',
  'new',
  'not_applicable',
])

export const LibraryVersionSupportStatusSchema = z.enum([
  'supported',
  'unsupported',
  'not_applicable',
])

export const LibraryVersionDomainErrorCodeSchema = z.enum([
  'STALE_REVISION',
  'STALE_VERSION_STATE',
  'STALE_DECISION_TARGET',
  'IDEMPOTENCY_CONFLICT',
  'VERSION_ALREADY_OPEN',
  'INVALID_STATE_TRANSITION',
  'HASH_MISMATCH',
  'UNSUPPORTED_CLAIM_BLOCKS_APPROVAL',
  'FINDINGS_NOT_RECONCILED',
  'LIBRARY_ENTRY_NOT_FOUND',
  'ORIGIN_REFERENCE_INVALID',
  'VERSION_NOT_FOUND',
  'REVISION_NOT_FOUND',
  'REVISION_VERSION_MISMATCH',
  'INVALID_VERSION_HISTORY',
  'INVALID_DECISION_HISTORY',
  'ACTOR_NOT_AUTHORIZED',
  'PERSISTENCE_ERROR',
])

export const LibraryVersionUuidSchema = z.string().uuid()
export const LibraryVersionSha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
export const LibraryVersionOperationKeySchema = LibraryVersionSha256Schema
export const LibraryVersionCanonicalizationContractSchema = z.literal(
  REAL_EDITORIAL_LIBRARY_CANONICALIZATION_CONTRACT,
)
export const LibraryVersionContentSchemaContractSchema = z.literal(
  REAL_EDITORIAL_LIBRARY_CONTENT_SCHEMA_CONTRACT,
)
export const LibraryVersionNumberSchema = z.number().int().min(2)
export const LibraryVersionRevisionNumberSchema = z.number().int().min(1)

const IsoTimestampSchema = z.string().datetime({ offset: true })
const StableReferenceSchema = z.string().trim().min(1).max(500)
const ActorRoleSchema = z.string().trim().min(1).max(120)
const SafeReasonSchema = z.string().trim().min(1)
  .max(REAL_EDITORIAL_LIBRARY_MAX_REASON_LENGTH)
  .refine(
    value => !/(?:sk-|tvly-|api[_ -]?key|authorization|bearer\s)/i.test(value),
    'El texto de auditoria no puede contener credenciales ni autorizaciones',
  )

function hasLoneSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      if (index + 1 >= value.length) return true
      const next = value.charCodeAt(index + 1)
      if (next < 0xdc00 || next > 0xdfff) return true
      index += 1
      continue
    }
    if (code >= 0xdc00 && code <= 0xdfff) return true
  }
  return false
}

function isUnicodeCanonical(value: string): boolean {
  return !value.startsWith('\uFEFF')
    && !value.includes('\0')
    && !value.includes('\r')
    && !hasLoneSurrogate(value)
    && value === value.normalize('NFC')
}

export function isCanonicalLibraryTitle(value: string): boolean {
  return value.length > 0
    && value.length <= REAL_EDITORIAL_LIBRARY_MAX_TITLE_LENGTH
    && value === value.trim()
    && !value.includes('\n')
    && isUnicodeCanonical(value)
}

export function isCanonicalLibraryContent(value: string): boolean {
  return value.length > 0
    && value.length <= REAL_EDITORIAL_LIBRARY_MAX_CONTENT_LENGTH
    && value.trim().length > 0
    && isUnicodeCanonical(value)
    && value.endsWith('\n')
    && !value.endsWith('\n\n')
    && !/[ \t]+(?:\n|$)/.test(value)
}

export const LibraryVersionTitleSchema = z.string().refine(
  isCanonicalLibraryTitle,
  'El titulo debe estar canonicalizado en NFC, sin espacios exteriores ni saltos',
)

export const LibraryVersionContentSchema = z.string().refine(
  isCanonicalLibraryContent,
  'El contenido debe estar canonicalizado en NFC, LF y un unico salto final',
)

function hasUniqueValues(values: string[]): boolean {
  return new Set(values).size === values.length
}

const StableReferenceListSchema = z.array(StableReferenceSchema).max(500).refine(
  hasUniqueValues,
  'Las referencias deben ser unicas',
)
const ChangeInstructionListSchema = z.array(SafeReasonSchema).max(100)
const EditableTitleInputSchema = z.string().min(1).max(1_000)
const EditableContentInputSchema = z.string().min(1).max(200_000)

export const LibraryVersionEvidenceReferenceSchema = z.object({
  kind: z.enum(['evidence', 'source']),
  referenceId: StableReferenceSchema,
  locator: z.string().trim().min(1).max(1_000),
  note: z.string().trim().max(1_000).optional(),
}).strict()

export const LibraryVersionDiffAnchorSchema = z.object({
  revisionHash: LibraryVersionSha256Schema,
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  changedTextHash: LibraryVersionSha256Schema,
}).strict().superRefine((value, context) => {
  if (value.endLine < value.startLine) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endLine'],
      message: 'El final del ancla no puede preceder a su inicio',
    })
  }
})

const VersionLineageSchema = z.object({
  versionNumber: LibraryVersionNumberSchema,
  parentVersionId: LibraryVersionUuidSchema.nullable(),
  parentOriginVersionHash: LibraryVersionSha256Schema,
  parentHash: LibraryVersionSha256Schema,
}).strict().superRefine((value, context) => {
  if (value.versionNumber === 2) {
    if (value.parentVersionId !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['parentVersionId'],
        message: 'v2 referencia v1 por hash, no mediante una fila derivada',
      })
    }
    if (value.parentHash !== value.parentOriginVersionHash) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['parentHash'],
        message: 'El padre inmediato de v2 es el hash de origen de v1',
      })
    }
  } else if (value.parentVersionId === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['parentVersionId'],
      message: 'v3 y posteriores requieren una version derivada padre',
    })
  }
})

export const LibraryVersionIdentitySchema = z.object({
  id: LibraryVersionUuidSchema,
  libraryEntryId: LibraryVersionUuidSchema,
  versionNumber: LibraryVersionNumberSchema,
  parentVersionId: LibraryVersionUuidSchema.nullable(),
  parentOriginVersionHash: LibraryVersionSha256Schema,
  parentHash: LibraryVersionSha256Schema,
  versionHash: LibraryVersionSha256Schema,
  canonicalizationContract: LibraryVersionCanonicalizationContractSchema,
  creationReason: SafeReasonSchema,
  createdByActorId: LibraryVersionUuidSchema,
  createdAt: IsoTimestampSchema,
  operationKey: LibraryVersionOperationKeySchema,
  requestFingerprint: LibraryVersionSha256Schema,
  publicationState: z.literal('unpublished'),
}).strict().superRefine((value, context) => {
  const lineage = VersionLineageSchema.safeParse({
    versionNumber: value.versionNumber,
    parentVersionId: value.parentVersionId,
    parentOriginVersionHash: value.parentOriginVersionHash,
    parentHash: value.parentHash,
  })
  if (!lineage.success) {
    for (const issue of lineage.error.issues) context.addIssue(issue)
  }
})

export const LibraryVersionRevisionSchema = z.object({
  id: LibraryVersionUuidSchema,
  versionId: LibraryVersionUuidSchema,
  revisionNumber: LibraryVersionRevisionNumberSchema,
  previousRevisionId: LibraryVersionUuidSchema.nullable(),
  expectedPreviousRevisionHash: LibraryVersionSha256Schema.nullable(),
  title: LibraryVersionTitleSchema,
  content: LibraryVersionContentSchema,
  contentSchemaContract: LibraryVersionContentSchemaContractSchema,
  canonicalizationContract: LibraryVersionCanonicalizationContractSchema,
  contentHash: LibraryVersionSha256Schema,
  revisionHash: LibraryVersionSha256Schema,
  changeSummary: SafeReasonSchema,
  createdByActorId: LibraryVersionUuidSchema,
  createdAt: IsoTimestampSchema,
  operationKey: LibraryVersionOperationKeySchema,
  requestFingerprint: LibraryVersionSha256Schema,
}).strict().superRefine((value, context) => {
  const firstRevision = value.revisionNumber === 1
  if (firstRevision !== (value.previousRevisionId === null)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['previousRevisionId'],
      message: 'Solo la revision 1 carece de revision previa',
    })
  }
  if (firstRevision !== (value.expectedPreviousRevisionHash === null)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['expectedPreviousRevisionHash'],
      message: 'Solo la revision 1 carece de hash previo esperado',
    })
  }
})

const LibraryVersionFindingSemanticSchema = z.object({
  findingKey: StableReferenceSchema,
  sourceFindingType: LibraryVersionFindingTypeSchema,
  sourceFindingId: StableReferenceSchema,
  origin: LibraryVersionFindingOriginSchema,
  disposition: LibraryVersionFindingDispositionSchema,
  claimRelation: LibraryVersionClaimRelationSchema,
  supportStatus: LibraryVersionSupportStatusSchema,
  subjectText: z.string().trim().min(1).max(4_000),
  diffAnchor: LibraryVersionDiffAnchorSchema.nullable(),
  claimIds: StableReferenceListSchema,
  evidenceReferences: z.array(LibraryVersionEvidenceReferenceSchema).max(500),
  sourceIds: StableReferenceListSchema,
  editorDeclaration: SafeReasonSchema,
  justification: z.string().trim().max(REAL_EDITORIAL_LIBRARY_MAX_REASON_LENGTH),
})

function validateFinding(
  value: z.infer<typeof LibraryVersionFindingSemanticSchema>,
  context: z.RefinementCtx,
): void {
  if (
    value.disposition !== 'pending'
    && value.justification.length === 0
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['justification'],
      message: 'La disposition seleccionada requiere justificacion',
    })
  }
  if (
    ['resolved_editorially', 'not_applicable'].includes(value.disposition)
    && value.diffAnchor === null
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['diffAnchor'],
      message: 'Resolver o descartar editorialmente requiere un ancla de diff',
    })
  }
  if (value.sourceFindingType !== 'claim') {
    if (value.claimRelation !== 'not_applicable' || value.supportStatus !== 'not_applicable') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['claimRelation'],
        message: 'Los findings no claim no tienen relacion ni soporte de claim',
      })
    }
    return
  }

  const validClaimShape = (
    value.claimRelation === 'preserved'
      && value.origin === 'inherited'
      && value.supportStatus === 'supported'
  ) || (
    value.claimRelation === 'removed'
      && value.origin === 'inherited'
      && value.supportStatus === 'not_applicable'
      && value.disposition === 'not_applicable'
  ) || (
    value.claimRelation === 'modified'
      && value.origin === 'inherited'
      && value.supportStatus !== 'not_applicable'
  ) || (
    value.claimRelation === 'new'
      && value.origin === 'new'
      && value.supportStatus !== 'not_applicable'
  )
  if (!validClaimShape) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['claimRelation'],
      message: 'La relacion, procedencia y soporte del claim son incompatibles',
    })
  }
  if (value.supportStatus === 'unsupported' && value.disposition !== 'pending') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['disposition'],
      message: 'Un claim sin respaldo permanece pendiente y bloquea aprobacion',
    })
  }
  if (
    ['new', 'modified'].includes(value.claimRelation)
    && value.supportStatus === 'supported'
    && (value.evidenceReferences.length === 0 || value.sourceIds.length === 0)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['evidenceReferences'],
      message: 'Un claim nuevo o modificado soportado requiere evidencia y fuente capturadas',
    })
  }
}

export const LibraryVersionFindingInputSchema = LibraryVersionFindingSemanticSchema
  .strict()
  .superRefine(validateFinding)

export const LibraryVersionFindingSchema = LibraryVersionFindingSemanticSchema.extend({
  id: LibraryVersionUuidSchema,
  versionId: LibraryVersionUuidSchema,
  revisionId: LibraryVersionUuidSchema,
  sequence: z.number().int().positive(),
  supersedesFindingId: LibraryVersionUuidSchema.nullable(),
  findingHash: LibraryVersionSha256Schema,
  createdByActorId: LibraryVersionUuidSchema,
  createdAt: IsoTimestampSchema,
  operationKey: LibraryVersionOperationKeySchema,
  requestFingerprint: LibraryVersionSha256Schema,
  isBaseline: z.boolean(),
  resultTraceabilityHash: LibraryVersionSha256Schema.nullable(),
}).strict().superRefine((value, context) => {
  validateFinding(value, context)
  if (value.isBaseline === (value.resultTraceabilityHash !== null)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['resultTraceabilityHash'],
      message: 'Solo una reconciliacion no baseline conserva su traceability resultante',
    })
  }
})

export const LIBRARY_VERSION_DECISION_TRANSITIONS = {
  submit_for_review: { from: 'draft', to: 'ready_for_review' },
  approve: { from: 'ready_for_review', to: 'approved' },
  request_changes: { from: 'ready_for_review', to: 'changes_requested' },
  reject: { from: 'ready_for_review', to: 'rejected' },
  abandon: { from: 'draft', to: 'abandoned' },
} as const

export function getLibraryVersionDecisionTransition(
  decisionType: LibraryVersionDecisionType,
): { from: LibraryVersionState; to: LibraryVersionState } {
  return LIBRARY_VERSION_DECISION_TRANSITIONS[decisionType]
}

export function isTerminalLibraryVersionState(state: LibraryVersionState): boolean {
  return ['changes_requested', 'approved', 'rejected', 'abandoned'].includes(state)
}

const LibraryVersionDecisionCoreSchema = z.object({
  versionId: LibraryVersionUuidSchema,
  revisionId: LibraryVersionUuidSchema,
  decisionType: LibraryVersionDecisionTypeSchema,
  expectedPreviousState: LibraryVersionStateSchema,
  resultingState: LibraryVersionStateSchema,
  revisionHash: LibraryVersionSha256Schema,
  traceabilityHash: LibraryVersionSha256Schema,
  decisionTargetHash: LibraryVersionSha256Schema,
  aggregateHash: LibraryVersionSha256Schema,
  requestFingerprint: LibraryVersionSha256Schema,
  reason: SafeReasonSchema,
  actorId: LibraryVersionUuidSchema,
  actorRoleSnapshot: ActorRoleSchema,
  affectedFindingKeys: StableReferenceListSchema,
  changeInstructions: ChangeInstructionListSchema,
  acceptedRiskFindingKeys: StableReferenceListSchema,
  separationOfDutiesException: z.boolean(),
  separationOfDutiesReason: SafeReasonSchema.nullable(),
  publicationCount: z.literal(0),
  trawelConnected: z.literal(false),
  automaticEnabled: z.literal(false),
})

function validateDecision(
  value: z.infer<typeof LibraryVersionDecisionCoreSchema>,
  context: z.RefinementCtx,
): void {
  const transition = getLibraryVersionDecisionTransition(value.decisionType)
  if (
    value.expectedPreviousState !== transition.from
    || value.resultingState !== transition.to
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['resultingState'],
      message: 'La transicion no corresponde a la decision',
    })
  }
  if (value.decisionTargetHash !== value.aggregateHash) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['decisionTargetHash'],
      message: 'La decision debe apuntar al aggregate hash congelado',
    })
  }
  if (value.separationOfDutiesException !== (value.separationOfDutiesReason !== null)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['separationOfDutiesReason'],
      message: 'La excepcion de separacion de funciones requiere motivo exclusivo',
    })
  }
  if (value.separationOfDutiesException && value.decisionType !== 'approve') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['separationOfDutiesException'],
      message: 'La excepcion de autoaprobacion solo aplica a approve',
    })
  }
  if (
    value.decisionType === 'request_changes'
    && value.affectedFindingKeys.length === 0
    && value.changeInstructions.length === 0
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['affectedFindingKeys'],
      message: 'Solicitar cambios requiere findings o instrucciones concretas',
    })
  }
  if (value.decisionType !== 'request_changes' && value.changeInstructions.length > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['changeInstructions'],
      message: 'Las instrucciones concretas solo corresponden a request_changes',
    })
  }
}

export const LibraryVersionDecisionSchema = LibraryVersionDecisionCoreSchema.extend({
  id: LibraryVersionUuidSchema,
  sequence: z.number().int().positive(),
  createdAt: IsoTimestampSchema,
  operationKey: LibraryVersionOperationKeySchema,
}).strict().superRefine(validateDecision)

export const LibraryVersionDisplayStateSchema = z.enum([
  'draft',
  'ready_for_review',
  'changes_requested',
  'approved_current',
  'approved_historical',
  'superseded',
  'rejected',
  'abandoned',
])

export const LibraryVersionSummarySchema = z.object({
  id: LibraryVersionUuidSchema,
  libraryEntryId: LibraryVersionUuidSchema,
  versionNumber: LibraryVersionNumberSchema,
  parentHash: LibraryVersionSha256Schema,
  versionHash: LibraryVersionSha256Schema,
  state: LibraryVersionStateSchema,
  displayState: LibraryVersionDisplayStateSchema,
  latestRevisionId: LibraryVersionUuidSchema,
  latestRevisionNumber: LibraryVersionRevisionNumberSchema,
  latestRevisionHash: LibraryVersionSha256Schema,
  isCurrentApproved: z.boolean(),
  publicationState: z.literal('unpublished'),
  createdByActorId: LibraryVersionUuidSchema,
  createdAt: IsoTimestampSchema,
}).strict().superRefine((value, context) => {
  if (value.isCurrentApproved !== (value.displayState === 'approved_current')) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['isCurrentApproved'],
      message: 'La marca current approved debe coincidir con el estado de presentacion',
    })
  }
})

export const LibraryVersionStateSnapshotSchema = z.object({
  libraryEntryId: LibraryVersionUuidSchema,
  versionId: LibraryVersionUuidSchema,
  versionNumber: LibraryVersionNumberSchema,
  state: LibraryVersionStateSchema,
  latestRevisionId: LibraryVersionUuidSchema,
  latestRevisionHash: LibraryVersionSha256Schema,
  traceabilityHash: LibraryVersionSha256Schema.nullable(),
  decisionTargetHash: LibraryVersionSha256Schema.nullable(),
  latestDecisionId: LibraryVersionUuidSchema.nullable(),
  isTerminal: z.boolean(),
  isCurrentApproved: z.boolean(),
  publicationState: z.literal('unpublished'),
  observedAt: IsoTimestampSchema,
}).strict().superRefine((value, context) => {
  if (value.isTerminal !== isTerminalLibraryVersionState(value.state)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['isTerminal'],
      message: 'La marca terminal no coincide con el estado derivado',
    })
  }
  if (value.isCurrentApproved && value.state !== 'approved') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['isCurrentApproved'],
      message: 'Solo una version aprobada puede ser current approved',
    })
  }
})

export const CreateLibraryVersionCommandSchema = z.object({
  libraryEntryId: LibraryVersionUuidSchema,
  expectedHeadHash: LibraryVersionSha256Schema,
  canonicalizationContract: LibraryVersionCanonicalizationContractSchema,
  contentSchemaContract: LibraryVersionContentSchemaContractSchema,
  title: EditableTitleInputSchema,
  content: EditableContentInputSchema,
  creationReason: SafeReasonSchema,
  createdByActorId: LibraryVersionUuidSchema,
  operationKey: LibraryVersionOperationKeySchema,
}).strict()

export const SaveLibraryVersionRevisionCommandSchema = z.object({
  versionId: LibraryVersionUuidSchema,
  expectedState: z.literal('draft'),
  expectedPreviousRevisionHash: LibraryVersionSha256Schema,
  canonicalizationContract: LibraryVersionCanonicalizationContractSchema,
  contentSchemaContract: LibraryVersionContentSchemaContractSchema,
  title: EditableTitleInputSchema,
  content: EditableContentInputSchema,
  changeSummary: SafeReasonSchema,
  createdByActorId: LibraryVersionUuidSchema,
  operationKey: LibraryVersionOperationKeySchema,
}).strict()

export const ReconcileLibraryVersionFindingsCommandSchema = z.object({
  versionId: LibraryVersionUuidSchema,
  revisionId: LibraryVersionUuidSchema,
  expectedState: z.literal('draft'),
  expectedRevisionHash: LibraryVersionSha256Schema,
  expectedTraceabilityHash: LibraryVersionSha256Schema,
  finding: LibraryVersionFindingInputSchema,
  createdByActorId: LibraryVersionUuidSchema,
  operationKey: LibraryVersionOperationKeySchema,
}).strict()

export const SubmitLibraryVersionForReviewCommandSchema = z.object({
  versionId: LibraryVersionUuidSchema,
  revisionId: LibraryVersionUuidSchema,
  expectedState: z.literal('draft'),
  expectedRevisionHash: LibraryVersionSha256Schema,
  expectedTraceabilityHash: LibraryVersionSha256Schema,
  reason: SafeReasonSchema,
  actorId: LibraryVersionUuidSchema,
  operationKey: LibraryVersionOperationKeySchema,
}).strict()

const DecideLibraryVersionBaseSchema = z.object({
  versionId: LibraryVersionUuidSchema,
  revisionId: LibraryVersionUuidSchema,
  expectedDecisionTargetHash: LibraryVersionSha256Schema,
  reason: SafeReasonSchema,
  actorId: LibraryVersionUuidSchema,
  affectedFindingKeys: StableReferenceListSchema,
  changeInstructions: ChangeInstructionListSchema,
  acceptedRiskFindingKeys: StableReferenceListSchema,
  separationOfDutiesException: z.boolean(),
  separationOfDutiesReason: SafeReasonSchema.nullable(),
  operationKey: LibraryVersionOperationKeySchema,
})

export const DecideLibraryVersionCommandSchema = z.discriminatedUnion('decisionType', [
  DecideLibraryVersionBaseSchema.extend({
    decisionType: z.literal('approve'),
    expectedPreviousState: z.literal('ready_for_review'),
  }).strict(),
  DecideLibraryVersionBaseSchema.extend({
    decisionType: z.literal('request_changes'),
    expectedPreviousState: z.literal('ready_for_review'),
  }).strict(),
  DecideLibraryVersionBaseSchema.extend({
    decisionType: z.literal('reject'),
    expectedPreviousState: z.literal('ready_for_review'),
  }).strict(),
  DecideLibraryVersionBaseSchema.extend({
    decisionType: z.literal('abandon'),
    expectedPreviousState: z.literal('draft'),
  }).strict(),
]).superRefine((value, context) => {
  if (value.separationOfDutiesException !== (value.separationOfDutiesReason !== null)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['separationOfDutiesReason'],
      message: 'La excepcion de separacion de funciones requiere motivo exclusivo',
    })
  }
  if (value.separationOfDutiesException && value.decisionType !== 'approve') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['separationOfDutiesException'],
      message: 'La excepcion de autoaprobacion solo aplica a approve',
    })
  }
  if (
    value.decisionType === 'request_changes'
    && value.affectedFindingKeys.length === 0
    && value.changeInstructions.length === 0
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['affectedFindingKeys'],
      message: 'Solicitar cambios requiere findings o instrucciones concretas',
    })
  }
  if (value.decisionType !== 'request_changes' && value.changeInstructions.length > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['changeInstructions'],
      message: 'Las instrucciones concretas solo corresponden a request_changes',
    })
  }
})

export const LibraryVersionCommandSuccessSchema = z.object({
  status: z.literal('ok'),
  operation: z.enum([
    'create_version',
    'save_revision',
    'reconcile_findings',
    'submit_for_review',
    'decide_version',
  ]),
  reused: z.boolean(),
  versionId: LibraryVersionUuidSchema,
  revisionId: LibraryVersionUuidSchema.nullable(),
  state: LibraryVersionStateSchema,
  versionHash: LibraryVersionSha256Schema,
  revisionHash: LibraryVersionSha256Schema.nullable(),
  traceabilityHash: LibraryVersionSha256Schema.nullable(),
  decisionTargetHash: LibraryVersionSha256Schema.nullable(),
}).strict()

export const LibraryVersionDomainErrorSchema = z.object({
  status: z.literal('error'),
  code: LibraryVersionDomainErrorCodeSchema,
  message: z.string().trim().min(1).max(2_000),
  retryable: z.boolean(),
  operationKey: LibraryVersionOperationKeySchema.optional(),
  details: z.record(z.string(), z.unknown()).optional(),
}).strict()

export const LibraryVersionCommandResultSchema = z.discriminatedUnion('status', [
  LibraryVersionCommandSuccessSchema,
  LibraryVersionDomainErrorSchema,
])

export type LibraryVersionState = z.infer<typeof LibraryVersionStateSchema>
export type LibraryVersionDecisionType = z.infer<typeof LibraryVersionDecisionTypeSchema>
export type LibraryVersionFindingType = z.infer<typeof LibraryVersionFindingTypeSchema>
export type LibraryVersionFindingOrigin = z.infer<typeof LibraryVersionFindingOriginSchema>
export type LibraryVersionFindingDisposition = z.infer<
  typeof LibraryVersionFindingDispositionSchema
>
export type LibraryVersionClaimRelation = z.infer<typeof LibraryVersionClaimRelationSchema>
export type LibraryVersionSupportStatus = z.infer<typeof LibraryVersionSupportStatusSchema>
export type LibraryVersionDomainErrorCode = z.infer<
  typeof LibraryVersionDomainErrorCodeSchema
>
export type LibraryVersionIdentity = z.infer<typeof LibraryVersionIdentitySchema>
export type LibraryVersionRevision = z.infer<typeof LibraryVersionRevisionSchema>
export type LibraryVersionFindingInput = z.infer<typeof LibraryVersionFindingInputSchema>
export type LibraryVersionFinding = z.infer<typeof LibraryVersionFindingSchema>
export type LibraryVersionDecision = z.infer<typeof LibraryVersionDecisionSchema>
export type LibraryVersionSummary = z.infer<typeof LibraryVersionSummarySchema>
export type LibraryVersionStateSnapshot = z.infer<typeof LibraryVersionStateSnapshotSchema>
export type CreateLibraryVersionCommand = z.infer<typeof CreateLibraryVersionCommandSchema>
export type SaveLibraryVersionRevisionCommand = z.infer<
  typeof SaveLibraryVersionRevisionCommandSchema
>
export type ReconcileLibraryVersionFindingsCommand = z.infer<
  typeof ReconcileLibraryVersionFindingsCommandSchema
>
export type SubmitLibraryVersionForReviewCommand = z.infer<
  typeof SubmitLibraryVersionForReviewCommandSchema
>
export type DecideLibraryVersionCommand = z.infer<typeof DecideLibraryVersionCommandSchema>
export type LibraryVersionCommandSuccess = z.infer<typeof LibraryVersionCommandSuccessSchema>
export type LibraryVersionDomainError = z.infer<typeof LibraryVersionDomainErrorSchema>
export type LibraryVersionCommandResult = z.infer<typeof LibraryVersionCommandResultSchema>
