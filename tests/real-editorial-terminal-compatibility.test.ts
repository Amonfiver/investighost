import { readFile } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'
import {
  assertTerminalSnapshotV1PayloadCompatible,
  projectTerminalPayloadForSnapshotV1Compatibility,
  realEditorialPayloadHash,
  SupabaseRealEditorialPilotRepository,
  verifyTerminalArtifactReference,
} from '@modules/real-pipeline'
import {
  REAL_EDITORIAL_PILOT_POLICY,
  RealEditorialDraftSchema,
  RealEditorialPilotRecordSchema,
  RealEditorialPilotSnapshotSchema,
  RealEditorialReviewSchema,
} from '@shared/real-editorial-pilot-contracts'

const pilotId = 'b3000000-0000-4000-8000-000000000001'
const runId = 'b3000000-0000-4000-8000-000000000002'
const destinationId = 'b3000000-0000-4000-8000-000000000003'
const timestamp = '2026-08-01T21:56:52.918Z'

const fullAdventure = RealEditorialDraftSchema.parse({
  profile: 'adventure',
  title: 'Morella a pie: fortaleza, murallas y paisaje de Els Ports',
  content: 'Borrador Aventura completo con trazabilidad [c1].',
  approximateWordCount: 1_006,
  promptVersion: 'real-editorial-v1',
  schemaVersion: 'real-intelligence-v1',
  usage: {
    inputTokens: 3_988,
    outputTokens: 1_840,
    estimatedCost: 0.015028,
    currency: 'USD',
    providerRequestIds: ['resp_07354f776b646791016a6e6b7b91208194915cafb0254d44c6'],
  },
})
const fullStudent = RealEditorialDraftSchema.parse({
  profile: 'student',
  title: 'Morella: patrimonio, territorio y vida cotidiana en Els Ports',
  content: 'Borrador Estudiante completo con contexto y trazabilidad [c2].',
  approximateWordCount: 1_780,
  promptVersion: 'real-editorial-v1',
  schemaVersion: 'real-intelligence-v1',
  usage: {
    inputTokens: 3_946,
    outputTokens: 2_996,
    estimatedCost: 0.021921999999999997,
    currency: 'USD',
    providerRequestIds: ['resp_0bcbe4190e2bdd34016a6e6b885b0c81938b682a76a42bb570'],
  },
})
const fullReview = RealEditorialReviewSchema.parse({
  outcome: 'passed_with_warnings',
  issues: [
    'La cobertura es suficiente y los borradores conservan la trazabilidad.',
    'Conviene diferenciar mejor el perfil Estudiante.',
  ],
  promptVersion: 'real-editorial-v1',
  schemaVersion: 'real-intelligence-v1',
  usage: {
    inputTokens: 8_145,
    outputTokens: 1_071,
    estimatedCost: 0.014571,
    currency: 'USD',
    providerRequestIds: ['resp_0fa3c13523bcfe85016a6e6b9b55e8819780ac76322bc7d215'],
  },
})

function withoutProviderRequestIds<T>(candidate: T): T {
  const result = structuredClone(candidate) as T & { usage: { providerRequestIds?: string[] } }
  delete result.usage.providerRequestIds
  return result
}

const snapshotAdventure = withoutProviderRequestIds(fullAdventure)
const snapshotStudent = withoutProviderRequestIds(fullStudent)
const snapshotReview = withoutProviderRequestIds(fullReview)

