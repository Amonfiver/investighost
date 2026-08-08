import {
  libraryContentHash,
  libraryOriginVersionHash,
} from '@modules/library-versioning/canonicalization'
import {
  CurrentApprovedLibraryContentSchema,
  type CurrentApprovedLibraryContent,
} from '@shared/real-editorial-library-read-contracts'
import {
  RealEditorialLibraryEntrySchema,
  type RealEditorialLibraryEntry,
} from '@shared/real-editorial-pilot-contracts'
import {
  LibraryTrawelApprovedSourceSchema,
  PrepareTrawelEditorialHandoffCommandSchema,
  type LibraryTrawelApprovedSource,
  type PrepareTrawelEditorialHandoffCommand,
  type TrawelEditorialTarget,
} from '@shared/trawel-editorial-handoff-contracts'

export const syntheticTrawelIds = {
  pilot: 'e2000000-0000-4000-8000-000000000001',
  run: 'e2000000-0000-4000-8000-000000000002',
  transfer: 'e2000000-0000-4000-8000-000000000003',
  destination: 'e2000000-0000-4000-8000-000000000004',
  adventureEntry: 'e2000000-0000-4000-8000-000000000005',
  studentEntry: 'e2000000-0000-4000-8000-000000000006',
  adventureArtifact: 'e2000000-0000-4000-8000-000000000007',
  studentArtifact: 'e2000000-0000-4000-8000-000000000008',
  reviewArtifact: 'e2000000-0000-4000-8000-000000000009',
  snapshotArtifact: 'e2000000-0000-4000-8000-000000000010',
  terminalDecision: 'e2000000-0000-4000-8000-000000000011',
  actor: 'e2000000-0000-4000-8000-000000000012',
  target: 'e2000000-0000-4000-8000-000000000013',
  studentVersion: 'e2000000-0000-4000-8000-000000000014',
  studentRevision: 'e2000000-0000-4000-8000-000000000015',
  studentApproval: 'e2000000-0000-4000-8000-000000000016',
} as const

export const syntheticCreatedAt = '2026-08-08T10:00:00.000Z'
export const syntheticDerivedAt = '2026-08-08T11:00:00.000Z'
export const syntheticHash = (character: string): string => character.repeat(64)

export const syntheticTrawelTarget: TrawelEditorialTarget = {
  projectRef: 'abcdefghijklmnopqrst',
  entityType: 'zone',
  entityId: syntheticTrawelIds.target,
  entitySlug: 'villa-sintetica',
  countrySlug: 'pais-sintetico',
  zoneSlug: 'villa-sintetica',
  countryCode: 'ZZ',
}

export function buildSyntheticLibraryEntry(
  profile: 'adventure' | 'student',
): RealEditorialLibraryEntry {
  const adventure = profile === 'adventure'
  return RealEditorialLibraryEntrySchema.parse({
    entryId: adventure
      ? syntheticTrawelIds.adventureEntry
      : syntheticTrawelIds.studentEntry,
    transferId: syntheticTrawelIds.transfer,
    pilotId: syntheticTrawelIds.pilot,
    runId: syntheticTrawelIds.run,
    destination: {
      canonicalId: syntheticTrawelIds.destination,
      name: 'Villa Sintética',
      countryCode: 'ZZ',
      type: 'locality',
    },
    profile,
    title: adventure ? 'Origen Aventura sintético' : 'Origen Estudiante sintético',
    content: adventure
      ? 'Contenido Aventura original y sintético.\n'
      : 'Contenido Estudiante original y sintético.\n',
    editorialVersion: 1,
    language: 'es-ES',
    status: 'approved_unpublished',
    editorialState: 'approved',
    libraryState: 'ready_for_library',
    publicationState: 'unpublished',
    origin: 'real_editorial_pilot',
    sourceArtifact: {
      artifactId: adventure
        ? syntheticTrawelIds.adventureArtifact
        : syntheticTrawelIds.studentArtifact,
      kind: adventure ? 'draft_adventure' : 'draft_student',
      key: profile,
      version: 1,
      hash: adventure ? syntheticHash('1') : syntheticHash('2'),
      createdAt: syntheticCreatedAt,
    },
    finalReviewArtifact: {
      artifactId: syntheticTrawelIds.reviewArtifact,
      kind: 'final_review',
      key: 'final',
      version: 1,
      hash: syntheticHash('3'),
      createdAt: syntheticCreatedAt,
    },
    terminalDecisionId: syntheticTrawelIds.terminalDecision,
    reviewOutcome: 'passed_with_warnings',
    warnings: ['Advertencia sintética aceptada.'],
    gaps: [{
      id: 'gap-sintetico',
      topic: 'alcance-sintetico',
      description: 'Gap creado exclusivamente para la prueba.',
      importance: 'medium',
      requiredForProfiles: ['adventure', 'student'],
      resolvableWithResearch: false,
    }],
    contradictions: ['Contradicción sintética controlada.'],
    claims: [{
      id: 'claim-sintetico',
      topic: 'tema-sintetico',
      statement: 'Afirmación sintética controlada.',
      evidenceIds: ['source-sintetica'],
      confidence: 0.9,
      suitableProfiles: ['adventure', 'student'],
    }],
    evidence: [{
      claimId: 'claim-sintetico',
      statement: 'Evidencia sintética controlada.',
      confidence: 0.9,
      evidenceIds: ['source-sintetica'],
    }],
    sources: [{
      id: 'source-sintetica',
      round: 1,
      url: 'https://example.test/fuente-sintetica',
      normalizedUrl: 'https://example.test/fuente-sintetica',
      title: 'Fuente pública sintética',
      publisher: 'Editorial Sintética',
      publishedAt: '2026-01-01T00:00:00.000Z',
      capturedAt: syntheticCreatedAt,
      contentHash: syntheticHash('4'),
      score: 0.8,
      content: 'Captura interna sintética que nunca debe viajar a Trawel.',
    }],
    approvalActorId: syntheticTrawelIds.actor,
    transferActorId: syntheticTrawelIds.actor,
    finalRunCostEur: 0,
    currency: 'EUR',
    approvedAt: syntheticCreatedAt,
    createdAt: syntheticCreatedAt,
  })
}

