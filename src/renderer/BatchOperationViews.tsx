import { useEffect, useState } from 'react'
import type { DestinationBatchReadModel, DestinationBatchJob } from '@shared/factory-batch-contracts'
import { BATCH_LIVE_REFRESH_INTERVAL_MS, formatCost, isActiveBatchJob, isActiveRedo, jobPhaseLabel, jobStatusLabel, technicalJobFailureDetail, userFacingJobFailure } from './factory-presentation'

export function BatchDetail({ batchId, onBack, onOpenJob }: { batchId: string; onBack: () => void; onOpenJob: (job: DestinationBatchJob) => void }) {
  const [model, setModel] = useState<DestinationBatchReadModel | null>(null)
  useEffect(() => { let mounted = true; void window.electronAPI.readDestinationBatch(batchId).then(value => { if (mounted) setModel(value) }); return () => { mounted = false } }, [batchId])
  const hasActiveJob = model?.jobs.some(isActiveBatchJob) ?? false
  useEffect(() => {
    if (!hasActiveJob) return
    const timer = window.setInterval(() => { void window.electronAPI.readDestinationBatch(batchId).then(setModel).catch(() => undefined) }, BATCH_LIVE_REFRESH_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [batchId, hasActiveJob])
  if (!model) return <section className="empty-card"><span className="spinner" /><p>Cargando lote durable…</p></section>
  const c = model.countsByStatus
  return <section className="batch-import-layout"><button className="back-link" onClick={onBack}>← Volver a producción</button><div className="section-heading"><div><span className="card-kicker">DETALLE DE LOTE</span><h2>{model.batch.name}</h2><p>{new Date(model.batch.createdAt).toLocaleString('es-ES')} · {jobStatusLabel(model.batch.status)}</p></div>{hasActiveJob && <LiveActivity />}</div><div className="metric-grid compact"><Metric label="Total" value={model.batch.totalItems} /><Metric label="En cola" value={c.QUEUED ?? 0} /><Metric label="Procesando" value={c.PROCESSING ?? 0} /><Metric label="Para revisar" value={c.READY_FOR_REVIEW ?? 0} /><Metric label="Aprobados" value={c.APPROVED ?? 0} /><Metric label="Rehacer" value={c.REDO_REQUIRED ?? 0} /><Metric label="Fallidos" value={c.FAILED ?? 0} /><Metric label="Coste" value={formatCost(model.jobs.reduce((n, job) => n + job.actualCost, 0))} /></div><section className="research-table">{model.jobs.map(job => <button className="research-row" key={job.id} onClick={() => onOpenJob(job)}><div className="destination-avatar">{job.originalName.slice(0, 2)}</div><div className="research-main"><strong>{job.originalName}</strong><small>{job.country}{job.region ? ` · ${job.region}` : ''}</small></div><div className="stage-copy"><strong>{jobPhaseLabel(job.currentPhase, job.redoScope)}</strong><small>{job.attemptCount} intentos · {formatCost(job.actualCost)}</small></div><span className={`state-badge state-${job.status.toLowerCase()}`}>{isActiveRedo(job) && <span className="spinner live-row-spinner" aria-label="Rehacer en curso" />}{jobStatusLabel(job.status, job.redoScope)}</span><span className="row-arrow">›</span></button>)}</section></section>
}

export function BatchJobDetail({ job, onBack, onOpenReview }: { job: DestinationBatchJob; onBack: () => void; onOpenReview: () => void }) {
  const [liveJob, setLiveJob] = useState(job)
  useEffect(() => { setLiveJob(job) }, [job])
  const active = isActiveBatchJob(liveJob)
  useEffect(() => {
    if (!active) return
    const refresh = () => void window.electronAPI.readDestinationBatch(liveJob.batchId).then(model => {
      const next = model.jobs.find(item => item.id === liveJob.id)
      if (next) setLiveJob(next)
    }).catch(() => undefined)
    const timer = window.setInterval(refresh, BATCH_LIVE_REFRESH_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [active, liveJob.batchId, liveJob.id])
  const phase = liveJob.status === 'READY_FOR_REVIEW' ? 'Lista para revisión' : jobPhaseLabel(liveJob.currentPhase, liveJob.redoScope)
  const redoActive = isActiveRedo(liveJob)
  return <section className="batch-import-layout destination-job-detail"><button className="back-link" onClick={onBack}>← Volver al lote</button><div className="section-heading"><div><h2>{liveJob.originalName}</h2><p>{liveJob.country}{liveJob.region ? ` · ${liveJob.region}` : ''}</p></div><span className={`state-badge state-${liveJob.status.toLowerCase()}`}>{jobStatusLabel(liveJob.status, liveJob.redoScope)}</span></div>{redoActive && <LiveActivity scope={liveJob.redoScope} />}<div className="metric-grid compact destination-job-metrics"><Metric label="Fase" value={phase} /><Metric label="Coste" value={formatCost(liveJob.actualCost)} /><Metric label="Intentos" value={liveJob.attemptCount} /></div>{liveJob.lastFailure && <div className="alert warning"><strong>{userFacingJobFailure(liveJob.lastFailure, liveJob.redoScope)}</strong><details><summary>Detalles técnicos</summary><span>{technicalJobFailureDetail(liveJob.lastFailure)}</span></details></div>}{liveJob.status === 'READY_FOR_REVIEW' && <div className="job-review-action"><button className="button primary" onClick={onOpenReview}>Abrir revisión</button></div>}</section>
}

function LiveActivity({ scope }: { scope?: DestinationBatchJob['redoScope'] }) { return <div className="live-job-status" role="status"><span className="spinner" /><div><strong>{scope ? jobStatusLabel('PROCESSING', scope) : 'Procesando'}</strong><small>Investighost está trabajando.</small></div></div> }
function Metric({ label, value }: { label: string; value: string | number }) { return <article className={`metric ${label === 'Fase' ? 'metric-phase' : ''}`}><span>{label}</span><strong>{value}</strong></article> }