const limits = {
  maxRounds: 2 as const,
  maxFocusedQueriesPerRound: 3,
  maxSources: 8,
  maxCharactersPerSource: 100_000,
  maxProviderCalls: 12,
  maxInputTokens: 200_000,
  maxOutputTokens: 50_000,
  taskBudgetEur: 0.2,
  batchBudgetEur: 0.2,
  dailyBudgetEur: 0.2,
}
const mission = {
  requestId: pilotId,
  runId,
  taskId: `task:${pilotId}`,
  destination: {
    canonicalId: destinationId,
    name: 'Morella',
    countryCode: 'ES',
    type: 'locality' as const,
  },
  language: 'es',
  profiles: [
    { profile: 'adventure' as const, enabled: true, targetWords: 1_000, depth: 'standard' as const },
    { profile: 'student' as const, enabled: true, targetWords: 1_800, depth: 'deep' as const },
  ],
  depth: 'deep' as const,
  round: 2 as const,
  objectives: ['Crear un resultado editorial trazable.'],
  focusedQueries: ['Morella contexto durable'],
  limits,
  createdAt: timestamp,
}
const dossier = {
  requestId: pilotId,
  runId,
  taskId: `task:${pilotId}`,
  destinationId,
  rounds: [1, 2] as const,
  sources: [],
  evidence: [],
  generatedAt: timestamp,
}
const masterKnowledge = {
  requestId: pilotId,
  destinationId,
  revision: 2,
  claims: [{
    id: 'c1',
    topic: 'heritage',
    statement: 'Morella conserva patrimonio documentado.',
    evidenceIds: ['e1'],
    confidence: 0.95,
    suitableProfiles: ['adventure', 'student'] as const,
  }],
  contradictions: ['Los horarios deben verificarse antes de la visita.'],
  generatedAt: timestamp,
}
const coverage = {
  score: 0.95,
  sufficient: true,
  topics: [{ topic: 'heritage', required: true, coverage: 1, evidenceIds: ['e1'] }],
}
const gaps = [{
  id: 'g1',
  topic: 'hours',
  description: 'Los horarios concretos no constan en el expediente.',
  importance: 'medium' as const,
  requiredForProfiles: ['adventure', 'student'] as const,
  resolvableWithResearch: false,
}]
const snapshotPayload = RealEditorialPilotSnapshotSchema.parse({
  version: 'real-editorial-snapshot-v1',
  pilotId,
  runId,
  state: 'pending_human_review',
  currentRound: 2,
  mission,
  roundResults: [{
    round: 2,
    dossier,
    masterKnowledge,
    coverage,
    gaps,
    proposedQueries: [],
    completedAt: timestamp,
  }],
  dossier,
  masterKnowledge,
  coverage,
  drafts: [snapshotAdventure, snapshotStudent],
  review: snapshotReview,
  limits,
  accumulatedCost: 0.310169,
  providerCalls: 3,
  publicationCount: 0,
  regenerationCount: 0,
  trawelConnected: false,
  automaticEnabled: false,
  updatedAt: timestamp,
})

function pilot() {
  return RealEditorialPilotRecordSchema.parse({
    id: pilotId,
    policyId: REAL_EDITORIAL_PILOT_POLICY.id,
    mode: 'real_editorial_pilot',
    taskOrigin: 'human_authorized',
    variantKey: 'terminal-provider-ids',
    preparationKey: 'terminal-provider-ids-prepare',
    identityKey: 'a'.repeat(64),
    canonicalDestinationId: destinationId,
    destinationName: 'Morella',
    normalizedDestination: 'morella',
    countryCode: 'ES',
    destinationType: 'locality',
    language: 'es',
    pipelineVersion: 'real-editorial-v1',
    profiles: mission.profiles,
    state: 'pending_human_review',
    budgetConfirmed: true,
    publicationCount: 0,
    trawelConnected: false,
    automaticEnabled: false,
    currentRunId: runId,
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    budget: {
      pilotId,
      taskId: `task:${pilotId}`,
      batchId: `batch:${pilotId}`,
      dailyScopeId: `day:${pilotId}`,
      budgetDate: '2026-08-01',
      currency: 'EUR',
      targetCost: 0.125,
      warningCost: 0.16,
      taskLimitCost: 0.35,
      batchLimitCost: 0.35,
      dailyLimitCost: 0.35,
      manualExtensionCost: 0.25,
      technicalLimitCost: 0.5,
      reservedCost: 0,
      spentCost: 0.310169,
      confirmedAt: timestamp,
    },
  })
}

