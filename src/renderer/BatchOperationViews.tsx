import { useEffect, useState, type FormEvent } from 'react'
import type { BatchAmbiguousCallResolution, DestinationBatchReadModel, DestinationBatchJob } from '@shared/factory-batch-contracts'
import { BATCH_LIVE_REFRESH_INTERVAL_MS, formatCost, isActiveBatchJob, isActiveRedo, jobPhaseLabel, jobStatusLabel, technicalJobFailureDetail, userFacingJobFailure } from './factory-presentation'
import type { FactoryBatchTechnicalDiagnostic } from '../main/factory-batch-diagnostics'
import { prudentialResolutionRequirements } from './prudential-resolution-validation'

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
  const [dossierMessage, setDossierMessage] = useState<string | null>(null)
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
      setDiagnostic(current => current ? {
        ...current,
        authorizationState: result.state,
        providerCallAllowed: current.safeToRequestAuthorization && result.state === 'AUTHORIZED',
      } : current)
    } catch (reason) { setAuthorizationError(reason instanceof Error ? reason.message : String(reason)) } finally { setAuthorizing(false) }
  }
  const resolveAmbiguity = async (input: BatchAmbiguousCallResolution) => {
    setResolving(true); setResolutionError(null)
    try {
      const result = await window.electronAPI.resolveDestinationBatchAmbiguousCall(input)
      setLiveJob(result.job); setSavedResolution(input.decision); setShowResolution(false)
      const details = await window.electronAPI.getDestinationBatchTechnicalDiagnostics(liveJob.id)
      setDiagnostic(details)
      setAuthorizationState(details.authorizationState)
    } catch (reason) { setResolutionError(reason instanceof Error ? reason.message : String(reason)) } finally { setResolving(false) }
  }
  // Authorization is a start precondition for every failed real-provider job,
  // not merely for jobs whose most recent error happened to be authorization.
  // This keeps a reconciled analysis retry from consuming a click/attempt only
  // to discover that its in-memory consent expired after an app restart.
  const authorizationRequired = liveJob.status === 'FAILED'
    && diagnostic?.executionMode === 'REAL'
    && diagnostic.safeToRequestAuthorization === true
  const ambiguous = diagnostic?.reservation?.reservationState === 'unknown'
  const retryAllowed = liveJob.status === 'FAILED' && !ambiguous && (diagnostic
    ? diagnostic.providerCallAllowed || (liveJob.retryable && diagnostic.expectedProvider === null)
    : liveJob.retryable)
  const exportDossier = async () => {
    try { const result = await window.electronAPI.exportDestinationBatchDiagnosticDossier(liveJob.id); setDossierMessage(`Expediente exportado: ${result.markdownPath}`) }
    catch (reason) { setDossierMessage(reason instanceof Error ? reason.message : String(reason)) }
  }
  const copyDossier = async () => {
    try { const summary = await window.electronAPI.copyDestinationBatchDiagnosticSummary(liveJob.id); await navigator.clipboard.writeText(summary); setDossierMessage('Resumen diagnóstico copiado.') }
    catch (reason) { setDossierMessage(reason instanceof Error ? reason.message : String(reason)) }
  }
  const savedResolutionMessage = savedResolution === 'CONSUMPTION_CONFIRMED'
    ? 'Consumo confirmado; respuesta no recuperable. Puede reintentarse la generación sin repetir la investigación ya conservada.'
    : savedResolution === 'NO_CONSUMPTION'
      ? 'No se confirmó consumo. Puede reintentarse la generación.'
      : savedResolution === 'PRUDENTIAL_COST_ASSUMED'
        ? 'Resultado remoto indeterminado; se contabilizó prudentemente. La próxima generación exige autorización nueva y no repetirá Research.'
      : savedResolution === 'INDETERMINATE'
        ? 'La llamada sigue indeterminada y queda bloqueada para evitar un posible doble consumo.'
        : null
  return <section className="batch-import-layout destination-job-detail">
    <button className="back-link" onClick={onBack}>← Volver al lote</button>
    <div className="section-heading"><div><h2>{liveJob.originalName}</h2><p>{liveJob.country}{liveJob.region ? ` · ${liveJob.region}` : ''}</p></div><span className={`state-badge state-${liveJob.status.toLowerCase()}`}>{jobStatusLabel(liveJob.status, liveJob.redoScope)}</span></div>
    {redoActive && <LiveActivity scope={liveJob.redoScope} />}
    <div className="metric-grid compact destination-job-metrics"><Metric label="Fase" value={phase} /><Metric label="Coste" value={formatCost(liveJob.actualCost)} /><Metric label="Intentos" value={liveJob.attemptCount} /></div>
    {retryError && <div className="alert error"><strong>No se pudo reintentar.</strong><span>{retryError}</span></div>}
    {authorizationError && <div className="alert error"><strong>No se pudo autorizar.</strong><span>{authorizationError}</span></div>}
    {resolutionError && <div className="alert error"><strong>No se pudo guardar la resolución.</strong><span>{resolutionError}</span></div>}
    {savedResolutionMessage && <div className="alert success">{savedResolutionMessage}</div>}
    {dossierMessage && <div className="alert success">{dossierMessage}</div>}
    {liveJob.lastFailure && <div className="alert warning"><strong>{userFacingJobFailure(liveJob.lastFailure, liveJob.redoScope)}</strong><details><summary>Detalles técnicos</summary>{diagnostic ? <TechnicalDiagnostic details={diagnostic} /> : <span>{technicalJobFailureDetail(liveJob.lastFailure)}</span>}</details></div>}
    <div className="job-review-action"><button className="button ghost" onClick={() => { void exportDossier() }}>Exportar expediente diagnóstico</button><button className="button ghost" onClick={() => { void copyDossier() }}>Copiar resumen diagnóstico</button></div>
    {ambiguous && !showResolution && <div className="job-review-action"><p className="muted">La llamada tiene resultado remoto ambiguo y permanece bloqueada hasta una decisión humana.</p><button className="button secondary" onClick={() => setShowResolution(true)}>Resolver resultado ambiguo</button></div>}
    {showResolution && diagnostic?.reservation?.reservationState === 'unknown' && diagnostic.reservation.providerCallId && <AmbiguousCallResolutionForm job={liveJob} ambiguity={{
      reservationId: diagnostic.reservation.reservationId, providerCallId: diagnostic.reservation.providerCallId,
      provider: diagnostic.reservation.realProvider ?? 'deepseek', model: diagnostic.reservation.model ?? '',
      operation: diagnostic.reservation.reservationOperation ?? diagnostic.operation,
      attempt: diagnostic.reservation.reservationAttempt ?? liveJob.attemptCount,
      reservedAmount: diagnostic.reservation.reservedAmount,
    }} saving={resolving} onCancel={() => { setShowResolution(false); setResolutionError(null) }} onConfirm={resolveAmbiguity} />}
    {authorizationRequired && authorizationState !== 'AUTHORIZED' && <div className="job-review-action"><p className="muted">{diagnostic?.remediation?.key ? 'La causa técnica de este fallo fue corregida. Puedes autorizar una nueva ejecución. Research se reutilizará.' : 'La red está separada de la autorización de coste de este trabajo.'} {diagnostic?.expectedProvider ? `Siguiente provider: ${diagnostic.expectedProvider === 'deepseek' ? 'DeepSeek' : 'Tavily'}.` : ''} {diagnostic?.nextStage ? `Etapa: ${diagnostic.nextStage}.` : ''}</p><button className="button secondary" disabled={authorizing} onClick={() => { void authorize() }}>{authorizing ? 'Solicitando autorización…' : 'Autorizar ejecución real'}</button></div>}
    {retryAllowed && <div className="job-review-action"><button className="button primary" disabled={retrying} onClick={() => { void retry() }}>{retrying ? 'Reintentando…' : 'Reintentar'}</button></div>}
    {liveJob.status === 'READY_FOR_REVIEW' && <div className="job-review-action"><button className="button primary" onClick={onOpenReview}>Abrir revisión</button></div>}
  </section>
}

