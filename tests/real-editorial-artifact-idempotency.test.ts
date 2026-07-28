import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  canonicalRealEditorialFocusedQuery,
  realEditorialPayloadDifferencePaths,
  realEditorialPayloadHash,
  RealEditorialRepositoryError,
  type RealEditorialArtifact,
} from '@modules/real-pipeline'
import {
  RealEditorialPilotRuntime,
  realEditorialResumeStateAllowsExecution,
} from '../src/main/real-editorial-pilot-runtime'
import {
  REAL_EDITORIAL_FEATURE_TOKEN,
} from '@shared/real-editorial-pilot-contracts'

const previousFlag = process.env.INVESTIGHOST_REAL_EDITORIAL_TOKEN

afterEach(() => {
  if (previousFlag === undefined) delete process.env.INVESTIGHOST_REAL_EDITORIAL_TOKEN
  else process.env.INVESTIGHOST_REAL_EDITORIAL_TOKEN = previousFlag
})

const existingPayload = {
  id: 'q3',
  gapId: 'g3',
  query: 'Morella rutas duración dificultad temporada y seguridad',
  rationale: 'Obtener duración, dificultad, temporada y riesgos.',
}

function existingArtifact(
  payload: Record<string, unknown> = existingPayload,
): RealEditorialArtifact {
  return {
    kind: 'query',
    key: 'q3',
    version: 1,
    payload,
    payloadHash: realEditorialPayloadHash(payload),
    createdAt: '2026-07-26T01:07:58.912Z',
  }
}

describe('idempotencia semántica de artefactos al reanudar', () => {
  it('reutiliza la query durable cuando solo cambia metadata no ejecutable', () => {
    const candidate = JSON.parse(JSON.stringify({
      rationale: 'Obtener duración, dificultad, temporada y seguridad.',
      query: existingPayload.query,
      gapId: existingPayload.gapId,
      id: existingPayload.id,
      updatedAt: '2026-07-28T17:18:01.188Z',
    }))

    expect(canonicalRealEditorialFocusedQuery(
      existingArtifact({ updatedAt: '2026-07-26T01:07:58.912Z', ...existingPayload }),
      candidate,
    )).toEqual(existingPayload)
    expect(realEditorialPayloadHash({ nested: { beta: 2, alpha: 1 } }))
      .toBe(realEditorialPayloadHash(JSON.parse('{"nested":{"alpha":1,"beta":2}}')))
  })

  it.each([
    ['gapId', { ...existingPayload, gapId: 'g4' }],
    ['query', { ...existingPayload, query: 'Morella rutas con otro alcance' }],
  ])('bloquea una divergencia semántica en %s con diagnóstico concreto', (field, candidate) => {
    expect(() => canonicalRealEditorialFocusedQuery(existingArtifact(), candidate))
      .toThrow(expect.objectContaining({
        name: 'RealEditorialRepositoryError',
        code: 'VERSION_CONFLICT',
        message: expect.stringContaining(String(field)),
      }))
  })

  it('identifica rutas divergentes sin depender del orden de propiedades', () => {
    expect(realEditorialPayloadDifferencePaths(
      { alpha: 1, nested: { stable: true, value: 2 } },
      { nested: { value: 3, stable: true }, alpha: 1 },
    )).toEqual(['$.nested.value'])
    expect(realEditorialPayloadDifferencePaths(
      { alpha: 1, beta: 2 },
      { beta: 2, alpha: 1 },
    )).toEqual([])
  })

  it('solo admite reanudación para preflight o etapas parciales no terminales', () => {
    expect(realEditorialResumeStateAllowsExecution('preflight')).toBe(true)
    expect(realEditorialResumeStateAllowsExecution('researching_round_2')).toBe(true)
    expect(realEditorialResumeStateAllowsExecution('final_review')).toBe(true)
    expect(realEditorialResumeStateAllowsExecution('review_required')).toBe(false)
    expect(realEditorialResumeStateAllowsExecution('pending_human_review')).toBe(false)
    expect(realEditorialResumeStateAllowsExecution('failed')).toBe(false)
  })

  it('repetir resume tras completar devuelve el resultado sin ejecutar de nuevo', async () => {
    process.env.INVESTIGHOST_REAL_EDITORIAL_TOKEN = REAL_EDITORIAL_FEATURE_TOKEN
    const stored = { state: 'pending_human_review', marker: 'durable-result' }
    const repository = {
      getPilot: vi.fn(async () => ({ state: 'pending_human_review' })),
      getResult: vi.fn(async () => stored),
      canResumeFromCheckpoint: vi.fn(),
      reopenCancelled: vi.fn(),
    }
    const runtime = new RealEditorialPilotRuntime(
      repository as never,
      {} as ConstructorParameters<typeof RealEditorialPilotRuntime>[1],
    )
    const start = vi.spyOn(runtime, 'start')

    await expect(runtime.resume({
      pilotId: '98000000-0000-4000-8000-000000000001',
    })).resolves.toBe(stored)
    expect(repository.getResult).toHaveBeenCalledOnce()
    expect(repository.canResumeFromCheckpoint).not.toHaveBeenCalled()
    expect(repository.reopenCancelled).not.toHaveBeenCalled()
    expect(start).not.toHaveBeenCalled()
  })

  it('conserva el tipo de error durable', () => {
    const error = new RealEditorialRepositoryError(
      'VERSION_CONFLICT',
      'El artefacto durable query/q3 v1 diverge en campos semánticos: query',
    )
    expect(error).toMatchObject({ retryable: false, code: 'VERSION_CONFLICT' })
  })
})
