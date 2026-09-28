import { useEffect, useState, type FormEvent } from 'react'
import type { BatchAmbiguousCallResolution, DestinationBatchReadModel, DestinationBatchJob } from '@shared/factory-batch-contracts'
import { BATCH_LIVE_REFRESH_INTERVAL_MS, formatCost, isActiveBatchJob, isActiveRedo, jobPhaseLabel, jobStatusLabel, technicalJobFailureDetail, userFacingJobFailure } from './factory-presentation'
import type { FactoryBatchTechnicalDiagnostic } from '../main/factory-batch-diagnostics'

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
  const completed = (c.APPROVED ?? 0) + (c.DELIVERED ?? 0)
  return <section className="batch-import-layout"><button className="back-link" onClick={onBack}>← Volver a producción</button><div className="section-heading"><div><span className="card-kicker">DETALLE DE LOTE</span><h2>{model.batch.name}</h2><p>{new Date(model.batch.createdAt).toLocaleString('es-ES')} · {jobStatusLabel(model.batch.status)}</p></div>{hasActiveJob && <LiveActivity />}</div><div className="metric-grid compact"><Metric label="Total" value={model.batch.totalItems} /><Metric label="En cola" value={c.QUEUED ?? 0} /><Metric label="Procesando" value={c.PROCESSING ?? 0} /><Metric label="Para revisar" value={c.READY_FOR_REVIEW ?? 0} /><Metric label="Aprobados" value={c.APPROVED ?? 0} /><Metric label="Rehacer" value={c.REDO_REQUIRED ?? 0} /><Metric label="Fallidos" value={c.FAILED ?? 0} /><Metric label="Coste" value={formatCost(model.jobs.reduce((n, job) => n + job.actualCost, 0))} /></div><p className="muted" aria-label="Resumen final del lote">Resumen: {completed} completados · {c.REUSED ?? 0} reutilizados · {c.FAILED ?? 0} fallidos · {c.READY_FOR_REVIEW ?? 0} para revisar.</p><section className="research-table">{model.jobs.map(job => <button className="research-row" key={job.id} onClick={() => onOpenJob(job)}><div className="destination-avatar">{job.originalName.slice(0, 2)}</div><div className="research-main"><strong>{job.originalName}</strong><small>{job.country}{job.region ? ` · ${job.region}` : ''}</small></div><div className="stage-copy"><strong>{jobPhaseLabel(job.currentPhase, job.redoScope)}</strong><small>{job.attemptCount} intentos · {formatCost(job.actualCost)}</small></div><span className={`state-badge state-${job.status.toLowerCase()}`}>{isActiveRedo(job) && <span className="spinner live-row-spinner" aria-label="Rehacer en curso" />}{jobStatusLabel(job.status, job.redoScope)}</span><span className="row-arrow">›</span></button>)}</section></section>
}

