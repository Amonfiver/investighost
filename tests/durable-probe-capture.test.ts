import { mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import {
  DurableProbeCapture,
  DurableProbeCaptureError,
} from '@modules/real-pipeline/durable-probe-capture'

describe('captura durable de sondas', () => {
  it('conserva el resultado de una operación simulada de más de 30 s sin iniciar una segunda', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'investighost-probe-'))
    try {
      let timestamp = new Date('2026-09-15T15:00:00.000Z')
      const capture = new DurableProbeCapture(path.join(directory, 'probe.json'), () => timestamp)
      let calls = 0
      let resolve!: (value: Record<string, unknown>) => void
      const remoteOperation = new Promise<Record<string, unknown>>(done => {
        calls += 1
        resolve = done
      })

      await capture.begin('small-context-1', { phase: 'before_remote_call' })
      expect(await capture.read()).toMatchObject({ status: 'running', probeId: 'small-context-1' })
      await expect(capture.begin('small-context-2', {})).rejects.toMatchObject({
        code: 'PROBE_ALREADY_RUNNING',
      } satisfies Partial<DurableProbeCaptureError>)

      // Simula que el canal que lanzó la promesa desaparece antes del resultado.
      resolve({
        remoteId: 'ds-fixture',
        status: 'completed',
        incompleteReason: null,
        usage: { inputTokens: 172, cachedInputTokens: 0, reasoningTokens: 31, outputTokens: 98 },
        rawMetadata: { outputTextChars: 1234, outputJsonValid: true },
        durationMs: 31_000,
        error: null,
        schemaValidation: 'pass',
        costEur: 0.00010252,
      })
      const result = await remoteOperation
      timestamp = new Date('2026-09-15T15:00:31.000Z')
      await capture.complete('completed', 31_000, result)

      expect(calls).toBe(1)
      expect(await capture.read()).toMatchObject({
        status: 'completed',
        durationMs: 31_000,
        payload: {
          remoteId: 'ds-fixture',
          status: 'completed',
          usage: { reasoningTokens: 31, outputTokens: 98 },
          rawMetadata: { outputJsonValid: true },
          schemaValidation: 'pass',
        },
      })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