type AmbiguousUsageDraft = {
  decision: BatchAmbiguousCallResolution['decision']; windowStart: string; windowEnd: string; apiKeyName: string
  requestCount: string; inputCacheHitTokens: string; inputCacheMissTokens: string; outputTokens: string; providerCost: string; limitation: string; reason: string; note: string
}

type CurrentAmbiguity = {
  reservationId: string; providerCallId: string; provider: string; model: string; operation: string; attempt: number; reservedAmount: number
}

function createAmbiguousUsageDraft(): AmbiguousUsageDraft {
  return { decision: 'CONSUMPTION_CONFIRMED', windowStart: '', windowEnd: '', apiKeyName: '', requestCount: '', inputCacheHitTokens: '', inputCacheMissTokens: '', outputTokens: '', providerCost: '', limitation: '', reason: '', note: '' }
}

function ambiguousUsageDraftIsValid(draft: AmbiguousUsageDraft, ambiguity: CurrentAmbiguity): boolean {
  if (draft.decision === 'PRUDENTIAL_COST_ASSUMED') return prudentialResolutionRequirements(ambiguity, draft).length === 0
  if (draft.decision !== 'CONSUMPTION_CONFIRMED') return true
  const start = Date.parse(draft.windowStart), end = Date.parse(draft.windowEnd)
  const integers = [draft.requestCount, draft.inputCacheHitTokens, draft.inputCacheMissTokens, draft.outputTokens].map(Number)
  const cost = Number(draft.providerCost)
  return Boolean(ambiguity.model.trim() && draft.apiKeyName.trim() && draft.limitation.trim())
    && Number.isFinite(start) && Number.isFinite(end) && start < end
    && Number.isInteger(integers[0]) && integers[0] >= 1 && integers.slice(1).every(value => Number.isInteger(value) && value >= 0)
    && Number.isFinite(cost) && cost >= 0
}

