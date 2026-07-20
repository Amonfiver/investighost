import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { MockEditorialSourceProvider, type MockSourceSeed } from '@modules/editorial-pipeline/mock-source-provider'
import { SourceAcquisitionService } from '@modules/editorial-pipeline/source-providers'
import { buildEditorialFixture } from './support/editorial-fixture'

const officialEvaluation = {
  accepted: true,
  sourceType: 'official' as const,
  territorialScope: 'destination' as const,
  freshness: 'current' as const,
  reliability: 0.95,
  reason: 'Fixture oficial, actual y territorialmente pertinente',
}

function seed(overrides: Partial<MockSourceSeed> = {}): MockSourceSeed {
  return {
    queries: ['Morella historia'],
    url: 'https://fixtures.investighost.local/morella/official?a=1&b=2',
    title: 'Fuente oficial sintética de Morella',
    publisher: 'Investighost fixtures',
    content: 'Morella conserva un recinto histórico sobre una elevación.',
    evaluation: officialEvaluation,
    ...overrides,
  }
}

function input(queries = ['Morella historia']) {
  const fixture = buildEditorialFixture()
  return {
    requestId: fixture.request.id,
    runId: fixture.run.id,
    actorId: fixture.request.actorId,
    correlationId: fixture.request.idempotencyKey,
    destination: fixture.destination,
    queries,
    language: 'es',
  }
}

function service(
  seeds: MockSourceSeed[],
  providerOptions: ConstructorParameters<typeof MockEditorialSourceProvider>[1] = {},
  limits: ConstructorParameters<typeof SourceAcquisitionService>[1] = {},
) {
  return new SourceAcquisitionService(
    new MockEditorialSourceProvider(seeds, providerOptions),
    { timeoutMs: 50, maxAttempts: 3, backoffMs: [0, 0, 0], ...limits },
    { id: randomUUID, sleep: async () => undefined, now: () => new Date('2026-07-21T10:00:00.000Z') },
  )
}

describe('source provider contracts and acquisition', () => {
  it('discovers, deduplicates normalized URLs and classifies broken links honestly', async () => {
    const provider = service([
      seed({ queries: ['Morella historia', 'Morella turismo'] }),
      seed({
        queries: ['Morella turismo'],
        url: 'https://fixtures.investighost.local/morella/official?b=2&a=1#duplicate',
      }),
      seed({
        queries: ['Morella turismo'],
        url: 'https://fixtures.investighost.local/morella/broken',
        title: 'Enlace roto sintético',
        content: undefined,
        httpStatus: 404,
      }),
    ])
    const result = await provider.acquire(input(['Morella historia', 'Morella turismo']))
    expect(result.sources).toHaveLength(2)
    expect(result.sources.map(source => source.status).sort()).toEqual(['accepted', 'unavailable'])
    expect(result.simulation).toBe(true)
  })

  it('marks duplicate content while preserving both source records', async () => {
    const result = await service([
      seed(),
      seed({ url: 'https://fixtures.investighost.local/morella/mirror' }),
    ]).acquire(input())
    expect(result.sources).toHaveLength(2)
    expect(result.sources[0].status).toBe('accepted')
    expect(result.sources[1].status).toBe('rejected')
    expect(result.sources[1].duplicateOfId).toBe(result.sources[0].id)
  })

  it('retries transient reading failures with bounded backoff and auditable usage', async () => {
    const result = await service([seed({ transientReadFailures: 2 })]).acquire(input())
    expect(result.sources[0].status).toBe('accepted')
    expect(result.usage.filter(item => item.cause.startsWith('reading:attempt:'))).toHaveLength(3)
    expect(result.events.some(event => event.type === 'provider.reading.TRANSIENT')).toBe(true)
  })

  it('enforces an operation timeout and aborts the provider', async () => {
    const acquisition = service([seed()], { latencyMs: 30 }, { timeoutMs: 5, maxAttempts: 1 })
    await expect(acquisition.acquire(input())).rejects.toMatchObject({ code: 'TIMEOUT' })
  })

  it('propagates explicit cancellation without retrying', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(service([seed()]).acquire({ ...input(), signal: controller.signal }))
      .rejects.toMatchObject({ code: 'CANCELLED' })
  })

  it('blocks work before exceeding the configured budget', async () => {
    const acquisition = service([seed()], {}, {
      budgetLimit: 0.1,
      costs: { discovery: 0.2, reading: 0, evaluation: 0 },
    })
    await expect(acquisition.acquire(input())).rejects.toMatchObject({ code: 'BUDGET_EXCEEDED' })
  })

  it('enforces query limits before calling the provider', async () => {
    const acquisition = service([seed()], {}, { maxQueries: 1 })
    await expect(acquisition.acquire(input(['uno', 'dos']))).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' })
  })

  it('opens a circuit after consecutive provider failures', async () => {
    const acquisition = service([seed()], { discoveryFailures: 5 }, {
      maxAttempts: 1,
      circuitFailureThreshold: 2,
      circuitOpenMs: 60_000,
    })
    await expect(acquisition.acquire(input())).rejects.toMatchObject({ code: 'TRANSIENT' })
    await expect(acquisition.acquire(input())).rejects.toMatchObject({ code: 'TRANSIENT' })
    await expect(acquisition.acquire(input())).rejects.toMatchObject({ code: 'CIRCUIT_OPEN' })
  })

  it('records bounded costs and redacted events without source content or queries', async () => {
    const result = await service([seed({ content: 'SECRET_FIXTURE_CONTENT' })], {}, {
      budgetLimit: 1,
      costs: { discovery: 0.01, reading: 0.02, evaluation: 0.03 },
    }).acquire(input())
    expect(result.actualCost).toBe(0.06)
    expect(result.usage.reduce((total, item) => total + (item.actualCost ?? 0), 0)).toBeCloseTo(0.06)
    expect(JSON.stringify(result.events)).not.toContain('SECRET_FIXTURE_CONTENT')
    expect(JSON.stringify(result.events)).not.toContain('Morella historia')
  })
})