export function BatchJobDetail({ job, onBack, onOpenReview }: { job: DestinationBatchJob; onBack: () => void; onOpenReview: () => void }) {
  const [liveJob, setLiveJob] = useState(job)
  const [retrying, setRetrying] = useState(false)
  const [awaitingRetryProgress, setAwaitingRetryProgress] = useState(false)
  const [retryError, setRetryError] = useState<string | null>(null)
  const [authorizationError, setAuthorizationError] = useState<string | null>(null)
  const [authorizing, setAuthorizing] = useState(false)
  const [authorizationState, setAuthorizationState] = useState<'AUTHORIZED' | 'NOT_AUTHORIZED'>('NOT_AUTHORIZED')
  const [diagnostic, setDiagnostic] = useState<FactoryBatchTechnicalDiagnostic | null>(null)
  const [showResolution, setShowResolution] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [resolutionError, setResolutionError] = useState<string | null>(null)
  const [savedResolution, setSavedResolution] = useState<BatchAmbiguousCallResolution['decision'] | null>(null)
  useEffect(() => { setLiveJob(job) }, [job])
  useEffect(() => {
    let mounted = true
    void Promise.all([
      window.electronAPI.getDestinationBatchAuthorizationStatus(job.id),
      window.electronAPI.getDestinationBatchTechnicalDiagnostics(job.id),
    ]).then(([authorization, details]) => {
      if (!mounted) return
      setAuthorizationState(authorization.state)
      setDiagnostic(details)
    }).catch(() => undefined)
    return () => { mounted = false }
  }, [job.id, liveJob.updatedAt])
  const active = isActiveBatchJob(liveJob) || awaitingRetryProgress
  useEffect(() => {
    if (!active) return
    const refresh = () => void window.electronAPI.readDestinationBatch(liveJob.batchId).then(model => {
      const next = model.jobs.find(item => item.id === liveJob.id)
      if (next) {
        setLiveJob(next)
        if (next.status !== 'QUEUED') setAwaitingRetryProgress(false)
      }
    }).catch(() => undefined)
    const timer = window.setInterval(refresh, BATCH_LIVE_REFRESH_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [active, liveJob.batchId, liveJob.id])
  const phase = liveJob.status === 'READY_FOR_REVIEW' ? 'Lista para revisión' : jobPhaseLabel(liveJob.currentPhase, liveJob.redoScope)
  const redoActive = isActiveRedo(liveJob)
  const retry = async () => { setRetrying(true); setRetryError(null); try { const result = await window.electronAPI.retryDestinationBatchJob(liveJob.id); setLiveJob(result.job); setAwaitingRetryProgress(true) } catch (reason) { setRetryError(reason instanceof Error ? reason.message : String(reason)) } finally { setRetrying(false) } }
  const authorize = async () => {
    setAuthorizing(true); setAuthorizationError(null)
    try {
      const result = await window.electronAPI.authorizeDestinationBatchRealExecution(liveJob.id)
      setAuthorizationState(result.state)
      setDiagnostic(current => current ? { ...current, authorizationState: result.state } : current)
    } catch (reason) { setAuthorizationError(reason instanceof Error ? reason.message : String(reason)) } finally { setAuthorizing(false) }
  }
  const resolveAmbiguity = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setResolving(true); setResolutionError(null)
    const values = new FormData(event.currentTarget)
    const decision = String(values.get('decision')) as BatchAmbiguousCallResolution['decision']
    const base = { jobId: liveJob.id, decision, responseRecovered: false }
    const input: BatchAmbiguousCallResolution = decision === 'CONSUMPTION_CONFIRMED'
      ? { ...base, decision, evidence: {
        evidenceType: 'PROVIDER_USAGE_EXPORT', provider: 'deepseek', model: String(values.get('model')),
        windowStart: String(values.get('windowStart')), windowEnd: String(values.get('windowEnd')),
        apiKeyName: String(values.get('apiKeyName')), requestCount: Number(values.get('requestCount')),
        inputCacheMissTokens: Number(values.get('inputCacheMissTokens')), outputTokens: Number(values.get('outputTokens')),
        providerCost: Number(values.get('providerCost')), currency: 'USD', requestIdPresentInExport: false,
        limitation: String(values.get('limitation')),
      }, note: String(values.get('note') || '') || undefined }
      : { ...base, decision, note: String(values.get('note') || '') || undefined }
    try {
      const result = await window.electronAPI.resolveDestinationBatchAmbiguousCall(input)
      setLiveJob(result.job); setSavedResolution(decision); setShowResolution(false)
      setDiagnostic(await window.electronAPI.getDestinationBatchTechnicalDiagnostics(liveJob.id))
    } catch (reason) { setResolutionError(reason instanceof Error ? reason.message : String(reason)) } finally { setResolving(false) }
  }
  const authorizationRequired = diagnostic?.errorCode === 'BATCH_PROVIDER_AUTHORIZATION_REQUIRED'
  const ambiguous = diagnostic?.reservation?.reservationState === 'unknown'
  const savedResolutionMessage = savedResolution === 'CONSUMPTION_CONFIRMED'
    ? 'Consumo confirmado; respuesta no recuperable. Puede reintentarse la generación sin repetir la investigación ya conservada.'
    : savedResolution === 'NO_CONSUMPTION'
      ? 'No se confirmó consumo. Puede reintentarse la generación.'
      : savedResolution === 'INDETERMINATE'
        ? 'La llamada sigue indeterminada y queda bloqueada para evitar un posible doble consumo.'
        : null
  return <section className="batch-import-layout destination-job-detail"><button className="back-link" onClick={onBack}>← Volver al lote</button><div className="section-heading"><div><h2>{liveJob.originalName}</h2><p>{liveJob.country}{liveJob.region ? ` · ${liveJob.region}` : ''}</p></div><span className={`state-badge state-${liveJob.status.toLowerCase()}`}>{jobStatusLabel(liveJob.status, liveJob.redoScope)}</span></div>{redoActive && <LiveActivity scope={liveJob.redoScope} />}<div className="metric-grid compact destination-job-metrics"><Metric label="Fase" value={phase} /><Metric label="Coste" value={formatCost(liveJob.actualCost)} /><Metric label="Intentos" value={liveJob.attemptCount} /></div>{retryError && <div className="alert error"><strong>No se pudo reintentar.</strong><span>{retryError}</span></div>}{authorizationError && <div className="alert error"><strong>No se pudo autorizar.</strong><span>{authorizationError}</span></div>}{resolutionError && <div className="alert error"><strong>No se pudo guardar la resolución.</strong><span>{resolutionError}</span></div>}{savedResolutionMessage && <div className="alert success">{savedResolutionMessage}</div>}{liveJob.lastFailure && <div className="alert warning"><strong>{userFacingJobFailure(liveJob.lastFailure, liveJob.redoScope)}</strong><details><summary>Detalles técnicos</summary>{diagnostic ? <TechnicalDiagnostic details={diagnostic} /> : <span>{technicalJobFailureDetail(liveJob.lastFailure)}</span>}</details></div>}{ambiguous && !showResolution && <div className="job-review-action"><p className="muted">La llamada tiene resultado remoto ambiguo y permanece bloqueada hasta una decisión humana.</p><button className="button secondary" onClick={() => setShowResolution(true)}>Resolver resultado ambiguo</button></div>}{showResolution && <form className="job-review-action" onSubmit={resolveAmbiguity}><label>Resolución<select name="decision" defaultValue="CONSUMPTION_CONFIRMED"><option value="NO_CONSUMPTION">Confirmado no consumido</option><option value="CONSUMPTION_CONFIRMED">Confirmado consumido</option><option value="INDETERMINATE">Sigue indeterminado</option></select></label><label>Modelo<input name="model" placeholder="deepseek-flash" required /></label><label>Inicio ventana<input name="windowStart" placeholder="2026-09-27T20:00:00+02:00" required /></label><label>Fin ventana<input name="windowEnd" placeholder="2026-09-27T21:00:00+02:00" required /></label><label>Nombre público de API key<input name="apiKeyName" placeholder="investighost" required /></label><label>Requests<input name="requestCount" type="number" min="1" placeholder="1" required /></label><label>Tokens input miss<input name="inputCacheMissTokens" type="number" min="0" placeholder="40341" required /></label><label>Tokens output<input name="outputTokens" type="number" min="0" placeholder="8036" required /></label><label>Coste proveedor USD<input name="providerCost" type="number" min="0" step="0.00000001" placeholder="0.01087275" required /></label><label>Limitación<textarea name="limitation" placeholder="Usage export aggregated hourly; request id not present. Same API key/window contained exactly one request." required /></label><label>Nota opcional<input name="note" /></label><p className="muted">No se guarda una clave secreta ni se reconstruye la respuesta editorial perdida.</p><button className="button primary" disabled={resolving}>{resolving ? 'Guardando…' : 'Confirmar resolución humana'}</button></form>}{authorizationRequired && authorizationState !== 'AUTHORIZED' && <div className="job-review-action"><p className="muted">La red está separada de la autorización de coste de este trabajo.</p><button className="button secondary" disabled={authorizing} onClick={() => { void authorize() }}>{authorizing ? 'Solicitando autorización…' : 'Autorizar ejecución real'}</button></div>}{liveJob.status === 'FAILED' && liveJob.retryable && <div className="job-review-action"><button className="button primary" disabled={retrying || (authorizationRequired && authorizationState !== 'AUTHORIZED')} onClick={() => { void retry() }}>{retrying ? 'Reintentando…' : 'Reintentar'}</button></div>}{liveJob.status === 'READY_FOR_REVIEW' && <div className="job-review-action"><button className="button primary" onClick={onOpenReview}>Abrir revisión</button></div>}</section>
}

function TechnicalDiagnostic({ details }: { details: FactoryBatchTechnicalDiagnostic }) {
  const rows: Array<[string, string | number | boolean | null]> = [
    ['Código', details.errorCode], ['Fase', details.phase], ['Operación', details.operation], ['Job', details.jobId], ['Lote', details.batchId],
    ['Destino', details.destinationId], ['Ejecución', details.executionId], ['Intento', details.attempt], ['Fecha', new Date(details.timestamp).toLocaleString('es-ES')],
    ['Modo', details.executionMode], ['Red', details.networkGate], ['Proveedor esperado', details.expectedProvider], ['Proveedor activo', details.providerActive],
    ['Credencial configurada', details.credentialConfigured], ['Autorización', details.authorizationState], ['Reintentable', details.retryable],
    ['Motivo de reintento', details.retryReason], ['Causa', details.internalCauseSanitized], ['Acción sugerida', details.suggestedAction],
    ['Reserva', details.reservation?.reservationId ?? null], ['Estado reserva', details.reservation?.reservationState ?? null],
    ['Importe reservado', details.reservation?.reservedAmount ?? null], ['Importe comprometido', details.reservation?.committedAmount ?? null],
    ['Estado esperado de reserva', details.reservation?.expectedReservationState ?? null], ['Transición solicitada', details.reservation?.requestedTransition ?? null],
    ['Estado del ledger', details.reservation?.ledgerState ?? null],
    ['Resolución ambigua', details.reservation?.ambiguityResolution?.decision ?? null], ['Respuesta recuperada', details.reservation?.ambiguityResolution?.responseRecovered ?? null],
    ['Evidence', details.reservation?.ambiguityResolution?.evidence?.evidenceType ?? null], ['Requests evidence', details.reservation?.ambiguityResolution?.evidence?.requestCount ?? null],
    ['Input evidence', details.reservation?.ambiguityResolution?.evidence?.inputCacheMissTokens ?? null], ['Output evidence', details.reservation?.ambiguityResolution?.evidence?.outputTokens ?? null],
    ['Coste evidence', details.reservation?.ambiguityResolution?.evidence ? `${details.reservation.ambiguityResolution.evidence.providerCost} ${details.reservation.ambiguityResolution.evidence.currency}` : null],
    ['Limitación evidence', details.reservation?.ambiguityResolution?.evidence?.limitation ?? null],
  ]
  return <dl className="technical-diagnostic">{rows.filter(([, value]) => value !== null).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{String(value)}</dd></div>)}</dl>
}

function LiveActivity({ scope }: { scope?: DestinationBatchJob['redoScope'] }) { return <div className="live-job-status" role="status"><span className="spinner" /><div><strong>{scope ? jobStatusLabel('PROCESSING', scope) : 'Procesando'}</strong><small>Investighost está trabajando.</small></div></div> }
function Metric({ label, value }: { label: string; value: string | number }) { return <article className={`metric ${label === 'Fase' ? 'metric-phase' : ''}`}><span>{label}</span><strong>{value}</strong></article> }