export function AmbiguousCallResolutionForm({ job, ambiguity, saving, onCancel, onConfirm }: {
  job: DestinationBatchJob; ambiguity: CurrentAmbiguity; saving: boolean; onCancel: () => void; onConfirm: (input: BatchAmbiguousCallResolution) => void
}) {
  const ambiguityIdentity = `${ambiguity.reservationId}:${ambiguity.providerCallId}`
  const [draft, setDraft] = useState(createAmbiguousUsageDraft)
  useEffect(() => { setDraft(createAmbiguousUsageDraft()) }, [ambiguityIdentity])
  const valid = ambiguousUsageDraftIsValid(draft, ambiguity)
  const missingRequirements = prudentialResolutionRequirements(ambiguity, draft)
  const update = (key: keyof AmbiguousUsageDraft, value: string) => setDraft(current => ({ ...current, [key]: value }))
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!valid) return
    const base = { jobId: job.id, reservationId: ambiguity.reservationId, providerCallId: ambiguity.providerCallId, decision: draft.decision, responseRecovered: false }
    const input: BatchAmbiguousCallResolution = draft.decision === 'CONSUMPTION_CONFIRMED'
      ? { ...base, evidence: { evidenceType: 'PROVIDER_USAGE_EXPORT', provider: 'deepseek', model: ambiguity.model, windowStart: draft.windowStart, windowEnd: draft.windowEnd, apiKeyName: draft.apiKeyName.trim(), requestCount: Number(draft.requestCount), inputCacheHitTokens: Number(draft.inputCacheHitTokens), inputCacheMissTokens: Number(draft.inputCacheMissTokens), outputTokens: Number(draft.outputTokens), providerCost: Number(draft.providerCost), currency: 'USD', requestIdPresentInExport: false, limitation: draft.limitation.trim() }, note: draft.note.trim() || undefined }
      : draft.decision === 'PRUDENTIAL_COST_ASSUMED'
        ? { ...base, prudentialCostEur: ambiguity.reservedAmount, currency: 'EUR', reason: draft.reason.trim(), acceptsPotentialDuplicateCharge: true, note: draft.note.trim() || undefined }
      : { ...base, note: draft.note.trim() || undefined }
    onConfirm(input)
  }
  const evidenceVisible = draft.decision === 'CONSUMPTION_CONFIRMED'
  const prudentialVisible = draft.decision === 'PRUDENTIAL_COST_ASSUMED'
  return <form className="ambiguous-resolution-form" onSubmit={submit} noValidate>
    <header><span className="card-kicker">RESOLUCIÓN HUMANA</span><h3>Resolver resultado ambiguo</h3><p>La decisión no inicia proveedores ni reconstruye una respuesta perdida.</p><dl className="ambiguity-identity"><div><dt>Reserva</dt><dd>{ambiguity.reservationId}</dd></div><div><dt>Provider call</dt><dd>{ambiguity.providerCallId}</dd></div><div><dt>Intento</dt><dd>{ambiguity.attempt}</dd></div><div><dt>Operación</dt><dd>{ambiguity.operation}</dd></div></dl></header>
    <fieldset><legend>Resolución</legend><label>Resultado<select value={draft.decision} disabled={saving} onChange={event => update('decision', event.target.value)}><option value="NO_CONSUMPTION">Confirmado no consumido</option><option value="CONSUMPTION_CONFIRMED">Confirmado consumido</option><option value="PRUDENTIAL_COST_ASSUMED">Sigue indeterminado — contabilizar prudentemente y permitir regeneración</option><option value="INDETERMINATE">Sigue indeterminado</option></select></label><label>Respuesta recuperada<input value="No" readOnly aria-readonly="true" /></label></fieldset>
    {evidenceVisible && <><fieldset><legend>Evidencia de provider</legend><div className="ambiguous-resolution-fields"><label>Provider<input value={ambiguity.provider === 'deepseek' ? 'DeepSeek' : ambiguity.provider} readOnly aria-readonly="true" /></label><label>Modelo<input value={ambiguity.model} readOnly aria-readonly="true" /></label><label>Inicio ventana<input value={draft.windowStart} disabled={saving} onChange={event => update('windowStart', event.target.value)} /></label><label>Fin ventana<input value={draft.windowEnd} disabled={saving} onChange={event => update('windowEnd', event.target.value)} /></label><label>Nombre público API key<input value={draft.apiKeyName} disabled={saving} onChange={event => update('apiKeyName', event.target.value)} /></label><label>Moneda<input value="USD" readOnly aria-readonly="true" /></label></div></fieldset>
      <fieldset><legend>Tokens y coste</legend><div className="ambiguous-resolution-fields"><label>Requests<input value={draft.requestCount} inputMode="numeric" disabled={saving} onChange={event => update('requestCount', event.target.value)} /></label><label>Tokens input cache hit<input value={draft.inputCacheHitTokens} inputMode="numeric" disabled={saving} onChange={event => update('inputCacheHitTokens', event.target.value)} /></label><label>Tokens input miss<input value={draft.inputCacheMissTokens} inputMode="numeric" disabled={saving} onChange={event => update('inputCacheMissTokens', event.target.value)} /></label><label>Tokens output<input value={draft.outputTokens} inputMode="numeric" disabled={saving} onChange={event => update('outputTokens', event.target.value)} /></label><label>Coste provider USD<input value={draft.providerCost} inputMode="decimal" disabled={saving} onChange={event => update('providerCost', event.target.value)} /></label></div></fieldset>
      <aside className="ambiguous-resolution-summary"><strong>Resumen para confirmar</strong><span>{ambiguity.provider === 'deepseek' ? 'DeepSeek' : ambiguity.provider} · {ambiguity.model}</span><span>{draft.requestCount} request · {draft.inputCacheHitTokens} input cache hit · {draft.inputCacheMissTokens} input miss · {draft.outputTokens} output tokens</span><span>{draft.providerCost} USD · respuesta recuperada: NO</span><small>Limitación: {draft.limitation}</small></aside></>}
    {prudentialVisible && <fieldset><legend>Contabilidad prudencial</legend><p className="muted">No hay evidencia suficiente para confirmar ni negar el consumo remoto. Se contabilizará la reserva máxima prudencial, sin presentarla como coste facturado por DeepSeek. La respuesta no fue recuperada y una nueva generación será gasto adicional.</p><div className="ambiguous-resolution-fields"><label>Provider<input value={ambiguity.provider === 'deepseek' ? 'DeepSeek' : ambiguity.provider} readOnly aria-readonly="true" /></label><label>Modelo<input value={ambiguity.model} readOnly aria-readonly="true" /></label><label>Importe prudencial EUR<input value={ambiguity.reservedAmount.toFixed(6)} readOnly aria-readonly="true" /></label><label>Coste provider confirmado<input value="No" readOnly aria-readonly="true" /></label></div><label>Motivo de evidencia insuficiente<textarea required value={draft.reason} disabled={saving} onChange={event => update('reason', event.target.value)} placeholder="El usage disponible no cubre de forma fiable la ventana de la llamada." /></label><aside className="ambiguous-resolution-summary"><strong>Resumen para confirmar</strong><span>Resultado remoto: indeterminado · respuesta recuperada: NO</span><span>Contabilidad: prudencial por {ambiguity.reservedAmount.toFixed(6)} EUR</span><small>La nueva llamada requerirá una autorización humana y será gasto adicional.</small></aside></fieldset>}
    <fieldset><legend>Limitación y nota</legend>{evidenceVisible && <label>Limitación<textarea value={draft.limitation} disabled={saving} onChange={event => update('limitation', event.target.value)} /></label>}<label>Nota opcional<textarea value={draft.note} disabled={saving} onChange={event => update('note', event.target.value)} /></label></fieldset>
    {prudentialVisible && missingRequirements.length > 0 && <p className="form-validation" role="status">Falta: {missingRequirements.join(', ')}</p>}<p className="muted">No se guarda ninguna clave secreta, header de autorización ni token de ejecución.</p>
    <footer><button type="button" className="button ghost" disabled={saving} onClick={onCancel}>Cancelar</button><button className="button primary" disabled={saving || !valid}>{saving ? 'Guardando…' : 'Confirmar resolución humana'}</button></footer>
  </form>
}

