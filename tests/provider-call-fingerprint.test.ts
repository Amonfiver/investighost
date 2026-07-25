import { describe, expect, it } from 'vitest'
import {
  createProviderCallPayloadFingerprint,
} from '@modules/real-pipeline/provider-call-fingerprint'

const payloadHash = 'a'.repeat(64)

function fingerprint(overrides: Record<string, unknown> = {}) {
  return createProviderCallPayloadFingerprint({
    executionId: 'execution-morella',
    requestId: 'request-morella',
    runId: 'run-morella',
    taskId: 'task-morella',
    batchId: 'batch-morella',
    budgetDate: '2026-07-25',
    stage: 'researching_round_1',
    operation: 'search',
    providerId: 'tavily',
    model: 'search-and-extract',
    attempt: 1,
    estimatedCost: 0.08,
    reservedCost: 0.08,
    currency: 'EUR',
    tariffId: 'tariff-tavily-v1',
    promptVersion: 'mission-v1',
    schemaVersion: 'real-v1',
    payloadHash,
    maxInputTokens: 100_000,
    maxOutputTokens: 12_000,
    maxToolCalls: 2,
    maxCredits: 4,
    tools: ['search', 'extract'],
    ...overrides,
  })
}

describe('fingerprint canónico de payload y límites de proveedor', () => {
  it('es estable e ignora orden y duplicados irrelevantes de herramientas', () => {
    expect(fingerprint()).toBe(fingerprint({
      tools: ['extract', 'search', 'extract'],
    }))
  })

  it.each([
    ['execution', { executionId: 'execution-other' }],
    ['request', { requestId: 'request-other' }],
    ['run', { runId: 'run-other' }],
    ['task', { taskId: 'task-other' }],
    ['batch', { batchId: 'batch-other' }],
    ['budget date', { budgetDate: '2026-07-26' }],
    ['stage', { stage: 'analyzing_round_1' }],
    ['operation', { operation: 'extract' }],
    ['provider', { providerId: 'openai' }],
    ['model', { model: 'structured-responses' }],
    ['attempt', { attempt: 2 }],
    ['retry origin', { retryOfCallId: 'call-previous' }],
    ['estimated cost', { estimatedCost: 0.07 }],
    ['maximum reservation', { reservedCost: 0.07 }],
    ['currency', { currency: 'USD' }],
    ['tariff', { tariffId: 'tariff-tavily-v2' }],
    ['prompt version', { promptVersion: 'mission-v2' }],
    ['schema version', { schemaVersion: 'real-v2' }],
    ['payload', { payloadHash: 'b'.repeat(64) }],
    ['input tokens', { maxInputTokens: 99_999 }],
    ['output tokens', { maxOutputTokens: 11_999 }],
    ['tool calls', { maxToolCalls: 1 }],
    ['credits', { maxCredits: 3 }],
    ['tools', { tools: ['search'] }],
  ])('cambia si cambia %s', (_field, patch) => {
    expect(fingerprint(patch)).not.toBe(fingerprint())
  })

  it('solo persiste hashes y límites; no admite prompts, credenciales o payload completo', () => {
    expect(() => fingerprint({ payloadHash: 'prompt completo' })).toThrow()
    expect(() => fingerprint({ prompt: 'prompt completo' })).toThrow()
    expect(() => fingerprint({ credential: 'secreto' })).toThrow()
    expect(Object.keys({
      payloadHash,
      maxInputTokens: 1,
      maxOutputTokens: 1,
      maxToolCalls: 1,
      maxCredits: 1,
      tools: [],
    })).not.toEqual(expect.arrayContaining(['prompt', 'credential', 'payload']))
  })
})