function artifactRow(
  id: string,
  kind: 'checkpoint' | 'draft_adventure' | 'draft_student' | 'final_review',
  key: string,
  payload: unknown,
) {
  return {
    id,
    pilot_id: pilotId,
    run_id: runId,
    artifact_kind: kind,
    artifact_key: key,
    version: 1,
    payload,
    payload_hash: realEditorialPayloadHash(payload),
    created_at: timestamp,
  }
}

const artifactRows = [
  artifactRow('b3000000-0000-4000-8000-000000000010', 'checkpoint', 'pipeline', snapshotPayload),
  artifactRow('b3000000-0000-4000-8000-000000000011', 'draft_adventure', 'adventure', fullAdventure),
  artifactRow('b3000000-0000-4000-8000-000000000012', 'draft_student', 'student', fullStudent),
  artifactRow('b3000000-0000-4000-8000-000000000013', 'final_review', 'final', fullReview),
]

function repositoryFor(rows = artifactRows) {
  const rpc = vi.fn()
  const from = vi.fn((table: string) => {
    const builder: Record<string, (...args: unknown[]) => unknown> = {}
    for (const method of ['select', 'eq', 'order', 'limit']) builder[method] = () => builder
    builder.in = () => Promise.resolve({
      data: table === 'real_editorial_artifacts' ? rows : [],
      error: null,
    })
    builder.maybeSingle = () => Promise.resolve({ data: null, error: null })
    return builder
  })
  const repository = new SupabaseRealEditorialPilotRepository({ from, rpc } as never)
  vi.spyOn(repository, 'getPilot').mockResolvedValue(pilot())
  return { repository, from, rpc }
}