function TechnicalDiagnostic({ details }: { details: FactoryBatchTechnicalDiagnostic }) {
  const rows: Array<[string, string | number | boolean | null]> = [
    ['Código', details.errorCode], ['Fase', details.phase], ['Operación', details.operation], ['Job', details.jobId], ['Lote', details.batchId],
    ['Destino', details.destinationId], ['Ejecución', details.executionId], ['Intento', details.attempt], ['Fecha', new Date(details.timestamp).toLocaleString('es-ES')],
    ['Modo', details.executionMode], ['Red', details.networkGate], ['Proveedor esperado', details.expectedProvider], ['Proveedor activo', details.providerActive],
    ['Credencial configurada', details.credentialConfigured], ['Autorización', details.authorizationState], ['Reintentable', details.retryable],
    ['Puede solicitar autorización', details.safeToRequestAuthorization], ['Provider call permitido', details.providerCallAllowed], ['Seguro para retry sin autorización', details.safeToRetryWithoutAuthorization],
    ['Remediation disponible', details.remediation?.key ?? null], ['Versión remediation', details.remediation?.version ?? null], ['Policy de fallo', details.remediation?.failurePolicyVersion ?? null], ['Policy actual', details.remediation?.currentPolicyVersion ?? null],
    ['Motivo de reintento', details.retryReason], ['Causa', details.internalCauseSanitized], ['Acción sugerida', details.suggestedAction],
    ['Reanudar desde', details.resumeFromStage], ['Corpus Research reutilizado', details.reusedResearchCorpus], ['Siguiente etapa', details.nextStage], ['Uso ambiguo anterior resuelto', details.previousAmbiguousUsageResolved],
    ['Tipo de límite', details.limit?.type ?? null], ['Valor de límite', details.limit?.value ?? null], ['Valor actual', details.limit?.currentValue ?? null],
    ['Ámbito de límite', details.limit?.scope ?? null], ['Override humano requerido', details.limit?.requiresHumanOverride ?? null], ['Acción sobre límite', details.limit?.overrideAction ?? null],
    ['Reserva', details.reservation?.reservationId ?? null], ['Estado reserva', details.reservation?.reservationState ?? null],
    ['Proveedor real', details.reservation?.realProvider ?? null], ['Modelo real', details.reservation?.model ?? null], ['Operación de reserva', details.reservation?.reservationOperation ?? null],
    ['Intento de reserva', details.reservation?.reservationAttempt ?? null],
    ['Provider call local', details.reservation?.providerCallId ?? null], ['Solicitud despachada localmente', details.reservation?.requestDispatched ?? null],
    ['Inicio de llamada', details.reservation?.callStartedAt ? new Date(details.reservation.callStartedAt).toLocaleString('es-ES') : null],
    ['Timeout registrado', details.reservation?.timeoutAt ? new Date(details.reservation.timeoutAt).toLocaleString('es-ES') : null],
    ['Remote request id', details.reservation?.remoteRequestId ?? null], ['Headers de respuesta observados', details.reservation?.responseHeadersReceived ?? null], ['Cuerpo de respuesta iniciado', details.reservation?.responseBodyStarted ?? null],
    ['Importe reservado', details.reservation?.reservedAmount ?? null], ['Importe comprometido', details.reservation?.committedAmount ?? null],
    ['Estado esperado de reserva', details.reservation?.expectedReservationState ?? null], ['Transición solicitada', details.reservation?.requestedTransition ?? null],
    ['Estado del ledger', details.reservation?.ledgerState ?? null],
    ['Resolución ambigua', details.reservation?.ambiguityResolution?.decision ?? null], ['Respuesta recuperada', details.reservation?.ambiguityResolution?.responseRecovered ?? null],
    ['Resultado remoto', details.reservation?.ambiguityResolution?.prudential?.remoteResult ?? null], ['Modo contable', details.reservation?.ambiguityResolution?.prudential?.accountingMode ?? null],
    ['Importe prudencial', details.reservation?.ambiguityResolution?.prudential ? `${details.reservation.ambiguityResolution.prudential.amount} ${details.reservation.ambiguityResolution.prudential.currency}` : null],
    ['Coste provider confirmado', details.reservation?.ambiguityResolution?.prudential?.providerCostConfirmed ?? null], ['Motivo prudencial', details.reservation?.ambiguityResolution?.prudential?.reason ?? null],
    ['Evidence', details.reservation?.ambiguityResolution?.evidence?.evidenceType ?? null], ['Requests evidence', details.reservation?.ambiguityResolution?.evidence?.requestCount ?? null],
    ['Input cache hit evidence', details.reservation?.ambiguityResolution?.evidence?.inputCacheHitTokens ?? null], ['Input evidence', details.reservation?.ambiguityResolution?.evidence?.inputCacheMissTokens ?? null], ['Output evidence', details.reservation?.ambiguityResolution?.evidence?.outputTokens ?? null],
    ['Coste evidence', details.reservation?.ambiguityResolution?.evidence ? `${details.reservation.ambiguityResolution.evidence.providerCost} ${details.reservation.ambiguityResolution.evidence.currency}` : null],
    ['Limitación evidence', details.reservation?.ambiguityResolution?.evidence?.limitation ?? null],
    ['Tipo de timeout', details.timeout?.type ?? null], ['Timeout ms', details.timeout?.timeoutMs ?? null], ['Fuente de timeout', details.timeout?.timeoutSource ?? null],
    ['Resultado remoto ambiguo', details.timeout?.ambiguousRemoteResult ?? null], ['Reconciliación requerida', details.timeout?.reconciliationRequired ?? null],
    ['Conflicto idempotente', details.idempotencyConflict?.idempotencyKeyFingerprint ?? null], ['Reserva en conflicto', details.idempotencyConflict?.conflictingReservationId ?? null],
    ['Provider call en conflicto', details.idempotencyConflict?.conflictingProviderCallId ?? null], ['Operación en conflicto', details.idempotencyConflict?.conflictingOperation ?? null],
    ['Intento solicitado', details.idempotencyConflict?.stageAttemptRequested ?? null], ['Intento en conflicto', details.idempotencyConflict?.conflictingStageAttempt ?? null],
    ['Provider despachado', details.idempotencyConflict?.requestDispatched ?? null], ['Coste creado', details.idempotencyConflict?.costCreated ?? null],
  ]
  return <dl className="technical-diagnostic">{rows.filter(([, value]) => value !== null).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{String(value)}</dd></div>)}</dl>
}

function LiveActivity({ scope }: { scope?: DestinationBatchJob['redoScope'] }) { return <div className="live-job-status" role="status"><span className="spinner" /><div><strong>{scope ? jobStatusLabel('PROCESSING', scope) : 'Procesando'}</strong><small>Investighost está trabajando.</small></div></div> }
function Metric({ label, value }: { label: string; value: string | number }) { return <article className={`metric ${label === 'Fase' ? 'metric-phase' : ''}`}><span>{label}</span><strong>{value}</strong></article> }
