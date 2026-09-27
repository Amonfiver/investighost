import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { BatchJobDetail } from '../src/renderer/BatchOperationViews'
import { DestinationBatchJobSchema } from '../src/shared/factory-batch-contracts'

const failedJob = DestinationBatchJobSchema.parse({
  id: '90000000-0000-4000-8000-000000000001', batchId: '90000000-0000-4000-8000-000000000002', inputIndex: 0,
  originalName: 'Segovia', country: 'España', normalizedName: 'segovia', normalizedCountry: 'ES', normalizedIdentity: 'segovia|ES',
  identityState: 'NEW', reusePolicy: 'NEEDS_NEW_PRODUCTION', status: 'FAILED', currentPhase: 'RESEARCH', completedPhases: ['IDENTITY'], artifactRefs: {},
  attemptCount: 1, retryable: true, lastFailure: 'CANONICAL_DESTINATION_REQUIRED: El job no tiene una identidad geográfica canónica', actualCost: 0,
  createdAt: new Date('2026-09-27T00:00:00.000Z'), updatedAt: new Date('2026-09-27T00:00:00.000Z'),
})

describe('Production job detail', () => {
  it('REAL_PRODUCTION_JOB_DETAIL_SHOWS_RETRY for the same failed retryable job rendered by App', () => {
    const html = renderToStaticMarkup(<BatchJobDetail job={failedJob} onBack={() => undefined} onOpenReview={() => undefined} />)
    expect(html).toContain('Reintentar')
    expect(html).toContain('Segovia')
  })

  it('hides retry for a non-retryable failed job', () => {
    const html = renderToStaticMarkup(<BatchJobDetail job={{ ...failedJob, retryable: false }} onBack={() => undefined} onOpenReview={() => undefined} />)
    expect(html).not.toContain('Reintentar')
  })
})
