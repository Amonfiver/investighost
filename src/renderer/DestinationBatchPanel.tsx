import { useEffect, useState } from 'react'
import type {
  DestinationBatch,
  DestinationBatchReadModel,
} from '@shared/factory-batch-contracts'
import { formatBatchCreatedAt, jobStatusLabel, singleJobStatusLabel, smokeFixtureLabel, sortBatchesByCreatedAt } from './factory-presentation'

type ProductionBatchListItem = { batch: DestinationBatch; jobs: DestinationBatchReadModel['jobs'] }

export function DestinationBatchPanel({ onOpenBatch }: { onOpenBatch: (batchId: string) => void }): JSX.Element {
  const [batches, setBatches] = useState<ProductionBatchListItem[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = async () => {
    setBusy(true); setError(null)
    try {
      const listed = await window.electronAPI.listDestinationBatches()
      const enriched = await Promise.all(listed.map(async batch => {
        try { return { batch, jobs: (await window.electronAPI.readDestinationBatch(batch.id)).jobs } } catch { return { batch, jobs: [] } }
      }))
      setBatches(sortBatchesByCreatedAt(enriched.map(item => item.batch)).map(batch => enriched.find(item => item.batch.id === batch.id)!))
    } catch (reason) { setError(errorText(reason)) } finally { setBusy(false) }
  }
  useEffect(() => { void refresh() }, [])

  return (
    <section className="batch-import-layout" aria-label="Lotes de destinos">
      <div className="section-heading">
        <div><span className="card-kicker">CONTENT FACTORY V1</span><h2>Producción</h2><p>Consulta, reintenta y revisa los lotes ya creados.</p></div>
        <button className="button secondary" disabled={busy} onClick={() => { void refresh() }}>Actualizar</button>
      </div>
      {error && <div className="alert error" role="alert"><strong>No se pudieron cargar los lotes.</strong><span>{error}</span></div>}

      {batches.length > 0 && <section className="panel-card batch-list-card">
        <div className="section-heading compact"><div><span className="card-kicker">LOTES DURABLES</span><h3>Trabajo existente</h3></div></div>
        <div className="batch-list">{batches.map(({ batch, jobs }) => <button key={batch.id} className="batch-row" onClick={() => onOpenBatch(batch.id)} disabled={busy}>
          <span><strong>{batch.name}</strong><small>{formatBatchCreatedAt(batch.createdAt)} · {batch.totalItems} destinos · {batch.newItems} nuevos</small></span><span className="batch-row-meta">{smokeFixtureLabel(batch) && <span className="state-badge state-reused">{smokeFixtureLabel(batch)}</span>}{singleJobStatusLabel(jobs) ? <span className={`state-badge state-${jobs[0]!.status.toLowerCase()}`}>{singleJobStatusLabel(jobs)}</span> : <em>{jobStatusLabel(batch.status)}</em>}</span>
        </button>)}</div>
      </section>}
      {!batches.length && !error && <section className="empty-card"><p>Aún no hay lotes. Crea un destino o carga un JSON desde Nueva investigación.</p></section>}
    </section>
  )
}

function errorText(error: unknown): string { return error instanceof Error ? error.message : String(error) }
