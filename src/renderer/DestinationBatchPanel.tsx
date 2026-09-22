import { useEffect, useState } from 'react'
import type {
  DestinationBatch,
  DestinationBatchImportResult,
  DestinationBatchReadModel,
} from '@shared/factory-batch-contracts'

const label: Record<string, string> = {
  QUEUED: 'En cola', PROCESSING: 'Procesando', READY_FOR_REVIEW: 'Lista para revisión',
  APPROVED: 'Aprobado', REDO_REQUIRED: 'Rehacer', DELIVERED: 'Entregado', FAILED: 'Fallido',
  BLOCKED_AMBIGUOUS: 'Ambiguo', REUSED: 'Reutilizable',
}

export function DestinationBatchPanel(): JSX.Element {
  const [batches, setBatches] = useState<DestinationBatch[]>([])
  const [selected, setSelected] = useState<DestinationBatchReadModel | null>(null)
  const [jsonText, setJsonText] = useState('')
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const refresh = async () => {
    try { setBatches(await window.electronAPI.listDestinationBatches()) } catch (reason) { setError(errorText(reason)) }
  }
  useEffect(() => { void refresh() }, [])

  const load = async (batchId: string) => {
    setBusy(true); setError(null)
    try { setSelected(await window.electronAPI.readDestinationBatch(batchId)) } catch (reason) { setError(errorText(reason)) } finally { setBusy(false) }
  }

  const chooseFile = async (file: File | undefined) => {
    if (!file) return
    setError(null); setNotice(null); setFileName(file.name)
    try { setJsonText(await file.text()) } catch (reason) { setError(errorText(reason)) }
  }

  const submit = async () => {
    if (!jsonText.trim()) return
    setBusy(true); setError(null); setNotice(null)
    try {
      const result: DestinationBatchImportResult = await window.electronAPI.importDestinationBatchJson(jsonText)
      setSelected({
        batch: result.batch, jobs: result.jobs, issues: result.issues,
        countsByStatus: Object.fromEntries(['QUEUED', 'PROCESSING', 'READY_FOR_REVIEW', 'APPROVED', 'REDO_REQUIRED', 'DELIVERED', 'FAILED', 'BLOCKED_AMBIGUOUS', 'REUSED']
          .map(status => [status, result.jobs.filter(job => job.status === status).length])) as DestinationBatchReadModel['countsByStatus'],
      })
      setNotice(result.idempotentReplay ? 'El mismo import ya existía: se reutilizó el lote durable.' : 'Lote importado. Ningún proveedor se ha ejecutado.')
      await refresh()
    } catch (reason) { setError(errorText(reason)) } finally { setBusy(false) }
  }

  const retry = async (jobId: string) => {
    setBusy(true); setError(null)
    try {
      const result = await window.electronAPI.retryDestinationBatchJob(jobId)
      if (selected) await load(selected.batch.id)
      setNotice(`Trabajo devuelto a cola desde ${result.resumedPhase}.`)
    } catch (reason) { setError(errorText(reason)) } finally { setBusy(false) }
  }

  const start = async () => {
    if (!selected) return
    setBusy(true); setError(null); setNotice(null)
    try {
      const results = await window.electronAPI.startDestinationBatch(selected.batch.id)
      await load(selected.batch.id)
      setNotice(results.some(result => result.budgetBlocked) ? 'El lote se pausó por su límite de coste.' : 'Ejecución de lote finalizada; revisa los estados por destino.')
    } catch (reason) { setError(errorText(reason)) } finally { setBusy(false) }
  }

  return (
    <section className="batch-import-layout" aria-label="Lotes de destinos">
      <div className="section-heading">
        <div><span className="card-kicker">CONTENT FACTORY V1</span><h2>Importar lote de destinos</h2><p>JSON de hasta 50 destinos. La producción editorial permanece en cola.</p></div>
        <button className="button secondary" disabled={busy} onClick={() => { void refresh() }}>Actualizar</button>
      </div>
      {error && <div className="alert error" role="alert"><strong>No se pudo importar el lote.</strong><span>{error}</span></div>}
      {notice && <div className="alert success" role="status"><strong>{notice}</strong></div>}
      <section className="form-card">
        <label className="field"><span>Archivo JSON</span><input type="file" accept="application/json,.json" disabled={busy} onChange={event => { void chooseFile(event.currentTarget.files?.[0]) }} /></label>
        <small className="muted">{fileName || 'Formato: batch.name y destinations[].name/country; region es opcional.'}</small>
        <div className="form-actions"><button className="button primary" disabled={busy || !jsonText.trim()} onClick={() => { void submit() }}>Importar lote JSON</button></div>
      </section>

      {batches.length > 0 && <section className="panel-card batch-list-card">
        <div className="section-heading compact"><div><span className="card-kicker">LOTES DURABLES</span><h3>Importaciones</h3></div></div>
        <div className="batch-list">{batches.map(batch => <button key={batch.id} className={selected?.batch.id === batch.id ? 'batch-row selected' : 'batch-row'} onClick={() => { void load(batch.id) }} disabled={busy}>
          <span><strong>{batch.name}</strong><small>{batch.totalItems} recibidos · {batch.newItems} nuevos · {batch.ambiguousItems} ambiguos</small></span><em>{batch.status}</em>
        </button>)}</div>
      </section>}

      {selected && <>
        <div className="form-actions"><button className="button primary" disabled={busy || selected.countsByStatus.QUEUED === 0} onClick={() => { void start() }}>Iniciar producción</button></div>
        <div className="metric-grid compact">
          <Metric label="Recibidos" value={selected.batch.totalItems} note={`${selected.batch.validItems} filas válidas`} />
          <Metric label="Nuevos" value={selected.batch.newItems} note={`${selected.countsByStatus.QUEUED} en cola`} />
          <Metric label="Existentes" value={selected.batch.existingItems} note={`${selected.batch.reusableItems} reutilizables`} />
          <Metric label="Ambiguos / errores" value={selected.batch.ambiguousItems + selected.batch.invalidItems} note={`${selected.batch.duplicateItems} duplicados internos`} warning />
        </div>
        <section className="research-table" aria-label="Trabajos del lote">
          {selected.jobs.map(job => <article className="batch-job-row" key={job.id}>
            <div className="destination-avatar">{job.originalName.slice(0, 2).toUpperCase()}</div>
            <div className="research-main"><strong>{job.originalName}</strong><small>{job.country}{job.region ? ` · ${job.region}` : ''}</small></div>
            <div className="stage-copy"><strong>{job.currentPhase}</strong><small>{job.attemptCount} intento{job.attemptCount === 1 ? '' : 's'} · {job.actualCost.toFixed(4)} EUR</small></div>
            <span className={`state-badge state-${job.status.toLowerCase()}`}>{label[job.status]}</span>
            {['FAILED', 'REDO_REQUIRED'].includes(job.status) && <button className="text-button" disabled={busy} onClick={() => { void retry(job.id) }}>Reintentar</button>}
            {job.lastFailure && <small className="muted">{job.lastFailure}</small>}
          </article>)}
        </section>
        {selected.issues.length > 0 && <section className="alert warning"><strong>Filas no procesables</strong><span>{selected.issues.map(issue => `#${issue.inputIndex + 1}: ${issue.message}`).join(' · ')}</span></section>}
      </>}
    </section>
  )
}

function Metric({ label, value, note, warning = false }: { label: string; value: number; note: string; warning?: boolean }): JSX.Element {
  return <article className={`metric ${warning ? 'warn' : ''}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>
}

function errorText(error: unknown): string { return error instanceof Error ? error.message : String(error) }
