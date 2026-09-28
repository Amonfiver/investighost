import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AmbiguousCallResolutionForm, BatchJobDetail } from '../src/renderer/BatchOperationViews'
import { DestinationBatchJobSchema } from '../src/shared/factory-batch-contracts'
import { DestinationBatchService, MemoryDestinationBatchRepository } from '../src/modules/factory-batches'
import { GeographicResolver, MemoryGeographyCatalogRepository } from '../src/modules/editorial-pipeline/geography'

const failedJob = DestinationBatchJobSchema.parse({
  id: '90000000-0000-4000-8000-000000000001', batchId: '90000000-0000-4000-8000-000000000002', inputIndex: 0,
  originalName: 'Segovia', country: 'España', normalizedName: 'segovia', normalizedCountry: 'ES', normalizedIdentity: 'segovia|ES',
  identityState: 'NEW', reusePolicy: 'NEEDS_NEW_PRODUCTION', status: 'FAILED', currentPhase: 'RESEARCH', completedPhases: ['IDENTITY'], artifactRefs: {},
  attemptCount: 1, retryable: true, lastFailure: 'CANONICAL_DESTINATION_REQUIRED: El job no tiene una identidad geográfica canónica', actualCost: 0,
  createdAt: new Date('2026-09-27T00:00:00.000Z'), updatedAt: new Date('2026-09-27T00:00:00.000Z'),
})

describe('Production job detail', () => {
  const realSegoviaJob = { ...failedJob, id: '2efade2d-b011-4cc2-a51d-ce2a095036c1' }

  it('REAL_PRODUCTION_JOB_DETAIL_SHOWS_RETRY for the same failed retryable job rendered by App', () => {
    const html = renderToStaticMarkup(<BatchJobDetail job={failedJob} onBack={() => undefined} onOpenReview={() => undefined} />)
    expect(html).toContain('Reintentar')
    expect(html).toContain('Segovia')
  })

  it('hides retry for a non-retryable failed job', () => {
    const html = renderToStaticMarkup(<BatchJobDetail job={{ ...failedJob, retryable: false }} onBack={() => undefined} onOpenReview={() => undefined} />)
    expect(html).not.toContain('Reintentar')
  })

  it('REAL_HISTORICAL_SEGOVIA_JOB_RETRY_VISIBLE maps the persisted production shape through the real read model', async () => {
    const repository = new MemoryDestinationBatchRepository()
    const service = new DestinationBatchService(repository, new GeographicResolver(new MemoryGeographyCatalogRepository([]), 'fixture-v1'))
    const imported = await service.importJson(JSON.stringify({ batchName: 'Piloto real Segovia', destinations: [{ name: 'Segovia', country: 'España' }] }))
    const historical = imported.jobs[0]!
    await repository.updateJob({
      ...historical, status: 'FAILED', currentPhase: 'IDENTITY', completedPhases: [], artifactRefs: {}, attemptCount: 1, retryable: false,
      lastFailure: 'El job no tiene una identidad geográfica canónica: El job no tiene una identidad geográfica canónica', updatedAt: new Date(),
    })
    const read = await service.read(imported.batch.id)
    expect(read.jobs[0]).toMatchObject({ id: historical.id, status: 'FAILED', currentPhase: 'IDENTITY', retryable: true, attemptCount: 1 })
    const html = renderToStaticMarkup(<BatchJobDetail job={read.jobs[0]!} onBack={() => undefined} onOpenReview={() => undefined} />)
    expect(html).toContain('Reintentar')
  })

  it('keeps the real authorization action and structured diagnostics on the production job-detail route', async () => {
    const { readFile } = await import('node:fs/promises')
    const renderer = await readFile(new URL('../src/renderer/BatchOperationViews.tsx', import.meta.url), 'utf8')
    expect(renderer).toContain('Autorizar ejecución real')
    expect(renderer).toContain('getDestinationBatchTechnicalDiagnostics')
    expect(renderer).toContain('La red está separada de la autorización de coste de este trabajo.')
    expect(renderer).toContain('TechnicalDiagnostic')
    expect(renderer).toContain('Estado reserva')
    expect(renderer).toContain('Transición solicitada')
    expect(renderer).toContain('Resolver resultado ambiguo')
    expect(renderer).toContain('Confirmar resolución humana')
    expect(renderer).toContain("retrying ? 'Reintentando…' : 'Reintentar'")
  })

  it('FORM_PREFILLS_KNOWN_EVIDENCE and renders every Segovia value in the actual reconciliation form', () => {
    const html = renderToStaticMarkup(<AmbiguousCallResolutionForm job={realSegoviaJob} saving={false} onCancel={() => undefined} onConfirm={() => undefined} />)
    for (const value of ['deepseek-flash', '2026-09-27T20:00:00+02:00', '2026-09-27T21:00:00+02:00', 'investighost', '40341', '8036', '0.01087275', 'Usage export aggregated hourly; request ID unavailable.']) expect(html).toContain(value)
    expect(html).toContain('Resumen para confirmar')
    expect(html).toContain('Cancelar')
    expect(html).toContain('readOnly=""')
  })

  it('INPUT_VALUE_PERSISTS_AFTER_TYPING and CONFIRM_DISABLED_WHEN_INVALID use a durable local form draft', async () => {
    const { readFile } = await import('node:fs/promises')
    const renderer = await readFile(new URL('../src/renderer/BatchOperationViews.tsx', import.meta.url), 'utf8')
    expect(renderer).toContain('useState(() => createAmbiguousUsageDraft(job))')
    expect(renderer).toContain("setDraft(current => ({ ...current, [key]: value }))")
    expect(renderer).toContain('disabled={saving || !valid}')
    const blank = renderToStaticMarkup(<AmbiguousCallResolutionForm job={failedJob} saving={false} onCancel={() => undefined} onConfirm={() => undefined} />)
    expect(blank).toContain('disabled=""')
    expect(blank).toContain('type="button"')
  })

  it('uses a responsive two-column form without the old one-row action layout', async () => {
    const { readFile } = await import('node:fs/promises')
    const css = await readFile(new URL('../src/renderer/App.css', import.meta.url), 'utf8')
    expect(css).toContain('.ambiguous-resolution-form { display: grid;')
    expect(css).toContain('.ambiguous-resolution-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));')
    expect(css).toContain('.ambiguous-resolution-fields { grid-template-columns: 1fr; }')
    expect(css).toContain('body { margin: 0; min-width: 320px;')
  })
})