function originFor(item: RealEditorialLibraryEntry) {
  const contentHash = libraryContentHash({
    profile: item.profile,
    language: item.language,
    title: item.title,
    content: item.content,
  })
  const entryKey = item.profile === 'adventure' ? syntheticHash('5') : syntheticHash('6')
  const originVersionHash = libraryOriginVersionHash({
    entryId: item.entryId,
    entryKey,
    profile: item.profile,
    language: item.language,
    contentHash,
    sourceArtifactId: item.sourceArtifact.artifactId,
    sourceArtifactHash: item.sourceArtifact.hash,
    finalReviewHash: item.finalReviewArtifact.hash,
    terminalDecisionId: item.terminalDecisionId,
  })
  return {
    libraryEntryId: item.entryId,
    entryKey,
    versionNumber: 1 as const,
    profile: item.profile,
    language: item.language,
    title: item.title,
    content: item.content,
    contentHash,
    originVersionHash,
    sourceArtifact: item.sourceArtifact,
    finalReviewArtifact: item.finalReviewArtifact,
    terminalDecisionId: item.terminalDecisionId,
    transfer: {
      transferId: item.transferId,
      snapshotArtifactId: syntheticTrawelIds.snapshotArtifact,
      snapshotHash: syntheticHash('7'),
      terminalDecisionId: item.terminalDecisionId,
      transferredAt: syntheticCreatedAt,
      publicationCount: 0 as const,
      trawelConnected: false as const,
      automaticEnabled: false as const,
    },
    reviewOutcome: 'passed_with_warnings' as const,
    reviewPayload: {},
    warnings: item.warnings,
    gaps: item.gaps,
    contradictions: item.contradictions,
    claims: item.claims,
    evidence: item.evidence,
    sources: item.sources,
    approvalActorId: item.approvalActorId,
    transferActorId: item.transferActorId,
    approvedAt: item.approvedAt,
    createdAt: item.createdAt,
    publicationState: 'unpublished' as const,
  }
}

export function buildSyntheticApprovedSource(
  profile: 'adventure' | 'student',
  derived = profile === 'student',
  replacement?: { title: string; content: string },
): LibraryTrawelApprovedSource {
  const item = buildSyntheticLibraryEntry(profile)
  const origin = originFor(item)
  const selected = replacement ?? (derived
    ? {
        title: 'Estudiante v2 aprobado sintético',
        content: 'Contenido Estudiante v2 aprobado y sintético.\n',
      }
    : { title: item.title, content: item.content })
  const contentHash = libraryContentHash({
    profile,
    language: item.language,
    title: selected.title,
    content: selected.content,
  })
  const currentApproved: CurrentApprovedLibraryContent = derived
    ? {
        source: 'derived',
        libraryEntryId: item.entryId,
        profile,
        language: 'es-ES',
        versionId: syntheticTrawelIds.studentVersion,
        versionNumber: 2,
        revisionId: syntheticTrawelIds.studentRevision,
        title: selected.title,
        content: selected.content,
        contentHash,
        versionHash: syntheticHash('8'),
        revisionHash: syntheticHash('9'),
        approvalDecisionId: syntheticTrawelIds.studentApproval,
        approvedAt: syntheticDerivedAt,
        originV1: origin,
        publicationState: 'unpublished',
      }
    : {
        source: 'origin_v1',
        libraryEntryId: item.entryId,
        profile,
        language: 'es-ES',
        versionId: null,
        versionNumber: 1,
        revisionId: null,
        title: selected.title,
        content: selected.content,
        contentHash,
        versionHash: origin.originVersionHash,
        revisionHash: null,
        approvalDecisionId: null,
        approvedAt: item.approvedAt,
        originV1: origin,
        publicationState: 'unpublished',
      }
  return LibraryTrawelApprovedSourceSchema.parse({
    entry: item,
    currentApproved: CurrentApprovedLibraryContentSchema.parse(currentApproved),
  })
}

export function buildSyntheticHandoffCommand(
  overrides: Partial<PrepareTrawelEditorialHandoffCommand> = {},
): PrepareTrawelEditorialHandoffCommand {
  return PrepareTrawelEditorialHandoffCommandSchema.parse({
    sources: [
      buildSyntheticApprovedSource('student'),
      buildSyntheticApprovedSource('adventure'),
    ],
    target: syntheticTrawelTarget,
    actorId: syntheticTrawelIds.actor,
    confirmed: true,
    ...overrides,
  })
}