describe('compatibilidad terminal v1 de providerRequestIds', () => {
  it('carga Aventura, Estudiante y revisión desde los artefactos completos sin escribir', async () => {
    const target = repositoryFor()

    const result = await target.repository.getTerminalResult(pilotId)

    expect(result?.snapshot.drafts[0].usage.providerRequestIds).toBeUndefined()
    expect(result?.drafts.map(item => item.usage.providerRequestIds?.[0])).toEqual([
      fullAdventure.usage.providerRequestIds?.[0],
      fullStudent.usage.providerRequestIds?.[0],
    ])
    expect(result?.review.usage.providerRequestIds).toEqual(
      fullReview.usage.providerRequestIds,
    )
    expect(result?.artifacts).toMatchObject({
      adventure: { artifactId: 'b3000000-0000-4000-8000-000000000011', version: 1 },
      student: { artifactId: 'b3000000-0000-4000-8000-000000000012', version: 1 },
      finalReview: { artifactId: 'b3000000-0000-4000-8000-000000000013', version: 1 },
    })
    expect(result?.budget).toMatchObject({
      spentCostEur: 0.310169,
      reservedCostEur: 0,
      automatedWorkRemainingEur: 0,
    })
    expect(target.rpc).not.toHaveBeenCalled()
    expect(target.from.mock.calls.map(([table]) => table)).toEqual([
      'real_editorial_artifacts',
      'real_editorial_terminal_decisions',
    ])
  })

  it.each([
    ['draft_adventure', snapshotAdventure, fullAdventure],
    ['draft_student', snapshotStudent, fullStudent],
    ['final_review', snapshotReview, fullReview],
  ] as const)('acepta %s omitiendo solo providerRequestIds', (kind, embedded, artifact) => {
    const before = structuredClone(artifact)
    expect(() => assertTerminalSnapshotV1PayloadCompatible(kind, embedded, artifact)).not.toThrow()
    expect(projectTerminalPayloadForSnapshotV1Compatibility(kind, artifact))
      .toEqual(embedded)
    expect(artifact).toEqual(before)
  })

  it.each([
    ['title', 'draft_adventure', { ...fullAdventure, title: 'Título divergente' }, '$.title'],
    ['content', 'draft_adventure', { ...fullAdventure, content: 'Texto divergente.' }, '$.content'],
    ['profile', 'draft_adventure', { ...fullAdventure, profile: 'student' }, '$.profile'],
    ['cost', 'draft_student', {
      ...fullStudent,
      usage: { ...fullStudent.usage, estimatedCost: 0.5 },
    }, '$.usage.estimatedCost'],
    ['warning', 'final_review', {
      ...fullReview,
      outcome: 'passed',
    }, '$.outcome'],
    ['issue', 'final_review', {
      ...fullReview,
      issues: ['Issue divergente.', ...fullReview.issues.slice(1)],
    }, '$.issues[0]'],
  ] as const)('rechaza una divergencia real de %s con ruta precisa', (
    _label,
    kind,
    artifact,
    path,
  ) => {
    const embedded = kind === 'draft_adventure'
      ? snapshotAdventure
      : kind === 'draft_student'
        ? snapshotStudent
        : snapshotReview
    expect(() => assertTerminalSnapshotV1PayloadCompatible(kind, embedded, artifact))
      .toThrow(path)
  })

  it('ignora el valor del ID remoto solo después de validar el hash completo', () => {
    const changed = structuredClone(fullAdventure)
    changed.usage.providerRequestIds = ['resp_otro_id_remoto_durable']
    const row = artifactRow(
      'b3000000-0000-4000-8000-000000000011',
      'draft_adventure',
      'adventure',
      changed,
    )
    expect(() => verifyTerminalArtifactReference(row, {
      pilotId,
      runId,
      kind: 'draft_adventure',
      key: 'adventure',
      version: 1,
    })).not.toThrow()
    expect(() => assertTerminalSnapshotV1PayloadCompatible(
      'draft_adventure',
      snapshotAdventure,
      changed,
    )).not.toThrow()

    expect(() => verifyTerminalArtifactReference({
      ...row,
      artifact_kind: 'draft_student',
      payload_hash: '0'.repeat(64),
    }, {
      pilotId,
      runId,
      kind: 'draft_adventure',
      key: 'adventure',
      version: 1,
    })).toThrow('no supera SHA-256')
  })

  it.each([
    ['pilot_id', 'b3000000-0000-4000-8000-000000000099', '$.pilot_id'],
    ['run_id', 'b3000000-0000-4000-8000-000000000099', '$.run_id'],
    ['artifact_kind', 'draft_student', '$.artifact_kind'],
    ['artifact_key', 'student', '$.artifact_key'],
    ['version', 2, '$.version'],
  ])('bloquea identidad durable incorrecta en %s', (field, value, path) => {
    expect(() => verifyTerminalArtifactReference({
      ...artifactRows[1],
      [field]: value,
    }, {
      pilotId,
      runId,
      kind: 'draft_adventure',
      key: 'adventure',
      version: 1,
    })).toThrow(path)
  })

  it('preserva providerRequestIds al producir nuevos snapshots v1', () => {
    const future = RealEditorialPilotSnapshotSchema.parse({
      ...snapshotPayload,
      drafts: [fullAdventure, fullStudent],
      review: fullReview,
    })
    expect(future.drafts[0].usage.providerRequestIds).toEqual(
      fullAdventure.usage.providerRequestIds,
    )
    expect(future.drafts[1].usage.providerRequestIds).toEqual(
      fullStudent.usage.providerRequestIds,
    )
    expect(future.review?.usage.providerRequestIds).toEqual(
      fullReview.usage.providerRequestIds,
    )
  })

  it('mantiene TypeScript y SQL sobre la misma especificación normativa limitada', async () => {
    const sql = await readFile(new URL(
      '../supabase/migrations/20260802113000_terminal_snapshot_v1_provider_request_compatibility.sql',
      import.meta.url,
    ), 'utf8')
    expect(sql).toContain('project_terminal_payload_for_snapshot_v1_compatibility')
    expect(sql).toContain("(p_payload->'usage') - 'providerRequestIds'")
    expect(sql).toContain(
      "snapshot.payload->>'version' is distinct from 'real-editorial-snapshot-v1'",
    )
    expect(sql).not.toMatch(/update public\.real_editorial_artifacts/i)
    expect(sql).not.toMatch(/delete from public\.real_editorial_artifacts/i)
    expect(sql).not.toMatch(/api\.tavily|api\.openai|fetch\(/i)
  })
})
