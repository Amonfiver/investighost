import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'
import {
  ResearchSourceFailureSchema,
  type EditorialDraftBundle,
  type EditorialProfile,
  type QualityReview,
  type ResearchDestinationResult,
} from '@shared/editorial-contracts'
import {
  manualReviewHistory,
  type ManualReviewAction,
  type ManualReviewHistoryEntry,
} from '@shared/manual-review-history'
import type { ContributionImportJob, ContributionSyncSummary } from '@shared/contracts'
import type {
  ManualDestinationResolution,
  ManualPersistenceStatus,
  ManualResearchExecutionOutcome,
  ManualResearchIncident,
  ManualResearchStart,
} from '@shared/manual-contracts'
import type { LibraryItem } from '@shared/library-contracts'
import type {
  ProviderCenterSnapshot,
  ProviderPublicStatus,
} from '@shared/provider-center-contracts'
import {
  assessProfileEvidence,
  type RealProfileSettings,
} from '@shared/real-profile-settings'
import type { RealConnectivityPreflight } from '@modules/real-pipeline/real-connectivity-preflight'
import {
  REAL_CONNECTIVITY_CONFIRMATION,
  type RealConnectivityResult,
} from '@shared/real-connectivity-contracts'
import type { EditorialDraftVersionSummary } from '@modules/editorial-pipeline/repository'
import {
  REAL_EDITORIAL_OPENAI_MODEL,
  REAL_EDITORIAL_PILOT_POLICY,
  type RealEditorialAmbiguousCall,
  type RealEditorialAmbiguousCallDecision,
  type RealEditorialAmbiguousCallResolution,
  type RealEditorialBudgetDecision,
  type RealEditorialBudgetResolution,
  type RealEditorialBudgetReview,
  type RealEditorialCoverageDecision,
  type RealEditorialCoverageResolution,
  type RealEditorialCoverageReview,
  type RealEditorialHistoricalIncidentResolution,
  type RealEditorialHistoricalIncidentReview,
  type RealEditorialLibraryEntry,
  type RealEditorialLibraryTransfer,
  type RealEditorialPilotProgress,
  type RealEditorialPartialAnalysisRecovery,
  type RealEditorialPartialAnalysisRecoveryPlan,
  type RealEditorialPreflight,
  type RealEditorialSourceLimitRecovery,
  type RealEditorialSourceLimitRecoveryPlan,
  type RealEditorialTerminalResolution,
  type RealEditorialTerminalResult,
} from '@shared/real-editorial-pilot-contracts'
import {
  LIBRARY_PAGE_SUMMARY_LABEL,
  LibraryNavigator,
  libraryNavigationAvailability,
  libraryPageNumber,
  type LibraryNavigationState,
} from './library-navigation'

type View = 'library' | 'new' | 'detail' | 'contributions' | 'providers' | 'real-config'
type DetailTab = 'overview' | 'sources' | 'facts' | 'places' | 'activities' | 'drafts' | 'quality' | 'history'

const stageLabels: Record<string, string> = {
  destination_resolution: 'Destino',
  source_discovery: 'Fuentes',
  source_reading: 'Lectura',
  fact_structuring: 'Hechos',
  profile_generation: 'Perfiles',
  quality_review: 'RevisIAtor',
  human_review: 'Revisión humana',
}

const stateLabels: Record<string, string> = {
  draft: 'Borrador', queued: 'En cola', researching: 'Investigando', structuring: 'Estructurando',
  validating: 'Validando', completed: 'Completada', retry_pending: 'Reintento pendiente', failed: 'Fallida', cancelled: 'Cancelada',
  ready: 'Lista para revisar', in_review: 'En revisión', changes_requested: 'Cambios solicitados', approved: 'Aprobada',
  rejected: 'Rechazada', archived: 'Archivada', passed: 'Aprobado técnicamente', passed_with_warnings: 'Con advertencias',
  pending_human_review: 'Pendiente de decisión humana', human_approved: 'Aprobado editorialmente',
  ready_for_library: 'Disponible en Biblioteca',
  human_rejected: 'Rechazado editorialmente', review_required: 'Revisión requerida',
  blocked: 'Bloqueado',
}

const failureLabels: Record<string, string> = {
  data_quality: 'Calidad de datos', provider: 'Proveedor', persistence: 'Persistencia', checkpoint: 'Checkpoint',
  budget: 'Límites y presupuesto', cancellation: 'Cancelación', pipeline: 'Pipeline',
}

export function App(): JSX.Element {
  const libraryNavigator = useMemo(
    () => new LibraryNavigator(query => window.electronAPI.listManualResearch(query)),
    [],
  )
  const [view, setView] = useState<View>('library')
  const [status, setStatus] = useState<ManualPersistenceStatus | null>(null)
  const [actorId, setActorId] = useState('')
  const [libraryNavigation, setLibraryNavigation] = useState(libraryNavigator.snapshot)
  const [selectedSummary, setSelectedSummary] = useState<LibraryItem | null>(null)
  const [selected, setSelected] = useState<ResearchDestinationResult | null>(null)
  const [versions, setVersions] = useState<EditorialDraftVersionSummary[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [realLibraryEntries, setRealLibraryEntries] = useState<RealEditorialLibraryEntry[]>([])
  const [realLibraryLoading, setRealLibraryLoading] = useState(false)
  const [realLibraryError, setRealLibraryError] = useState<string | null>(null)
  const [realLibraryFocusId, setRealLibraryFocusId] = useState<string | null>(null)

  const loadRealLibrary = useCallback(async () => {
    setRealLibraryLoading(true)
    setRealLibraryError(null)
    try {
      setRealLibraryEntries(await window.electronAPI.listRealEditorialLibrary({}))
    } catch (reason) {
      setRealLibraryError(errorText(reason))
    } finally {
      setRealLibraryLoading(false)
    }
  }, [])

  useEffect(
    () => libraryNavigator.subscribe(setLibraryNavigation),
    [libraryNavigator],
  )

  useEffect(() => {
    Promise.all([
      window.electronAPI.getManualPersistenceStatus(),
      window.electronAPI.getManualActor(),
    ]).then(async ([nextStatus, nextActor]) => {
      setStatus(nextStatus)
      setActorId(nextActor)
      if (nextStatus.connected) {
        await Promise.all([libraryNavigator.first(), loadRealLibrary()])
      }
    }).catch(reason => setError(errorText(reason)))
  }, [libraryNavigator, loadRealLibrary])

  const openRealLibraryEntry = async (entryId: string) => {
    setRealLibraryFocusId(entryId)
    setView('library')
    await loadRealLibrary()
  }

  const openResearch = async (summary: LibraryItem) => {
    setBusy(true)
    setError(null)
    setSelectedSummary(summary)
    try {
      const [result, history] = await Promise.all([
        window.electronAPI.getManualResearch(summary.requestId),
        window.electronAPI.listManualDraftVersions(summary.requestId),
      ])
      setSelected(result)
      setVersions(history)
      setView('detail')
    } catch (reason) {
      setError(errorText(reason))
    } finally {
      setBusy(false)
    }
  }

  const showIncident = async (incident: ManualResearchIncident) => {
    const page = await libraryNavigator.resetAfterMutation()
    setSelected(null)
    setSelectedSummary(page?.items.find(item => item.requestId === incident.requestId) ?? summaryFromIncident(incident))
    setVersions([])
    setView('detail')
  }

  const completeStart = async (input: Omit<ManualResearchStart, 'actorId' | 'idempotencyKey'>) => {
    setBusy(true)
    setError(null)
    try {
      const outcome = await window.electronAPI.startManualResearch({
        ...input,
        actorId,
        idempotencyKey: `manual:${crypto.randomUUID()}`,
      })
      if (outcome.status === 'failed') {
        await showIncident(outcome.incident)
        return
      }
      const { result } = outcome
      setSelected(result)
      setSelectedSummary(summaryFromResult(result))
      setVersions(await window.electronAPI.listManualDraftVersions(result.request.id))
      await libraryNavigator.resetAfterMutation()
      setView('detail')
    } catch (reason) {
      setError(errorText(reason))
    } finally {
      setBusy(false)
    }
  }

  const applyExecutionOutcome = async (operation: () => Promise<ManualResearchExecutionOutcome>) => {
    setBusy(true)
    setError(null)
    try {
      const outcome = await operation()
      if (outcome.status === 'failed') {
        await showIncident(outcome.incident)
        return
      }
      const { result } = outcome
      setSelected(result)
      setSelectedSummary(summaryFromResult(result))
      setVersions(await window.electronAPI.listManualDraftVersions(result.request.id))
      await libraryNavigator.resetAfterMutation()
      setView('detail')
    } catch (reason) {
      setError(errorText(reason))
    } finally {
      setBusy(false)
    }
  }

  const applyResult = async (operation: () => Promise<ResearchDestinationResult>) => {
    setBusy(true)
    setError(null)
    try {
      const result = await operation()
      setSelected(result)
      setSelectedSummary(summaryFromResult(result))
      setVersions(await window.electronAPI.listManualDraftVersions(result.request.id))
      await libraryNavigator.resetAfterMutation()
      setView('detail')
    } catch (reason) {
      setError(errorText(reason))
    } finally {
      setBusy(false)
    }
  }

  const cancelExecution = async (requestId: string) => {
    setBusy(true)
    setError(null)
    try {
      await window.electronAPI.cancelManualResearch({ requestId, actorId })
      await libraryNavigator.resetAfterMutation()
      setSelected(null)
      setSelectedSummary(null)
      setView('library')
    } catch (reason) {
      setError(errorText(reason))
    } finally {
      setBusy(false)
    }
  }

  const go = (next: View) => {
    setError(null)
    setView(next)
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">IG</span>
          <div><strong>Investighost</strong><small>Pipeline Manual</small></div>
        </div>
        <nav aria-label="Navegación principal">
          <button className={view === 'library' ? 'nav-active' : ''} onClick={() => go('library')}>Biblioteca</button>
          <button className={view === 'new' ? 'nav-active' : ''} onClick={() => go('new')}>Nueva investigación</button>
          <button className={view === 'contributions' ? 'nav-active' : ''} onClick={() => go('contributions')}>Contribuciones</button>
          <button className={view === 'providers' ? 'nav-active' : ''} onClick={() => go('providers')}>Proveedores</button>
          <button className={view === 'real-config' ? 'nav-active' : ''} onClick={() => go('real-config')}>Pipeline real</button>
        </nav>
        <div className="environment-card">
          <span className={`connection-dot ${status?.connected ? 'online' : ''}`} aria-hidden="true" />
          <div>
            <strong>{status?.connected ? 'Supabase local' : 'Local desconectado'}</strong>
            <small>Mocks deterministas · sin publicación</small>
          </div>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">FASE 3 · FLUJO CANÓNICO</span>
            <h1>{viewTitle(view, selected)}</h1>
          </div>
          <div className="topbar-actions">
            <span className="safety-pill">Local · Manual · Simulado</span>
            <button className="button primary" onClick={() => go('new')} disabled={!status?.connected || busy}>Nueva investigación</button>
          </div>
        </header>

        <main className="content" aria-busy={busy || (view === 'library' && libraryNavigation.loading)}>
          {error && <div className="alert error" role="alert"><strong>No se pudo completar la operación.</strong><span>{error}</span></div>}
          {!status?.connected && status?.error && (
            <div className="alert warning" role="status">
              <strong>Supabase local no está disponible.</strong>
              <span>{status.error} El flujo Manual no usa una base alternativa.</span>
            </div>
          )}
          {busy && <div className="progress-banner" role="status"><span className="spinner" />Guardando progreso en Supabase local…</div>}

          {view === 'library' && (
            <Library
              navigation={libraryNavigation}
              realEntries={realLibraryEntries}
              realLoading={realLibraryLoading}
              realError={realLibraryError}
              focusedRealEntryId={realLibraryFocusId}
              connected={Boolean(status?.connected)}
              busy={busy}
              onOpen={openResearch}
              onNew={() => go('new')}
              onFirst={() => { void libraryNavigator.first() }}
              onPrevious={() => { void libraryNavigator.previous() }}
              onRefresh={() => { void Promise.all([libraryNavigator.refresh(), loadRealLibrary()]) }}
              onNext={() => { void libraryNavigator.next() }}
            />
          )}
          {view === 'new' && status?.connected && actorId && (
            <NewManualResearch actorId={actorId} busy={busy} onStart={completeStart} onCancel={() => go('library')} />
          )}
          {view === 'detail' && (
            selected
              ? <ResearchWorkspace result={selected} versions={versions} busy={busy} actorId={actorId} applyResult={applyResult} onBack={() => go('library')} />
              : <IncompleteResearch
                summary={selectedSummary}
                busy={busy}
                onResume={requestId => applyResult(() => window.electronAPI.resumeManualResearch({ requestId, actorId }))}
                onRetry={requestId => applyExecutionOutcome(() => window.electronAPI.retryManualResearch({ requestId, actorId }))}
                onCancel={cancelExecution}
                onBack={() => go('library')}
              />
          )}
          {view === 'contributions' && <ContributionImportPanel />}
          {view === 'providers' && <ProviderCenterPanel />}
          {view === 'real-config' && (
            <RealProfileSettingsPanel
              onLibraryChanged={loadRealLibrary}
              onOpenLibraryEntry={entryId => { void openRealLibraryEntry(entryId) }}
            />
          )}
        </main>
      </div>
    </div>
  )
}

export function Library({ navigation, realEntries, realLoading, realError, focusedRealEntryId, connected, busy, onOpen, onNew, onFirst, onPrevious, onRefresh, onNext }: {
  navigation: LibraryNavigationState
  realEntries: RealEditorialLibraryEntry[]
  realLoading: boolean
  realError: string | null
  focusedRealEntryId: string | null
  connected: boolean
  busy: boolean
  onOpen: (summary: LibraryItem) => void
  onNew: () => void
  onFirst: () => void
  onPrevious: () => void
  onRefresh: () => void
  onNext: () => void
}): JSX.Element {
  const [destinationFilter, setDestinationFilter] = useState('')
  const [profileFilter, setProfileFilter] = useState<'all' | 'adventure' | 'student'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'approved_unpublished'>('all')
  const [originFilter, setOriginFilter] = useState<'all' | 'real_editorial_pilot'>('all')
  const summaries = navigation.page.items
  const visibleRealEntries = realEntries.filter(entry => (
    (!destinationFilter.trim()
      || entry.destination.name.toLocaleLowerCase('es').includes(destinationFilter.trim().toLocaleLowerCase('es')))
    && (profileFilter === 'all' || entry.profile === profileFilter)
    && (statusFilter === 'all' || entry.status === statusFilter)
    && (originFilter === 'all' || entry.origin === originFilter)
  ))
  const pageNumber = libraryPageNumber(navigation)
  const availability = libraryNavigationAvailability(navigation)
  const navigationBlocked = !connected || busy
  const completed = summaries.filter(item => item.state === 'completed').length
  const failures = summaries.filter(item => item.state === 'failed' || item.state === 'retry_pending').length
  return (
    <section>
      <p className="page-summary-label">{LIBRARY_PAGE_SUMMARY_LABEL}</p>
      <div className="metric-grid" aria-label={LIBRARY_PAGE_SUMMARY_LABEL}>
        <Metric label="Manuales en página" value={summaries.length} detail={`Página ${pageNumber} de Biblioteca`} />
        <Metric label="Editoriales reales" value={realEntries.length} detail="Aprobadas y sin publicar" />
        <Metric label="Completadas en página" value={completed} detail="Pipeline terminado" />
        <Metric label="Incidencias en página" value={failures} detail="Activas y recuperables" tone={failures ? 'warn' : 'normal'} />
        <Metric label="Publicaciones" value={0} detail="Bloqueadas por diseño" />
      </div>
      <section className="real-library-section" aria-label="Biblioteca editorial real">
        <div className="section-heading compact">
          <div>
            <span className="eyebrow">ORIGEN · REAL EDITORIAL</span>
            <h2>Contenido editorial aprobado</h2>
            <p>Proyecciones internas inmutables de origen; sin publicación, Trawel ni Automatic.</p>
          </div>
        </div>
        <div className="real-library-filters" aria-label="Filtros de Biblioteca editorial real">
          <label className="field"><span>Destino</span><input value={destinationFilter} onChange={event => setDestinationFilter(event.target.value)} placeholder="Morella" /></label>
          <label className="field"><span>Perfil</span><select value={profileFilter} onChange={event => setProfileFilter(event.target.value as typeof profileFilter)}><option value="all">Todos</option><option value="adventure">Aventura</option><option value="student">Estudiante</option></select></label>
          <label className="field"><span>Estado</span><select value={statusFilter} onChange={event => setStatusFilter(event.target.value as typeof statusFilter)}><option value="all">Todos</option><option value="approved_unpublished">Aprobado · Sin publicar</option></select></label>
          <label className="field"><span>Origen</span><select value={originFilter} onChange={event => setOriginFilter(event.target.value as typeof originFilter)}><option value="all">Todos</option><option value="real_editorial_pilot">Editorial real</option></select></label>
        </div>
        {realError && <div className="library-read-error read" role="alert"><div><strong>Error de lectura de Biblioteca editorial.</strong><p>{realError}</p></div></div>}
        {realLoading ? (
          <div className="real-library-empty" role="status">Cargando contenido editorial aprobado…</div>
        ) : visibleRealEntries.length === 0 ? (
          <div className="real-library-empty">No hay entradas editoriales reales para estos filtros.</div>
        ) : (
          <div className="real-library-grid">
            {visibleRealEntries.map(entry => (
              <article
                id={`real-library-entry-${entry.entryId}`}
                className={`real-library-entry ${focusedRealEntryId === entry.entryId ? 'focused' : ''}`}
                key={entry.entryId}
              >
                <header><div><span className="card-kicker">{entry.profile === 'adventure' ? 'AVENTURA' : 'ESTUDIANTE'} · EDITORIAL REAL</span><h3>{entry.title}</h3></div><span className="state-badge state-approved">Aprobado · Sin publicar</span></header>
                <p>{entry.destination.name} · {entry.destination.countryCode} · versión {entry.editorialVersion}</p>
                <details>
                  <summary>Abrir texto completo y trazabilidad</summary>
                  <p className="terminal-draft-content">{entry.content}</p>
                  <dl className="definition-grid compact">
                    <div><dt>Origen</dt><dd>{entry.origin}</dd></div>
                    <div><dt>Artifact ID</dt><dd className="technical-id">{entry.sourceArtifact.artifactId}</dd></div>
                    <div><dt>Artifact hash</dt><dd className="technical-id">{entry.sourceArtifact.hash}</dd></div>
                    <div><dt>Revisión final</dt><dd className="technical-id">{entry.finalReviewArtifact.artifactId}</dd></div>
                    <div><dt>Decisión terminal</dt><dd className="technical-id">{entry.terminalDecisionId}</dd></div>
                    <div><dt>Coste final del run</dt><dd>{formatPreciseMoney(entry.finalRunCostEur)}</dd></div>
                  </dl>
                  <h4>Warnings ({entry.warnings.length})</h4><ul>{entry.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
                  <h4>Gaps ({entry.gaps.length})</h4><ul>{entry.gaps.map(gap => <li key={gap.id}>{gap.id} · {gap.description}</li>)}</ul>
                  <h4>Contradicciones ({entry.contradictions.length})</h4><ul>{entry.contradictions.map(item => <li key={item}>{item}</li>)}</ul>
                  <h4>Claims y evidencias</h4><ul>{entry.claims.map(claim => <li key={claim.id}>{claim.id} · {claim.statement} · evidencias {claim.evidenceIds.join(', ')}</li>)}</ul>
                  <small>{entry.evidence.length} trazas y {entry.sources.length} fuentes durables conservadas · la lectura no modifica datos.</small>
                </details>
              </article>
            ))}
          </div>
        )}
      </section>
      <div className="section-heading">
        <div><span className="eyebrow">BIBLIOTECA LOCAL</span><h2>Investigaciones Manuales</h2></div>
        <button className="button secondary" onClick={onNew} disabled={!connected}>Crear nueva</button>
      </div>
      <nav className="library-pagination" aria-label="Navegación de páginas de Biblioteca">
        <div className="library-page-status" role="status" aria-live="polite">
          <strong>Página {pageNumber}</strong>
          <span>{navigation.loading ? 'Cargando página…' : `${summaries.length} investigaciones visibles`}</span>
        </div>
        <div className="library-page-actions">
          <button className="button ghost" onClick={onFirst} disabled={navigationBlocked || !availability.canFirst}>Primera página</button>
          <button className="button secondary" onClick={onPrevious} disabled={navigationBlocked || !availability.canPrevious}>Anterior</button>
          <button className="button ghost" onClick={onRefresh} disabled={navigationBlocked || !availability.canRefresh}>Actualizar</button>
          <button className="button secondary" onClick={onNext} disabled={navigationBlocked || !availability.canNext}>Siguiente</button>
        </div>
      </nav>
      {navigation.error && (
        <div className={`library-read-error ${navigation.error.kind}`} role="alert">
          <div>
            <strong>{navigation.error.kind === 'cursor' ? 'La página ya no está disponible.' : 'Error de lectura de Biblioteca.'}</strong>
            <p>{navigation.error.message}</p>
            <small>{navigation.error.detail}</small>
          </div>
          {navigation.error.kind === 'cursor' && (
            <button className="button secondary" onClick={onFirst} disabled={navigation.loading || !connected}>
              Volver a la primera página
            </button>
          )}
        </div>
      )}
      {navigation.loading && !navigation.initialized ? (
        <div className="empty-card library-loading" role="status">
          <span className="spinner" aria-hidden="true" />
          <h3>Cargando página…</h3>
          <p>Consultando la Biblioteca local sin modificar investigaciones ni costes.</p>
        </div>
      ) : summaries.length === 0 ? (
        <div className="empty-card">
          <span className="empty-icon">＋</span>
          <h3>Aún no hay investigaciones</h3>
          <p>Resuelve un destino del catálogo y ejecuta el pipeline completo sin salir de la aplicación.</p>
          <button className="button primary" onClick={onNew} disabled={!connected}>Crear la primera</button>
        </div>
      ) : (
        <div className="research-table" role="list">
          {summaries.map(summary => (
            <button className="research-row" key={summary.requestId} onClick={() => onOpen(summary)} role="listitem" disabled={navigation.loading || busy}>
              <span className="destination-avatar">{initials(summary.destinationQuery)}</span>
              <span className="research-main"><strong>{summary.destinationQuery}</strong><small>{summary.profiles.map(profileLabel).join(' · ')}</small>{summary.errorCode && <small className="incident-copy">{summary.errorCode} · {summary.errorMessage}</small>}</span>
              <span><StateBadge value={summary.state} /></span>
              <span className="stage-copy"><small>Etapa</small>{stageLabels[summary.stage ?? ''] ?? 'Preparación'}</span>
              <span className="stage-copy"><small>Coste del último run</small>{formatMoney(summary.latestRunActualCost, summary.currency)}</span>
              <span className="row-arrow" aria-hidden="true">→</span>
            </button>
          ))}
        </div>
      )}
      {navigation.initialized && !navigation.loading && summaries.length > 0 && !navigation.page.hasMore && (
        <p className="library-end-message" role="status">No hay más resultados.</p>
      )}
    </section>
  )
}

function Metric({ label, value, detail, tone = 'normal' }: { label: string; value: number; detail: string; tone?: 'normal' | 'warn' }): JSX.Element {
  return <article className={`metric ${tone}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>
}

function NewManualResearch({ actorId, busy, onStart, onCancel }: {
  actorId: string
  busy: boolean
  onStart: (input: Omit<ManualResearchStart, 'actorId' | 'idempotencyKey'>) => Promise<void>
  onCancel: () => void
}): JSX.Element {
  const [query, setQuery] = useState('Morella')
  const [countryCode, setCountryCode] = useState('ES')
  const [destinationType, setDestinationType] = useState<ManualResearchStart['destinationType']>('locality')
  const [profiles, setProfiles] = useState<EditorialProfile[]>(['adventure', 'student'])
  const [depth, setDepth] = useState<ManualResearchStart['depth']>('standard')
  const [budgetLimit, setBudgetLimit] = useState(2)
  const [maxAttempts, setMaxAttempts] = useState(3)
  const [simulationScenario, setSimulationScenario] = useState<NonNullable<ManualResearchStart['simulationScenario']>>('happy_path')
  const [notes, setNotes] = useState('')
  const [resolution, setResolution] = useState<ManualDestinationResolution | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const [resolving, setResolving] = useState(false)

  const destinationInput = useMemo(() => ({
    query,
    countryCode: countryCode.trim() ? countryCode.trim().toUpperCase() : undefined,
    type: destinationType,
  }), [countryCode, destinationType, query])

  const resolve = async () => {
    setResolving(true)
    setLocalError(null)
    try { setResolution(await window.electronAPI.resolveManualDestination(destinationInput)) }
    catch (reason) { setLocalError(errorText(reason)) }
    finally { setResolving(false) }
  }

  const choose = async (candidateId: string) => {
    setResolving(true)
    setLocalError(null)
    try {
      setResolution(await window.electronAPI.correctManualDestination({
        query: destinationInput,
        candidateId,
        actorId,
        reason: 'Selección explícita desde la interfaz Manual',
      }))
    } catch (reason) { setLocalError(errorText(reason)) }
    finally { setResolving(false) }
  }

  const toggleProfile = (profile: EditorialProfile) => {
    setProfiles(current => current.includes(profile) ? current.filter(item => item !== profile) : [...current, profile])
  }

  const start = async () => {
    if (resolution?.status !== 'resolved' || profiles.length === 0) return
    await onStart({
      destinationQuery: query,
      countryCode: countryCode.trim() ? countryCode.trim().toUpperCase() : undefined,
      destinationType,
      profiles,
      language: 'es',
      depth,
      notes: notes.trim() || undefined,
      budgetLimit,
      maxAttempts,
      simulationScenario,
    })
  }

  return (
    <section className="new-layout">
      <div className="form-card">
        <div className="step-title"><span>1</span><div><h2>Destino canónico</h2><p>Primero comprueba la identidad territorial. Nunca se inventa un destino.</p></div></div>
        <div className="form-grid three">
          <label className="field wide"><span>Destino</span><input value={query} onChange={event => { setQuery(event.target.value); setResolution(null) }} placeholder="Morella" /></label>
          <label className="field"><span>País ISO</span><input value={countryCode} maxLength={2} onChange={event => { setCountryCode(event.target.value); setResolution(null) }} placeholder="ES" /></label>
          <label className="field"><span>Tipo</span><select value={destinationType} onChange={event => { setDestinationType(event.target.value as ManualResearchStart['destinationType']); setResolution(null) }}><option value="locality">Localidad</option><option value="region">Región</option><option value="country">País</option><option value="zone">Zona</option></select></label>
        </div>
        <button className="button secondary" onClick={resolve} disabled={!query.trim() || resolving || busy}>{resolving ? 'Resolviendo…' : 'Resolver destino'}</button>
        {localError && <div className="inline-error">{localError}</div>}
        {resolution?.status === 'not_found' && <div className="resolution-card negative"><strong>Sin coincidencia</strong><p>{resolution.reason}</p></div>}
        {resolution?.status === 'ambiguous' && (
          <div className="resolution-card ambiguous"><strong>Elige una coincidencia</strong><p>La ambigüedad queda visible y requiere tu decisión.</p><div className="candidate-list">{resolution.candidates.map(candidate => <button key={candidate.entity.id} onClick={() => choose(candidate.entity.id)}><span><strong>{candidate.entity.name}</strong><small>{[...candidate.hierarchy.map(item => item.name), candidate.entity.name].join(' › ')}</small></span><span>{Math.round(candidate.score * 100)}%</span></button>)}</div></div>
        )}
        {resolution?.status === 'resolved' && (
          <div className="resolution-card positive"><div><span className="check-icon">✓</span><div><strong>{resolution.entity.name}</strong><p>{[...resolution.hierarchy.map(item => item.name), resolution.entity.name].join(' › ')}</p></div></div><dl><div><dt>Método</dt><dd>{resolution.method}</dd></div><div><dt>Catálogo</dt><dd>{resolution.catalogVersion}</dd></div><div><dt>ID externo</dt><dd>{resolution.entity.externalIds?.geonames ?? 'Local sintético'}</dd></div></dl></div>
        )}
      </div>

      <div className={`form-card ${resolution?.status !== 'resolved' ? 'disabled-card' : ''}`}>
        <div className="step-title"><span>2</span><div><h2>Perfiles y configuración</h2><p>Los dos perfiles comparten hechos, pero producen decisiones editoriales distintas.</p></div></div>
        <fieldset className="profile-options" disabled={resolution?.status !== 'resolved'}><legend>Perfiles editoriales</legend>
          <label className={profiles.includes('adventure') ? 'selected' : ''}><input type="checkbox" checked={profiles.includes('adventure')} onChange={() => toggleProfile('adventure')} /><span className="profile-symbol">A</span><span><strong>Aventura</strong><small>Rutas, esfuerzo, preparación, riesgos y logística.</small></span></label>
          <label className={profiles.includes('student') ? 'selected' : ''}><input type="checkbox" checked={profiles.includes('student')} onChange={() => toggleProfile('student')} /><span className="profile-symbol student">E</span><span><strong>Estudiante</strong><small>Presupuesto, movilidad, servicios, estudio y vida diaria.</small></span></label>
        </fieldset>
        <div className="form-grid three">
          <label className="field"><span>Profundidad</span><select value={depth} onChange={event => setDepth(event.target.value as ManualResearchStart['depth'])} disabled={resolution?.status !== 'resolved'}><option value="standard">Estándar</option><option value="deep">Profunda</option></select></label>
          <label className="field"><span>Presupuesto máximo simulado (€)</span><input type="number" min="0.1" max="50" step="0.1" value={budgetLimit} onChange={event => setBudgetLimit(Number(event.target.value))} disabled={resolution?.status !== 'resolved'} /></label>
          <label className="field"><span>Intentos máximos</span><input type="number" min="1" max="5" step="1" value={maxAttempts} onChange={event => setMaxAttempts(Number(event.target.value))} disabled={resolution?.status !== 'resolved'} /></label>
          <label className="field full"><span>Escenario sintético de aceptación</span><select value={simulationScenario} onChange={event => setSimulationScenario(event.target.value as typeof simulationScenario)} disabled={resolution?.status !== 'resolved'}><option value="happy_path">Flujo válido</option><option value="insufficient_sources">Fuentes insuficientes</option><option value="broken_source">Una fuente rota</option><option value="provider_unavailable">Proveedor no disponible en el primer intento</option><option value="slow_interruptible">Ejecución lenta para interrumpir</option></select></label>
          <label className="field full"><span>Notas para la investigación</span><textarea rows={3} value={notes} onChange={event => setNotes(event.target.value)} maxLength={2000} disabled={resolution?.status !== 'resolved'} placeholder="Prioridades, límites o contexto editorial…" /></label>
        </div>
        <div className="scope-note"><strong>Ejecución segura</strong><span>Mocks locales deterministas · persistencia Supabase local · sin Trawel · sin publicación</span></div>
        <div className="form-actions"><button className="button ghost" onClick={onCancel}>Cancelar</button><button className="button primary" onClick={start} disabled={busy || resolution?.status !== 'resolved' || profiles.length === 0}>{busy ? 'Ejecutando pipeline…' : 'Iniciar investigación Manual'}</button></div>
      </div>
    </section>
  )
}

function ResearchWorkspace({ result, versions, busy, actorId, applyResult, onBack }: {
  result: ResearchDestinationResult
  versions: EditorialDraftVersionSummary[]
  busy: boolean
  actorId: string
  applyResult: (operation: () => Promise<ResearchDestinationResult>) => Promise<void>
  onBack: () => void
}): JSX.Element {
  const [tab, setTab] = useState<DetailTab>('overview')
  const totalCost = result.usage.reduce((sum, item) => sum + (item.actualCost ?? 0), 0)
  const tabs: Array<[DetailTab, string, number?]> = [
    ['overview', 'Resumen'], ['sources', 'Fuentes', result.sources.length], ['facts', 'Hechos', result.facts.length],
    ['places', 'Lugares', result.places.length], ['activities', 'Actividades', result.activities.length],
    ['drafts', 'Borradores', result.drafts.length], ['quality', 'RevisIAtor', result.qualityChecks.filter(item => item.result !== 'passed').length],
    ['history', 'Historial', result.events.length],
  ]
  return (
    <section className="detail-workspace">
      <button className="back-link" onClick={onBack}>← Biblioteca</button>
      <div className="detail-hero">
        <div><span className="eyebrow">{result.destination.type} · {result.destination.countryCode}</span><h2>{result.destination.name}</h2><p>{result.request.destinationQuerySnapshot} · catálogo {result.destination.sourceVersion}</p></div>
        <div className="hero-badges"><StateBadge value={result.request.state} /><span className="cost-pill">{formatMoney(totalCost, result.run.currency)}</span></div>
      </div>
      <StageTimeline current={result.run.stage} />
      <div className="detail-tabs" role="tablist" aria-label="Detalle de investigación">{tabs.map(([value, label, count]) => <button key={value} role="tab" aria-selected={tab === value} className={tab === value ? 'active' : ''} onClick={() => setTab(value)}>{label}{count !== undefined && <span>{count}</span>}</button>)}</div>
      <div className="detail-panel">
        {tab === 'overview' && <Overview result={result} />}
        {tab === 'sources' && <Sources result={result} />}
        {tab === 'facts' && <Facts result={result} />}
        {tab === 'places' && <Places result={result} />}
        {tab === 'activities' && <Activities result={result} />}
        {tab === 'drafts' && <Drafts result={result} busy={busy} actorId={actorId} applyResult={applyResult} />}
        {tab === 'quality' && <Quality result={result} />}
        {tab === 'history' && <History result={result} versions={versions} />}
      </div>
    </section>
  )
}

function StageTimeline({ current }: { current: string }): JSX.Element {
  const stages = ['destination_resolution', 'source_discovery', 'fact_structuring', 'profile_generation', 'quality_review', 'human_review']
  const currentIndex = stages.indexOf(current)
  return <ol className="stage-timeline" aria-label="Progreso del pipeline">{stages.map((stage, index) => <li key={stage} className={index <= currentIndex ? 'done' : ''}><span>{index < currentIndex ? '✓' : index + 1}</span><small>{stageLabels[stage]}</small></li>)}</ol>
}

function Overview({ result }: { result: ResearchDestinationResult }): JSX.Element {
  const hierarchy = result.destination.parentId ? 'Identidad jerárquica persistida' : 'Entidad raíz del catálogo'
  return <div className="overview-grid">
    <article className="panel-card span-two"><span className="card-kicker">IDENTIDAD CANÓNICA</span><h3>{result.destination.name}</h3><p>{hierarchy}. Resolución <strong>{result.destination.resolutionMethod}</strong>, fuente {result.destination.sourceName}.</p><dl className="definition-grid"><div><dt>ID estable</dt><dd>{result.destination.id}</dd></div><div><dt>Slug</dt><dd>{result.destination.slug}</dd></div><div><dt>Licencia</dt><dd>{result.destination.sourceLicense}</dd></div><div><dt>Versión</dt><dd>{result.destination.sourceVersion}</dd></div></dl></article>
    <article className="panel-card"><span className="card-kicker">MATERIAL ESTRUCTURADO</span><div className="big-number">{result.facts.length}</div><p>hechos con trazabilidad</p><small>{result.places.length} lugares · {result.activities.length} actividades</small></article>
    <article className="panel-card"><span className="card-kicker">DECISIÓN EDITORIAL</span><div className="decision-stack">{result.drafts.map(bundle => <div key={bundle.draft.id}><span>{profileLabel(bundle.draft.profile)}</span><StateBadge value={bundle.draft.state} /></div>)}</div><p className="muted">La aplicación no publica tras aprobar.</p></article>
    <article className="panel-card span-two"><span className="card-kicker">CONFIGURACIÓN</span><dl className="definition-grid"><div><dt>Perfiles</dt><dd>{result.request.profiles.map(profileLabel).join(', ')}</dd></div><div><dt>Profundidad</dt><dd>{result.request.depth}</dd></div><div><dt>Idioma</dt><dd>{result.request.language}</dd></div><div><dt>Presupuesto</dt><dd>{formatMoney(Number(result.request.options.budgetLimit), 'EUR')}</dd></div></dl>{result.request.notes && <p className="note-box">{result.request.notes}</p>}</article>
  </div>
}

function Sources({ result }: { result: ResearchDestinationResult }): JSX.Element {
  return <div className="card-list">{result.sources.map(source => {
    const parsedFailure = ResearchSourceFailureSchema.safeParse(source.metadata.failure)
    const failure = parsedFailure.success ? parsedFailure.data : undefined
    const legacyErrorCode = typeof source.metadata.errorCode === 'string' ? source.metadata.errorCode : undefined
    const errorCode = failure?.errorCode ?? legacyErrorCode
    const legacyStatus = errorCode?.match(/^HTTP_(\d{3})$/)?.[1]
    const httpStatus = failure?.httpStatus ?? (legacyStatus ? Number(legacyStatus) : undefined)
    const message = failure?.message ?? (httpStatus
      ? `La lectura de la fuente devolvió HTTP ${httpStatus}; se marcó como no disponible y el pipeline continuó con la evidencia válida.`
      : errorCode ? 'La fuente se marcó como no disponible y el pipeline continuó con la evidencia válida.' : undefined)
    return <article className="data-card" key={source.id}>
      <div className="data-card-heading"><div><span className="card-kicker">{source.sourceType} · {source.territorialScope}</span><h3>{source.title}</h3></div><span className={`status-chip ${source.status}`}>{source.status}</span></div>
      <a href={source.url} target="_blank" rel="noreferrer">{source.url}</a>
      {errorCode && message && <div className="source-failure" role="status"><strong>{httpStatus ? `HTTP ${httpStatus}` : errorCode}</strong><p>{message}</p><dl className="definition-grid failure-details"><div><dt>Código</dt><dd>{errorCode}</dd></div><div><dt>Etapa</dt><dd>{stageLabels[failure?.stage ?? 'source_reading']}</dd></div><div><dt>Intento</dt><dd>{failure?.attempt ?? 'No registrado'}</dd></div><div><dt>Registrado</dt><dd>{formatDate(failure?.occurredAt ?? source.capturedAt)}</dd></div><div><dt>Source ID</dt><dd className="technical-id">{source.id}</dd></div><div><dt>Run ID</dt><dd className="technical-id">{source.runId}</dd></div></dl></div>}
      <dl className="definition-grid compact"><div><dt>Fiabilidad</dt><dd>{Math.round(source.reliability * 100)}%</dd></div><div><dt>Actualidad</dt><dd>{source.freshness}</dd></div><div><dt>Editor</dt><dd>{source.publisher ?? 'Sin editor'}</dd></div><div><dt>Captura</dt><dd>{formatDate(source.capturedAt)}</dd></div></dl>
    </article>
  })}</div>
}

function Facts({ result }: { result: ResearchDestinationResult }): JSX.Element {
  const sourceById = new Map(result.sources.map(source => [source.id, source]))
  return <div className="card-list">{result.facts.map(fact => <article className="data-card fact-card" key={fact.id}><div className="data-card-heading"><span className="category-pill">{fact.category}</span><span className="confidence">{Math.round(fact.confidence * 100)}% confianza</span></div><h3>{fact.statement}</h3><div className="trace-row"><span>Fuentes</span>{fact.sourceIds.map(id => <small key={id}>{sourceById.get(id)?.title ?? id}</small>)}</div><div className="tag-row"><span>{fact.volatility}</span><span>{fact.reviewStatus}</span><span>{fact.contradiction === 'none' ? 'sin contradicción' : fact.contradiction}</span></div></article>)}</div>
}

function Places({ result }: { result: ResearchDestinationResult }): JSX.Element {
  return <div className="tile-grid">{result.places.map(place => <article className="panel-card" key={place.id}><span className="card-kicker">{place.category}</span><h3>{place.name}</h3><p>{place.factIds.length} hechos · {place.sourceIds.length} fuentes</p><div className="relevance"><span>Aventura <b style={{ width: `${place.profileRelevance.adventure * 100}%` }} /></span><span>Estudiante <b style={{ width: `${place.profileRelevance.student * 100}%` }} /></span></div><StateBadge value={place.status} /></article>)}</div>
}

function Activities({ result }: { result: ResearchDestinationResult }): JSX.Element {
  return <div className="tile-grid">{result.activities.map(activity => <article className="panel-card" key={activity.id}><span className="card-kicker">{activity.audienceProfiles.map(profileLabel).join(' · ')}</span><h3>{activity.name}</h3><p>{activity.durationMinutes ? `${activity.durationMinutes} min` : 'Duración por confirmar'} · coste {activity.costBand}</p><List label="Preparación" values={activity.requirements} /><List label="Accesibilidad" values={activity.accessibility} /><List label="Riesgos" values={activity.riskNotes} /></article>)}</div>
}

function List({ label, values }: { label: string; values: string[] }): JSX.Element {
  return <div className="mini-list"><strong>{label}</strong><ul>{values.map(value => <li key={value}>{value}</li>)}</ul></div>
}

function Drafts({ result, busy, actorId, applyResult }: {
  result: ResearchDestinationResult
  busy: boolean
  actorId: string
  applyResult: (operation: () => Promise<ResearchDestinationResult>) => Promise<void>
}): JSX.Element {
  return <div><div className="comparison-intro"><div><span className="card-kicker">COMPARACIÓN EDITORIAL</span><h3>Dos perfiles, dos utilidades</h3></div><p>Ambos parten de los mismos hechos. La estructura y las decisiones cambian por perfil.</p></div><div className="draft-columns">{result.drafts.map(bundle => <DraftColumn key={bundle.draft.id} bundle={bundle} review={result.qualityReviews.find(item => item.draftId === bundle.draft.id)} reviewHistory={manualReviewHistory(result.events, bundle.draft)} requestId={result.request.id} actorId={actorId} busy={busy} applyResult={applyResult} />)}</div></div>
}

function DraftColumn({ bundle, review, reviewHistory, requestId, actorId, busy, applyResult }: {
  bundle: EditorialDraftBundle
  review?: QualityReview
  reviewHistory: ManualReviewHistoryEntry[]
  requestId: string
  actorId: string
  busy: boolean
  applyResult: (operation: () => Promise<ResearchDestinationResult>) => Promise<void>
}): JSX.Element {
  const [editing, setEditing] = useState<string | null>(null)
  const [heading, setHeading] = useState('')
  const [content, setContent] = useState('')
  const [reason, setReason] = useState('')
  const [comment, setComment] = useState('')
  const openEdit = (section: EditorialDraftBundle['sections'][number]) => { setEditing(section.id); setHeading(section.heading); setContent(section.content); setReason('') }
  const applyReviewResult = (operation: () => Promise<ResearchDestinationResult>) => applyResult(async () => {
    const result = await operation()
    setComment('')
    return result
  })
  return <article className={`draft-column ${bundle.draft.profile}`}>
    <header><div><span className="profile-label">{profileLabel(bundle.draft.profile)}</span><h3>{bundle.draft.title}</h3></div><StateBadge value={bundle.draft.state} /></header>
    <p className="draft-intro">{bundle.draft.introduction}</p>
    <div className="draft-meta"><span>v{bundle.draft.contentVersion}</span><span>{bundle.draft.promptVersion}</span>{bundle.draft.humanEdited && <span>edición humana</span>}</div>
    <div className="section-stack">{bundle.sections.map(section => <section key={section.id}><div className="section-heading-inline"><div><span>{section.position + 1}</span><h4>{section.heading}</h4></div>{['ready', 'changes_requested', 'rejected'].includes(bundle.draft.state) && <button className="text-button" onClick={() => openEdit(section)}>Editar</button>}</div><p>{section.content}</p><small>{section.factIds.length} hechos · {section.sourceIds.length} fuentes</small>{editing === section.id && <div className="edit-box"><label className="field"><span>Título</span><input value={heading} onChange={event => setHeading(event.target.value)} /></label><label className="field"><span>Contenido</span><textarea rows={6} value={content} onChange={event => setContent(event.target.value)} /></label><label className="field"><span>Motivo obligatorio</span><input value={reason} onChange={event => setReason(event.target.value)} placeholder="Qué debe cambiar y por qué" /></label><div className="edit-actions"><button className="button ghost" onClick={() => setEditing(null)}>Cerrar</button><button className="button secondary" disabled={busy || !reason.trim()} onClick={() => applyResult(() => window.electronAPI.regenerateManualSection({ requestId, draftId: bundle.draft.id, sectionId: section.id, reason, actorId }))}>Regenerar con mock</button><button className="button primary" disabled={busy || !reason.trim() || content.trim().length < 60} onClick={() => applyResult(() => window.electronAPI.editManualSection({ requestId, draftId: bundle.draft.id, sectionId: section.id, heading, content, reason, actorId }))}>Guardar versión</button></div></div>}</section>)}</div>
    <footer className="review-actions">
      <div><span className="card-kicker">REVISIATOR</span>{review ? <StateBadge value={review.outcome} /> : <span>Sin revisión</span>}</div>
      {reviewHistory.length > 0 && <ManualDecisionDetails state={bundle.draft.state} history={reviewHistory} />}
      {bundle.draft.state === 'ready' && <button className="button primary" disabled={busy || !review || !['passed', 'passed_with_warnings'].includes(review.outcome)} onClick={() => applyResult(() => window.electronAPI.submitManualDraftReview({ requestId, draftId: bundle.draft.id, actorId }))}>Iniciar revisión humana</button>}
      {bundle.draft.state === 'rejected' && <div className="decision-box reopen-box"><label className="field"><span>Comentario obligatorio de reapertura</span><textarea rows={3} value={comment} onChange={event => setComment(event.target.value)} placeholder="Explica por qué debe reconsiderarse la decisión" /></label><div><button className="button secondary" disabled={busy || !comment.trim()} onClick={() => applyReviewResult(() => window.electronAPI.reopenManualDraftReview({ requestId, draftId: bundle.draft.id, actorId, comment }))}>Reabrir revisión</button></div></div>}
      {bundle.draft.state === 'in_review' && <div className="decision-box"><label className="field"><span>Comentario de decisión</span><textarea rows={3} value={comment} onChange={event => setComment(event.target.value)} /></label><div><button className="button danger" disabled={busy || !comment.trim()} onClick={() => applyReviewResult(() => window.electronAPI.decideManualDraft({ requestId, draftId: bundle.draft.id, actorId, decision: 'rejected', comment }))}>Rechazar</button><button className="button secondary" disabled={busy || !comment.trim()} onClick={() => applyReviewResult(() => window.electronAPI.decideManualDraft({ requestId, draftId: bundle.draft.id, actorId, decision: 'changes_requested', comment }))}>Solicitar cambios</button><button className="button success" disabled={busy || !comment.trim()} onClick={() => applyReviewResult(() => window.electronAPI.decideManualDraft({ requestId, draftId: bundle.draft.id, actorId, decision: 'approved', comment }))}>Aprobar</button></div></div>}
      {bundle.draft.state === 'approved' && <div className="no-publish-note">✓ Aprobado para biblioteca. No se ha publicado ni enviado a Trawel.</div>}
    </footer>
  </article>
}

function ManualDecisionDetails({ state, history }: {
  state: EditorialDraftBundle['draft']['state']
  history: ManualReviewHistoryEntry[]
}): JSX.Element {
  const current = history.at(-1)
  if (!current) return <></>
  return <section className="manual-decision-details" aria-label="Decisión humana actual e historial">
    <div className="manual-decision-heading"><div><span className="card-kicker">DECISIÓN HUMANA ACTUAL</span><strong>{manualReviewActionLabel(current.action)}</strong></div><StateBadge value={state} /></div>
    <p className="decision-comment">{current.comment ?? 'Inicio de revisión sin comentario de decisión.'}</p>
    <dl className="definition-grid">
      <div><dt>Actor</dt><dd className="technical-id">{current.actorId ?? 'No registrado'}</dd></div>
      <div><dt>Fecha y hora</dt><dd>{formatDate(current.occurredAt)}</dd></div>
      <div><dt>Versión afectada</dt><dd>v{current.draftVersion}</dd></div>
      <div><dt>Draft ID</dt><dd className="technical-id">{current.draftId}</dd></div>
    </dl>
    <div className="manual-decision-history">
      <strong>Historial de decisiones de v{current.draftVersion}</strong>
      <ol>{history.map(entry => <li key={entry.id}><span>{formatDate(entry.occurredAt)}</span><div><strong>{manualReviewActionLabel(entry.action)}</strong><p>{entry.comment ?? 'Sin comentario de decisión'}</p><small>Actor {entry.actorId ?? 'no registrado'} · v{entry.draftVersion}</small></div></li>)}</ol>
    </div>
  </section>
}

function manualReviewActionLabel(action: ManualReviewAction): string {
  if (action === 'started') return 'Revisión iniciada'
  if (action === 'reopened') return 'Revisión reabierta'
  if (action === 'approved') return 'Aprobada'
  if (action === 'changes_requested') return 'Cambios solicitados'
  return 'Rechazada'
}

function Quality({ result }: { result: ResearchDestinationResult }): JSX.Element {
  return <div className="quality-layout">{result.drafts.map(bundle => { const review = result.qualityReviews.find(item => item.draftId === bundle.draft.id); const checks = result.qualityChecks.filter(item => item.reviewId === review?.id); return <article className="quality-column" key={bundle.draft.id}><header><div><span className="profile-label">{profileLabel(bundle.draft.profile)}</span><h3>Revisión v{bundle.draft.contentVersion}</h3></div>{review && <StateBadge value={review.outcome} />}</header><div className="check-list">{checks.map(check => <div className={`check-row ${check.result}`} key={check.id}><span>{check.result === 'passed' ? '✓' : check.result === 'warning' ? '!' : '×'}</span><div><strong>{check.code}</strong><p>{check.evidence}</p>{check.correction && <small>Corrección: {check.correction}</small>}</div><em>{check.severity}</em></div>)}</div></article> })}<div className="human-gate"><strong>La decisión sigue siendo humana</strong><p>RevisIAtor recomienda, advierte o bloquea. Nunca aprueba por la persona ni publica contenido.</p></div></div>
}

function History({ result, versions }: { result: ResearchDestinationResult; versions: EditorialDraftVersionSummary[] }): JSX.Element {
  const runs = [...result.previousRuns, result.run].sort((left, right) => left.attempt - right.attempt)
  return <div className="history-grid"><section><div className="section-heading compact"><div><span className="card-kicker">VERSIONES</span><h3>Historial editorial</h3></div></div><div className="version-list">{versions.map(version => <article key={version.id}><span className={`version-dot ${version.humanEdited ? 'human' : ''}`} /><div><strong>{profileLabel(version.profile)} · v{version.contentVersion}</strong><p>{version.title}</p><small>{version.reason ?? 'Generación inicial'} · {formatDate(version.updatedAt)}</small></div><StateBadge value={version.state} /></article>)}</div><div className="section-heading compact"><div><span className="card-kicker">EJECUCIONES</span><h3>Intentos y recuperación</h3></div></div><div className="version-list">{runs.map(run => <article key={run.id}><span className="version-dot" /><div><strong>Intento {run.attempt} · {stageLabels[run.stage]}</strong><p>{run.errorMessage ?? (run.recoveryFromRunId ? 'Recuperado desde el intento anterior' : 'Ejecución inicial')}</p><small>{run.errorCode ?? run.contractVersion} · {formatMoney(run.actualCost, run.currency)}</small></div><StateBadge value={run.state} /></article>)}</div></section><section><div className="section-heading compact"><div><span className="card-kicker">AUDITORÍA</span><h3>Eventos del pipeline</h3></div></div><div className="event-list">{[...result.events].reverse().map(event => { const failureDetail = event.type === 'source.unavailable' ? sourceUnavailableEventDetail(event) : undefined; return <article key={event.id}><span>{formatTime(event.occurredAt)}</span><div><strong>{event.type}</strong>{failureDetail && <small className="event-failure-detail">{failureDetail}</small>}<small>{event.stage ? stageLabels[event.stage] : 'Sistema'} · {event.runId ? `run ${event.runId}` : event.correlationId}</small></div></article> })}</div><div className="cost-breakdown"><h4>Uso y costes</h4>{result.usage.map(item => <div key={item.id}><span>{item.cause}</span><span>{item.providerId}</span><strong>{formatMoney(item.actualCost, item.currency)}</strong></div>)}</div></section></div>
}

function IncompleteResearch({ summary, busy, onResume, onRetry, onCancel, onBack }: {
  summary: LibraryItem | null
  busy: boolean
  onResume: (requestId: string) => Promise<void>
  onRetry: (requestId: string) => Promise<void>
  onCancel: (requestId: string) => Promise<void>
  onBack: () => void
}): JSX.Element {
  const requestId = summary?.requestId
  const canRetry = summary?.state === 'failed' || summary?.state === 'retry_pending'
  const canResume = Boolean(summary && !['completed', 'failed', 'retry_pending', 'cancelled'].includes(summary.state))
  const canCancel = Boolean(summary && !['completed', 'cancelled'].includes(summary.state))
  return <section><button className="back-link" onClick={onBack}>← Biblioteca</button><div className="empty-card incident"><span className="empty-icon">!</span><h2>{summary?.destinationQuery ?? 'Investigación incompleta'}</h2><StateBadge value={summary?.state ?? 'failed'} /><p>{summary?.errorMessage ?? 'La ejecución conserva sus checkpoints y puede recuperarse sin repetir etapas terminadas.'}</p><dl className="definition-grid"><div><dt>Etapa</dt><dd>{stageLabels[summary?.stage ?? ''] ?? 'Desconocida'}</dd></div><div><dt>Código</dt><dd>{summary?.errorCode ?? 'Sin código'}</dd></div><div><dt>Clasificación</dt><dd>{failureLabels[summary?.failureClassification ?? ''] ?? 'Sin clasificación'}</dd></div><div><dt>Registrado</dt><dd>{summary?.failedAt ? formatDate(summary.failedAt) : 'Sin fecha'}</dd></div><div><dt>Request ID</dt><dd className="technical-id">{summary?.requestId ?? 'No disponible'}</dd></div><div><dt>Run ID</dt><dd className="technical-id">{summary?.runId ?? 'No disponible'}</dd></div><div><dt>Destino canónico</dt><dd className="technical-id">{summary?.destinationId ?? 'No disponible'}</dd></div></dl>{requestId && <div className="form-actions">{canResume && <button className="button primary" disabled={busy} onClick={() => onResume(requestId)}>Reanudar</button>}{canRetry && <button className="button primary" disabled={busy} onClick={() => onRetry(requestId)}>Reintentar etapa</button>}{canCancel && <button className="button ghost" disabled={busy} onClick={() => onCancel(requestId)}>Cancelar ejecución</button>}</div>}<p className="muted">Los reintentos están acotados, respetan el presupuesto restante y quedan auditados.</p></div></section>
}

function ContributionImportPanel(): JSX.Element {
  const [jobs, setJobs] = useState<ContributionImportJob[]>([])
  const [summary, setSummary] = useState<ContributionSyncSummary | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const refresh = useCallback(async () => setJobs(await window.electronAPI.listContributionImportJobs()), [])
  useEffect(() => { window.electronAPI.getContributionPersistenceStatus().then(current => { setConnected(current.connected); if (current.connected) return refresh(); setError(current.error ?? 'Supabase local desconectado') }).catch(reason => setError(errorText(reason))) }, [refresh])
  const download = async () => { setSyncing(true); setError(null); try { const next = await window.electronAPI.importPendingContributions(); setSummary(next); setJobs(next.jobs) } catch (reason) { setError(errorText(reason)) } finally { setSyncing(false) } }
  const retry = async (jobId: string) => { setSyncing(true); setError(null); try { setSummary(await window.electronAPI.retryContributionImportJob(jobId)); await refresh() } catch (reason) { setError(errorText(reason)) } finally { setSyncing(false) } }
  return <section><div className="section-heading"><div><span className="eyebrow">MÓDULO LOCAL EXISTENTE</span><h2>Contribuciones pendientes</h2><p>Adaptador remoto simulado y archivos privados en Supabase local.</p></div><button className="button primary" onClick={download} disabled={syncing || !connected}>{syncing ? 'Procesando…' : 'Descargar pendientes'}</button></div>{error && <div className="alert error">{error}</div>}{summary && <div className="metric-grid compact"><Metric label="Encontradas" value={summary.found} detail="en origen mock" /><Metric label="Descargadas" value={summary.downloaded} detail="en local" /><Metric label="Verificadas" value={summary.verified} detail="integridad correcta" /><Metric label="Fallidas" value={summary.failed} detail="visibles" tone={summary.failed ? 'warn' : 'normal'} /></div>}<div className="card-list">{jobs.map(job => <article className="data-card" key={job.id}><div className="data-card-heading"><div><strong>{job.remoteId}</strong><p>{job.sourceType} · intento {job.attemptCount}</p></div><StateBadge value={job.status} /></div>{job.lastError && <p className="inline-error">{job.lastError}</p>}{['failed', 'retry_pending'].includes(job.status) && <button className="button secondary" onClick={() => retry(job.id)} disabled={syncing}>Reintentar</button>}</article>)}</div></section>
}

function ProviderCenterPanel(): JSX.Element {
  const [snapshot, setSnapshot] = useState<ProviderCenterSnapshot | null>(null)
  const [editing, setEditing] = useState<ProviderPublicStatus | null>(null)
  const [credential, setCredential] = useState('')
  const [model, setModel] = useState('')
  const [working, setWorking] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const load = useCallback(async () => setSnapshot(await window.electronAPI.listProviders()), [])
  useEffect(() => { load().catch(reason => setLocalError(errorText(reason))) }, [load])

  const mutate = async (operation: () => Promise<ProviderCenterSnapshot>) => {
    setWorking(true)
    setLocalError(null)
    try {
      setSnapshot(await operation())
    } catch (reason) {
      setLocalError(errorText(reason))
    } finally {
      setWorking(false)
    }
  }

  const openConfiguration = (provider: ProviderPublicStatus) => {
    setEditing(provider)
    setCredential('')
    setModel(provider.selectedModel)
    setLocalError(null)
  }

  const saveConfiguration = async () => {
    if (!editing) return
    const confirmReplace = !editing.configured || window.confirm(
      `La credencial existente de ${editing.displayName} será sustituida. ¿Continuar?`,
    )
    if (!confirmReplace) return
    await mutate(() => window.electronAPI.configureProvider({
      providerId: editing.id,
      credential,
      selectedModel: model,
      confirmReplace: editing.configured,
    }))
    setCredential('')
    setEditing(null)
  }

  const removeCredential = async (provider: ProviderPublicStatus) => {
    if (!window.confirm(`Se eliminará la credencial cifrada de ${provider.displayName}. ¿Continuar?`)) return
    await mutate(() => window.electronAPI.removeProviderCredential({
      providerId: provider.id,
      confirmation: 'ELIMINAR',
    }))
  }

  if (!snapshot) {
    return <section><div className="empty-card provider-loading"><span className="spinner" /><h2>Preparando almacenamiento seguro…</h2></div></section>
  }

  const categories = [
    { id: 'research_tool' as const, title: 'Herramientas de investigación', detail: 'Recuperan fuentes; no deciden el contenido editorial.' },
    { id: 'intelligence_engine' as const, title: 'Motores de inteligencia', detail: 'Comprenden, estructuran, redactan y revisan el expediente.' },
  ]

  return (
    <section>
      <div className="section-heading">
        <div><span className="eyebrow">CONFIGURACIÓN LOCAL SEGURA</span><h2>Centro de proveedores</h2><p>Clientes reales instalados detrás del gate; guardar y validar la configuración no usa red.</p></div>
        <span className="safety-pill">Llamadas externas bloqueadas</span>
      </div>
      {!snapshot.secureStorageAvailable && (
        <div className="alert error" role="alert">
          <strong>Almacenamiento seguro no disponible.</strong>
          <span>La configuración y activación de proveedores permanece bloqueada.</span>
        </div>
      )}
      {localError && <div className="alert error" role="alert"><strong>Operación rechazada.</strong><span>{localError}</span></div>}
      {categories.map(category => (
        <div className="provider-category" key={category.id}>
          <header><div><span className="category-pill">{category.title}</span><p>{category.detail}</p></div></header>
          <div className="provider-grid">
            {snapshot.providers.filter(provider => provider.category === category.id).map(provider => (
              <article className="provider-card" key={provider.id}>
                <div className="provider-card-heading">
                  <div><h3>{provider.displayName}</h3><span>{provider.selectedModel}</span></div>
                  <span className={`state-badge ${provider.active ? 'state-approved' : ''}`}>{provider.active ? 'Activo' : 'Inactivo'}</span>
                </div>
                <dl className="definition-grid">
                  <div><dt>Credencial</dt><dd>{provider.configured ? provider.credentialMask : 'No configurada'}</dd></div>
                  <div><dt>Conexión</dt><dd>{connectionLabel(provider.connectionState)}</dd></div>
                  <div><dt>Última prueba</dt><dd>{provider.lastTestAt ? formatDate(provider.lastTestAt) : 'Nunca'}</dd></div>
                  <div><dt>Modelo</dt><dd>{provider.selectedModel}</dd></div>
                  <div><dt>Tarifa oficial</dt><dd className={provider.tariffStatus === 'current' ? '' : 'tariff-warning'}>{tariffStatusLabel(provider)}</dd></div>
                  <div><dt>Precio</dt><dd>{provider.tariffSummary}</dd></div>
                  <div><dt>Vigente desde</dt><dd>{provider.tariffEffectiveFrom ? formatDate(provider.tariffEffectiveFrom) : 'Sin verificar'}</dd></div>
                  <div><dt>Tarifa verificada</dt><dd>{provider.tariffVerifiedAt ? formatDate(provider.tariffVerifiedAt) : 'Sin verificar'}</dd></div>
                  <div><dt>Revisar antes de</dt><dd>{provider.tariffReviewAfter ? formatDate(provider.tariffReviewAfter) : 'Sin verificar'}</dd></div>
                  <div><dt>Entorno</dt><dd>Cliente real preparado · red bloqueada</dd></div>
                </dl>
                <div className="provider-actions">
                  <button className="button secondary" disabled={working || !snapshot.secureStorageAvailable} onClick={() => openConfiguration(provider)}>{provider.configured ? 'Sustituir credencial' : 'Configurar'}</button>
                  <button className="button ghost" disabled={working || !provider.configured} onClick={() => mutate(() => window.electronAPI.testProviderSimulated({ providerId: provider.id }))}>Validar sin red</button>
                  <button className="button ghost" disabled={working || !provider.configured} onClick={() => mutate(() => window.electronAPI.setProviderActive({ providerId: provider.id, active: !provider.active }))}>{provider.active ? 'Desactivar' : 'Activar'}</button>
                  {provider.configured && <button className="button danger" disabled={working} onClick={() => removeCredential(provider)}>Eliminar</button>}
                </div>
                {editing?.id === provider.id && (
                  <div className="provider-form">
                    <label className="field"><span>Credencial</span><input type="password" autoComplete="off" value={credential} onChange={event => setCredential(event.target.value)} /></label>
                    <label className="field"><span>Modelo o variante</span><select value={model} onChange={event => setModel(event.target.value)}>{provider.availableModels.map(available => <option key={available}>{available}</option>)}</select></label>
                    <div className="provider-form-actions"><button className="button ghost" onClick={() => { setCredential(''); setEditing(null) }}>Cancelar</button><button className="button primary" disabled={working || credential.length < 8} onClick={saveConfiguration}>Guardar cifrada</button></div>
                  </div>
                )}
              </article>
            ))}
          </div>
        </div>
      ))}
      <p className="scope-note"><strong>Frontera de seguridad</strong><span>Las credenciales se cifran en Electron main mediante safeStorage. El renderer solo recibe estado público y una máscara constante; validar aquí no prueba la clave contra Internet.</span></p>
    </section>
  )
}

function RealProfileSettingsPanel({ onLibraryChanged, onOpenLibraryEntry }: {
  onLibraryChanged: () => Promise<void>
  onOpenLibraryEntry: (entryId: string) => void
}): JSX.Element {
  const [settings, setSettings] = useState<RealProfileSettings | null>(null)
  const [preflight, setPreflight] = useState<RealConnectivityPreflight | null>(null)
  const [saving, setSaving] = useState(false)
  const [checkingConnectivity, setCheckingConnectivity] = useState(false)
  const [connectivityResult, setConnectivityResult] = useState<RealConnectivityResult | null>(null)
  const [saved, setSaved] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      window.electronAPI.getRealProfileSettings(),
      window.electronAPI.getRealConnectivityPreflight(),
    ])
      .then(([nextSettings, nextPreflight]) => {
        setSettings(nextSettings)
        setPreflight(nextPreflight)
      })
      .catch(reason => setLocalError(errorText(reason)))
  }, [])

  const updateProfile = (
    profile: 'adventure' | 'student',
    patch: Partial<RealProfileSettings['profiles'][number]>,
  ) => {
    setSaved(false)
    setSettings(current => current ? {
      ...current,
      profiles: current.profiles.map(item => item.profile === profile ? { ...item, ...patch } : item),
    } : current)
  }

  const save = async () => {
    if (!settings) return
    setSaving(true)
    setLocalError(null)
    try {
      setSettings(await window.electronAPI.saveRealProfileSettings(settings))
      setSaved(true)
    } catch (reason) {
      setLocalError(errorText(reason))
    } finally {
      setSaving(false)
    }
  }

  const runConnectivityCheck = async () => {
    const confirmed = window.confirm(
      'Prueba real mínima autorizada\n\n'
      + '• 1 Tavily Search basic (máximo 1 resultado)\n'
      + `• 1 OpenAI Responses con ${REAL_EDITORIAL_OPENAI_MODEL.displayName}`
      + ` (API: ${REAL_EDITORIAL_OPENAI_MODEL.apiId})\n`
      + '• Máximo total: 0,02 EUR\n'
      + '• Sin Morella, contenido editorial, publicación, Trawel ni Automatic\n'
      + '• Sin reintentos; un timeout ambiguo detiene la prueba\n\n'
      + '¿Confirmas estas dos únicas llamadas reales?',
    )
    if (!confirmed) return
    setCheckingConnectivity(true)
    setLocalError(null)
    try {
      setConnectivityResult(await window.electronAPI.runRealConnectivityCheck({
        humanConfirmation: REAL_CONNECTIVITY_CONFIRMATION,
        morellaExecutionRequested: false,
        publicationRequested: false,
        automaticRequested: false,
        trawelRequested: false,
      }))
    } catch (reason) {
      setLocalError(errorText(reason))
    } finally {
      setPreflight(await window.electronAPI.getRealConnectivityPreflight().catch(() => preflight))
      setCheckingConnectivity(false)
    }
  }

  if (!settings || !preflight) {
    return <section><div className="empty-card provider-loading"><span className="spinner" /><h2>Cargando roles editoriales…</h2></div></section>
  }
  const evidence = assessProfileEvidence(settings, 0)
  const activeCount = settings.profiles.filter(profile => profile.enabled).length
  return (
    <section>
      <div className="section-heading">
        <div><span className="eyebrow">PIPELINE REAL · CONFIGURACIÓN</span><h2>Roles y extensión</h2><p>La investigación será compartida; cada perfil conserva su voz, profundidad y objetivo aproximado.</p></div>
        <span className="safety-pill">Ejecución real bloqueada</span>
      </div>
      {localError && <div className="alert error" role="alert"><strong>No se pudo guardar.</strong><span>{localError}</span></div>}
      <div className="role-settings-grid">
        {settings.profiles.map(profile => {
          const assessment = evidence.find(item => item.profile === profile.profile)
          const adventure = profile.profile === 'adventure'
          return (
            <article className={`role-settings-card ${profile.enabled ? 'enabled' : ''}`} key={profile.profile}>
              <header>
                <div><span className="profile-label">{adventure ? 'AVENTURA' : 'ESTUDIANTE'}</span><h3>{adventure ? 'Aventurero experimentado' : 'Profesor o divulgador cercano'}</h3></div>
                <label className="role-toggle"><input type="checkbox" checked={profile.enabled} onChange={event => updateProfile(profile.profile, { enabled: event.target.checked })} /><span>{profile.enabled ? 'Activo' : 'Inactivo'}</span></label>
              </header>
              <p>{adventure ? 'Rutas, lugares, accesos, duración, costes, temporada y riesgos.' : 'Historia, fechas, población, monumentos, cultura y vida cotidiana.'}</p>
              <div className="form-grid">
                <label className="field"><span>Extensión aproximada</span><input type="number" min={800} max={4000} step={100} value={profile.targetWords} onChange={event => updateProfile(profile.profile, { targetWords: Number(event.target.value) })} /></label>
                <label className="field"><span>Profundidad</span><select value={profile.depth} onChange={event => updateProfile(profile.profile, { depth: event.target.value as 'standard' | 'deep' })}><option value="standard">Estándar</option><option value="deep">Profunda</option></select></label>
              </div>
              <small className="extension-help">800–4.000 palabras · incrementos de 100 · objetivo orientativo, nunca relleno.</small>
              {profile.enabled && assessment?.warning && <div className="evidence-warning" role="status"><strong>Evidencia pendiente</strong><span>{assessment.warning} Se comprobará tras investigar.</span></div>}
            </article>
          )
        })}
      </div>
      <div className="shared-research-note"><strong>Una sola investigación compartida</strong><span>Aventura y Estudiante reutilizarán el mismo expediente y conocimiento maestro; activar ambos no duplica Tavily.</span></div>
      <RealPilotPreflightPanel
        preflight={preflight}
        checking={checkingConnectivity}
        result={connectivityResult}
        onRun={runConnectivityCheck}
      />
      <RealEditorialPilotPanel
        onLibraryChanged={onLibraryChanged}
        onOpenLibraryEntry={onOpenLibraryEntry}
      />
      {activeCount === 0 && <div className="alert warning" role="alert"><strong>Activa al menos un perfil.</strong></div>}
      <div className="form-actions"><span className="muted">{saved ? 'Configuración guardada localmente.' : 'Sin ejecutar proveedores.'}</span><button className="button primary" disabled={saving || activeCount === 0 || settings.profiles.some(profile => profile.targetWords < 800 || profile.targetWords > 4000 || profile.targetWords % 100 !== 0)} onClick={save}>{saving ? 'Guardando…' : 'Guardar configuración'}</button></div>
    </section>
  )
}

function RealPilotPreflightPanel({ preflight, checking, result, onRun }: {
  preflight: RealConnectivityPreflight
  checking: boolean
  result: RealConnectivityResult | null
  onRun: () => void
}): JSX.Element {
  const policy = preflight.policy
  const connectivity = preflight.connectivityPolicy
  const readyForConnectivity = preflight.status === 'ready_for_live_connectivity_check'
  return (
    <section className="real-preflight" aria-label="Preflight del piloto real Morella">
      <header>
        <div><span className="card-kicker">PILOTO ÚNICO · MORELLA</span><h3>Preflight real sin red</h3><p>Evalúa configuración pública e infraestructura local; no descifra claves ni conecta con proveedores, saldo o red.</p></div>
        <span className={`state-badge ${readyForConnectivity ? 'state-approved' : 'state-blocked'}`}>{preflightStatusLabel(preflight.status)}</span>
      </header>
      <div className="real-policy-strip">
        <span>{connectivity.maxProviderCalls} llamadas máximo</span>
        <span>Concurrencia {connectivity.maxConcurrency}</span>
        <span>{formatMoney(connectivity.budgetEur)}</span>
        <span>{connectivity.maxRetries} reintentos</span>
        <span>{connectivity.maxRounds} rondas</span>
        <span>{connectivity.maxRegenerations} regeneraciones</span>
        <span>Search basic · 1 resultado</span>
        <span>0 publicación</span>
      </div>
      <div className="conversion-card">
        <strong>Conversión presupuestaria: 1 USD = 1 EUR</strong>
        <span>Tipo: conservador, no bancario</span>
        <span>{preflight.conversionPolicy.version} · vigente {formatDate(preflight.conversionPolicy.effectiveFrom)}</span>
        <small>{preflight.conversionPolicy.source}. {preflight.conversionPolicy.purpose}. Revisada {formatDate(preflight.conversionPolicy.reviewedAt)}.</small>
      </div>
      <div className="preflight-checks">
        {preflight.checks.map(check => (
          <article className={`preflight-${check.status}`} key={check.code}>
            <span aria-hidden="true">{check.status === 'pass' ? '✓' : check.status === 'warning' ? '!' : '×'}</span>
            <div><strong>{check.label}</strong><small>{check.detail}</small></div>
          </article>
        ))}
      </div>
      <div className="alert warning" role="status">
        <strong>La investigación real sigue bloqueada.</strong>
        <span>La acción solo prueba conectividad; no ejecuta {policy.destination}, no genera contenido y no publica.</span>
      </div>
      {result && <RealConnectivityResultPanel result={result} />}
      <div className="form-actions">
        <span className="muted">Llamadas externas realizadas por este preflight: {preflight.networkCallsPerformed}</span>
        <button
          className="button primary"
          disabled={!preflight.connectivityActionEnabled || checking}
          onClick={onRun}
        >
          {checking ? 'Probando conectividad…' : 'Probar conectividad real'}
        </button>
      </div>
    </section>
  )
}

function RealEditorialPilotPanel({ onLibraryChanged, onOpenLibraryEntry }: {
  onLibraryChanged: () => Promise<void>
  onOpenLibraryEntry: (entryId: string) => void
}): JSX.Element {
  const [preflight, setPreflight] = useState<RealEditorialPreflight | null>(null)
  const [progress, setProgress] = useState<RealEditorialPilotProgress | null>(null)
  const [terminalResult, setTerminalResult] = useState<RealEditorialTerminalResult | null>(null)
  const [actorId, setActorId] = useState<string | null>(null)
  const [operation, setOperation] = useState<string | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)

  const refresh = useCallback(async (pilotId?: string) => {
    const nextPreflight = await window.electronAPI.getRealEditorialPreflight(pilotId)
    setPreflight(nextPreflight)
    const currentId = pilotId ?? nextPreflight.pilot?.id
    if (currentId) {
      const nextProgress = await window.electronAPI.getRealEditorialProgress({ pilotId: currentId })
      setProgress(nextProgress)
      if ([
        'pending_human_review',
        'human_approved',
        'ready_for_library',
        'changes_requested',
        'human_rejected',
      ].includes(nextProgress.pilot.state)) {
        setTerminalResult(
          await window.electronAPI.getRealEditorialResult({ pilotId: currentId }) ?? null,
        )
      } else {
        setTerminalResult(null)
      }
    }
  }, [])

  useEffect(() => {
    refresh().catch(reason => setLocalError(errorText(reason)))
    window.electronAPI.getManualActor()
      .then(setActorId)
      .catch(reason => setLocalError(errorText(reason)))
  }, [refresh])

  useEffect(() => {
    const pilotId = preflight?.pilot?.id
    if (operation !== 'start' || !pilotId) return
    const timer = window.setInterval(() => {
      window.electronAPI.getRealEditorialProgress({ pilotId })
        .then(setProgress)
        .catch(() => undefined)
    }, 1_000)
    return () => window.clearInterval(timer)
  }, [operation, preflight?.pilot?.id])

  const run = async (name: string, action: () => Promise<unknown>, pilotId?: string) => {
    setOperation(name)
    setLocalError(null)
    try {
      await action()
      await refresh(pilotId)
    } catch (reason) {
      setLocalError(errorText(reason))
      if (pilotId) await refresh(pilotId).catch(() => undefined)
    } finally {
      setOperation(null)
    }
  }

  const prepare = async () => {
    let preparedId: string | undefined
    await run('prepare', async () => {
      const pilot = await window.electronAPI.prepareRealEditorialPilot({
        variantKey: 'initial',
        preparationKey: 'morella-real-editorial-pilot-v1-initial-prepare',
        taskOrigin: 'human_authorized',
        profiles: [
          { profile: 'adventure', enabled: true, targetWords: 1_000, depth: 'standard' },
          { profile: 'student', enabled: true, targetWords: 1_800, depth: 'deep' },
        ],
      })
      preparedId = pilot.id
    })
    if (preparedId) await refresh(preparedId)
  }

  if (!preflight) {
    return (
      <section className="real-preflight">
        <div className="provider-loading"><span className="spinner" /> Cargando ruta durable…</div>
      </section>
    )
  }

  const pilot = progress?.pilot ?? preflight.pilot
  const active = pilot && [
    'researching_round_1',
    'evaluating_round_1',
    'researching_round_2',
    'evaluating_round_2',
    'generating_adventure',
    'generating_student',
    'final_review',
  ].includes(pilot.state)
  const ready = preflight.status === 'ready_for_real_editorial_pilot'
  return (
    <section className="real-preflight editorial-pilot" aria-label="Ruta durable del piloto editorial real">
      <header>
        <div>
          <span className="card-kicker">RUTA EDITORIAL DURABLE · MORELLA</span>
          <h3>Preparación, progreso y reanudación</h3>
          <p>Ruta independiente de la prueba 10D y de las solicitudes Manual históricas.</p>
        </div>
        <span className={`state-badge ${ready ? 'state-approved' : 'state-blocked'}`}>
          {pilot ? stateLabels[pilot.state] ?? pilot.state : editorialPreflightLabel(preflight.status)}
        </span>
      </header>
      <div className="real-policy-strip">
        <span>Destino Morella · ES · localidad</span>
        <span>Aventura · 1.000 palabras</span>
        <span>Estudiante · 1.800 palabras</span>
        <span>Tavily Search basic</span>
        <span>OpenAI {preflight.policy.providers.model}</span>
        <span>Objetivo {formatMoney(preflight.policy.targetCostEur)}</span>
        <span>Aviso {formatMoney(preflight.policy.warningCostEur)}</span>
        <span>Parada {formatMoney(preflight.policy.automaticStopCostEur)}</span>
        <span>Máximo {preflight.policy.maxRounds} rondas</span>
        <span>{preflight.policy.maxFocusedQueries} consultas focalizadas</span>
        <span>Concurrencia {preflight.policy.maxConcurrency}</span>
        <span>0 regeneraciones</span>
        <span>0 publicaciones</span>
      </div>
      {localError && <div className="alert error"><strong>Ruta detenida.</strong><span>{localError}</span></div>}
      {pilot && (
        <dl className="definition-grid compact">
          <div><dt>Modo</dt><dd>real_editorial_pilot</dd></div>
          <div><dt>Estado</dt><dd>{stateLabels[pilot.state] ?? pilot.state}</dd></div>
          <div><dt>Run</dt><dd className="technical-id">{pilot.currentRunId}</dd></div>
          <div>
            <dt>Máximo vigente</dt>
            <dd>{pilot.budget ? formatMoney(pilot.budget.taskLimitCost) : 'Pendiente'}</dd>
          </div>
          <div><dt>Ronda</dt><dd>{progress?.currentRound ?? 0} / 2</dd></div>
          <div><dt>Coste</dt><dd>{formatMoney(progress?.accumulatedCost ?? pilot.budget?.spentCost ?? 0)}</dd></div>
          <div><dt>Reservas pendientes</dt><dd>{progress?.pendingReservations ?? 0}</dd></div>
          <div><dt>Publicaciones</dt><dd>{pilot.publicationCount}</dd></div>
        </dl>
      )}
      {progress?.latestIncident?.classification === 'human_required' && (
        <div className="alert warning">
          <strong>Decisión humana requerida.</strong>
          <span>{progress.latestIncident.message}</span>
        </div>
      )}
      {pilot?.state === 'pending_human_review' && (
        <div className="alert terminal-ready" role="status">
          <strong>
            Borradores generados y revisión automática completada; pendiente de decisión editorial humana.
          </strong>
        </div>
      )}
      {terminalResult && (
        <RealEditorialTerminalReviewPanel
          result={terminalResult}
          actorId={actorId}
          busy={operation !== null}
          onResolve={input => run(
            'terminal-review',
            () => window.electronAPI.resolveRealEditorialTerminalReview(input),
            input.pilotId,
          )}
          onMoveToLibrary={input => {
            void (async () => {
              await run(
                'library-transfer',
                () => window.electronAPI.moveApprovedRealEditorialResultToLibrary(input),
                input.pilotId,
              )
              await onLibraryChanged()
            })()
          }}
          onOpenLibraryEntry={onOpenLibraryEntry}
        />
      )}
      {progress?.humanRequiredCall && (
        <RealEditorialAmbiguousCallPanel
          call={progress.humanRequiredCall}
          actorId={actorId}
          busy={operation !== null}
          onResolve={input => run(
            'human-resolution',
            () => window.electronAPI.resolveRealEditorialAmbiguousCall(input),
            input.pilotId,
          )}
        />
      )}
      {progress?.coverageReview && (
        <RealEditorialCoverageDecisionPanel
          review={progress.coverageReview}
          actorId={actorId}
          busy={operation !== null}
          onResolve={input => run(
            'coverage-decision',
            () => window.electronAPI.resolveRealEditorialCoverage(input),
            input.pilotId,
          )}
        />
      )}
      {progress?.budgetReview && (
        <RealEditorialBudgetDecisionPanel
          review={progress.budgetReview}
          actorId={actorId}
          busy={operation !== null}
          onResolve={input => run(
            'budget-decision',
            () => window.electronAPI.resolveRealEditorialBudget(input),
            input.pilotId,
          )}
        />
      )}
      {progress?.sourceLimitRecovery && (
        <RealEditorialSourceLimitRecoveryPanel
          plan={progress.sourceLimitRecovery}
          actorId={actorId}
          busy={operation !== null}
          onRecover={input => run(
            'source-limit-recovery',
            () => window.electronAPI.recoverRealEditorialSourceLimit(input),
            input.pilotId,
          )}
        />
      )}
      {progress?.partialAnalysisRecovery && (
        <RealEditorialPartialAnalysisRecoveryPanel
          plan={progress.partialAnalysisRecovery}
          actorId={actorId}
          busy={operation !== null}
          onRecover={input => run(
            'partial-analysis-recovery',
            () => window.electronAPI.recoverRealEditorialPartialAnalysis(input),
            input.pilotId,
          )}
        />
      )}
      {progress?.historicalIncidentReview && (
        <RealEditorialHistoricalIncidentPanel
          review={progress.historicalIncidentReview}
          actorId={actorId}
          busy={operation !== null}
          onResolve={input => run(
            'historical-incident-resolution',
            () => window.electronAPI.resolveRealEditorialHistoricalIncidents(input),
            input.pilotId,
          )}
        />
      )}
      <div className="preflight-checks">
        {preflight.checks.map(check => (
          <article className={`preflight-${check.status}`} key={check.code}>
            <span aria-hidden="true">{check.status === 'pass' ? '✓' : check.status === 'warning' ? '!' : '×'}</span>
            <div><strong>{check.label}</strong><small>{check.detail}</small></div>
          </article>
        ))}
      </div>
      <div className="form-actions editorial-actions">
        <span className="muted">Este panel no publica, no conecta Trawel y no activa Automatic.</span>
        {!pilot && (
          <button className="button secondary" disabled={operation !== null} onClick={prepare}>
            {operation === 'prepare' ? 'Preparando…' : 'Preparar piloto'}
          </button>
        )}
        {pilot && !pilot.budgetConfirmed && (
          <button
            className="button secondary"
            disabled={operation !== null}
            onClick={() => run(
              'budget',
              () => window.electronAPI.confirmRealEditorialBudget({ pilotId: pilot.id }),
              pilot.id,
            )}
          >
            {operation === 'budget' ? 'Confirmando…' : 'Confirmar presupuesto 0,20 EUR'}
          </button>
        )}
        {pilot && pilot.state === 'preflight' && !progress?.checkpointAvailable
          && !progress?.humanRequiredCall && !progress?.budgetReview
          && !progress?.partialAnalysisRecovery && !progress?.historicalIncidentReview && (
          <button
            className="button primary"
            disabled={!preflight.startActionEnabled || operation !== null}
            onClick={() => {
              if (!window.confirm('Iniciar el piloto real Morella consumirá saldo. Requiere autorización operativa expresa.')) return
              void run('start', () => window.electronAPI.startRealEditorialPilot({ pilotId: pilot.id }), pilot.id)
            }}
          >
            {operation === 'start' ? 'Ejecutando…' : 'Iniciar piloto real'}
          </button>
        )}
        {pilot && (active || operation === 'start') && !progress?.humanRequiredCall
          && !progress?.sourceLimitRecovery && !progress?.partialAnalysisRecovery
          && !progress?.historicalIncidentReview && (
          <button
            className="button danger"
            disabled={operation === 'cancel'}
            onClick={() => run(
              'cancel',
              () => window.electronAPI.cancelRealEditorialPilot({
                pilotId: pilot.id,
                reason: 'Cancelación humana desde la interfaz',
              }),
              pilot.id,
            )}
          >
            Cancelar
          </button>
        )}
        {pilot && progress?.resumeAvailable && (
          <button
            className="button secondary"
            disabled={!ready || operation !== null}
            onClick={() => {
              if (!window.confirm('Reanudar continuará desde el checkpoint durable sin repetir trabajo conciliado.')) return
              void run('start', () => window.electronAPI.resumeRealEditorialPilot({ pilotId: pilot.id }), pilot.id)
            }}
          >
            Reanudar desde checkpoint
          </button>
        )}
      </div>
    </section>
  )
}

interface RealEditorialTerminalReviewPanelProps {
  result: RealEditorialTerminalResult
  actorId: string | null
  busy: boolean
  onResolve: (input: RealEditorialTerminalResolution) => void
  onMoveToLibrary?: (input: RealEditorialLibraryTransfer) => void
  onOpenLibraryEntry?: (entryId: string) => void
}

export function RealEditorialTerminalReviewPanel({
  result,
  actorId,
  busy,
  onResolve,
  onMoveToLibrary,
  onOpenLibraryEntry,
}: RealEditorialTerminalReviewPanelProps): JSX.Element {
  const [reason, setReason] = useState('')
  const [observations, setObservations] = useState('')
  const [adventureComment, setAdventureComment] = useState('')
  const [studentComment, setStudentComment] = useState('')
  const [warningsAccepted, setWarningsAccepted] = useState(false)
  const adventure = result.drafts.find(draft => draft.profile === 'adventure')
  const student = result.drafts.find(draft => draft.profile === 'student')
  const review = result.review
  const canShowDecision = result.state === 'pending_human_review'
    && !result.latestDecision
    && Boolean(actorId)
  const canSubmit = canShowDecision
    && reason.trim().length > 0
    && observations.trim().length > 0

  const base = {
    pilotId: result.pilotId,
    runId: result.runId,
    actorId: actorId ?? '',
    reason,
    observations,
    confirmed: true as const,
  }
  const requestChanges = () => {
    const profileComments = [
      ...(adventureComment.trim()
        ? [{ profile: 'adventure' as const, comment: adventureComment }]
        : []),
      ...(studentComment.trim()
        ? [{ profile: 'student' as const, comment: studentComment }]
        : []),
    ]
    if (profileComments.length === 0) return
    if (!window.confirm('Solicitar cambios conservará la versión 1 y no ejecutará ninguna regeneración.')) return
    onResolve({
      ...base,
      decision: 'request_changes',
      affectedProfiles: profileComments.map(item => item.profile),
      profileComments,
      warningsAccepted: false,
    })
  }

  return (
    <section className="real-terminal-review" aria-label="Revisión humana terminal del resultado real">
      <header>
        <div>
          <span className="card-kicker">RESULTADO EDITORIAL REAL · FASE TERMINAL</span>
          <h3>Borradores y revisión automática</h3>
          <p>Vista independiente del flujo Manual histórico. No publica ni ejecuta proveedores.</p>
        </div>
        <span className={`state-badge ${review?.outcome === 'passed_with_warnings' ? 'state-passed_with_warnings' : ''}`}>
          {review ? stateLabels[review.outcome] ?? review.outcome : 'Sin revisión'}
        </span>
      </header>

      <div className="terminal-budget-grid">
        <div><span>Gasto final</span><strong>{formatPreciseMoney(result.budget.spentCostEur)}</strong></div>
        <div><span>Reserva</span><strong>{formatPreciseMoney(result.budget.reservedCostEur)}</strong></div>
        <div><span>Máximo vigente</span><strong>{formatPreciseMoney(result.budget.currentMaximumCostEur)}</strong></div>
        <div><span>Disponible</span><strong>{formatPreciseMoney(result.budget.availableCostEur)}</strong></div>
        <div><span>Trabajo automatizado restante</span><strong>{formatPreciseMoney(result.budget.automatedWorkRemainingEur)}</strong></div>
        <div><span>Total proyectado</span><strong>{formatPreciseMoney(result.budget.projectedTotalCostEur)}</strong></div>
        <div><span>Déficit</span><strong>{formatPreciseMoney(result.budget.shortfallCostEur)}</strong></div>
      </div>

      <div className="terminal-drafts-grid">
        {[adventure, student].map(draft => draft && (
          <article className="terminal-draft" key={draft.profile}>
            <span className="card-kicker">{draft.profile === 'adventure' ? 'AVENTURA' : 'ESTUDIANTE'}</span>
            <h4>{draft.title}</h4>
            <small>
              {draft.approximateWordCount.toLocaleString('es-ES')} palabras aproximadas · versión 1 · referencias [cN] en el texto
            </small>
            <p className="terminal-draft-content">{draft.content}</p>
          </article>
        ))}
      </div>

      <div className="terminal-evidence-grid">
        <article>
          <h4>Gaps conservados ({result.gaps.length})</h4>
          <ol>{result.gaps.map(gap => (
            <li key={gap.id}><strong>{gap.id} · {gap.topic}</strong><span>{gap.description}</span></li>
          ))}</ol>
        </article>
        <article>
          <h4>Contradicciones conservadas ({result.contradictions.length})</h4>
          <ol>{result.contradictions.map(contradiction => (
            <li key={contradiction}>{contradiction}</li>
          ))}</ol>
        </article>
      </div>

      <article className="terminal-traceability">
        <h4>Trazabilidad de claims y evidencias</h4>
        <ul>{result.snapshot.masterKnowledge?.claims.map(claim => (
          <li key={claim.id}>
            <strong>{claim.id}</strong><span>{claim.statement}</span>
            <small>Evidencias: {claim.evidenceIds.join(', ')}</small>
          </li>
        ))}</ul>
      </article>

      {review && (
        <article className="terminal-automatic-review">
          <h4>Revisión automática: {stateLabels[review.outcome] ?? review.outcome}</h4>
          <ul>{review.issues.map(issue => <li key={issue}>{issue}</li>)}</ul>
        </article>
      )}

      <details className="terminal-artifact-audit">
        <summary>Identidad durable de los artefactos</summary>
        {Object.values(result.artifacts).map(artifact => (
          <p key={artifact.artifactId}>
            <span>{artifact.kind}/{artifact.key} v{artifact.version}</span>
            <code>{artifact.artifactId}</code><code>{artifact.hash}</code>
          </p>
        ))}
      </details>

      {result.latestDecision ? (
        <div className="decision-summary">
          <strong>{terminalDecisionLabel(result.latestDecision.decision)}</strong>
          <span>{result.latestDecision.reason}</span>
          <small>
            {formatDate(result.latestDecision.decidedAt)} · {
              result.libraryIntegration === 'not_started'
                ? 'Biblioteca no integrada'
                : 'Disponible en Biblioteca · Sin publicar'
            } · 0 publicaciones
          </small>
        </div>
      ) : canShowDecision ? (
        <div className="terminal-human-decision">
          <h4>Decisión editorial humana</h4>
          <label className="field">
            <span>Motivo obligatorio</span>
            <input value={reason} onChange={event => setReason(event.target.value)} />
          </label>
          <label className="field">
            <span>Observaciones humanas</span>
            <textarea rows={4} value={observations} onChange={event => setObservations(event.target.value)} />
          </label>
          <div className="terminal-profile-comments">
            <label className="field">
              <span>Cambios concretos para Aventura</span>
              <textarea rows={3} value={adventureComment} onChange={event => setAdventureComment(event.target.value)} />
            </label>
            <label className="field">
              <span>Cambios concretos para Estudiante</span>
              <textarea rows={3} value={studentComment} onChange={event => setStudentComment(event.target.value)} />
            </label>
          </div>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={warningsAccepted}
              onChange={event => setWarningsAccepted(event.target.checked)}
            />
            Acepto expresamente el resultado passed_with_warnings y sus observaciones.
          </label>
          <div className="form-actions">
            <button
              className="button danger"
              disabled={busy || !canSubmit}
              onClick={() => {
                if (!window.confirm('Rechazar conservará todos los artefactos y cerrará el resultado sin publicar.')) return
                onResolve({
                  ...base,
                  decision: 'reject_editorial_result',
                  affectedProfiles: ['adventure', 'student'],
                  profileComments: [],
                  warningsAccepted: false,
                })
              }}
            >Rechazar</button>
            <button
              className="button secondary"
              disabled={busy || !canSubmit || (!adventureComment.trim() && !studentComment.trim())}
              onClick={requestChanges}
            >Solicitar cambios</button>
            <button
              className="button success"
              disabled={busy || !canSubmit || !warningsAccepted}
              onClick={() => {
                if (!window.confirm('Aprobar dejará el resultado preparado para una futura integración con Biblioteca, sin publicarlo.')) return
                onResolve({
                  ...base,
                  decision: 'approve_editorial_result',
                  affectedProfiles: ['adventure', 'student'],
                  profileComments: [],
                  warningsAccepted: true,
                })
              }}
            >Aprobar resultado</button>
          </div>
          <small>Solicitar cambios no regenera contenido, no abre presupuesto y no llama a OpenAI.</small>
        </div>
      ) : (
        <div className="alert warning"><span>Falta el actor local autorizado para registrar una decisión.</span></div>
      )}
      {result.latestDecision?.decision === 'approve_editorial_result'
        && result.libraryIntegration === 'not_started'
        && actorId && (
        <div className="terminal-library-action">
          <h4>Incorporación a Biblioteca interna</h4>
          <p>Creará dos entradas separadas, Aventura y Estudiante, conservando texto, IDs, hashes, warnings y trazabilidad.</p>
          <ul><li>No publicará.</li><li>No conectará Trawel ni Automatic.</li><li>No llamará a OpenAI ni Tavily.</li><li>Los artefactos aprobados permanecerán inmutables.</li></ul>
          <button
            className="button primary"
            disabled={busy}
            onClick={() => {
              if (!window.confirm(
                'Añadir a Biblioteca creará dos entradas internas separadas.\n\n'
                + '• No se publicará.\n'
                + '• No se conectará Trawel ni Automatic.\n'
                + '• No se llamará a OpenAI ni Tavily.\n'
                + '• Los artefactos originales permanecerán inmutables.\n\n'
                + '¿Confirmas la incorporación durable?',
              )) return
              onMoveToLibrary?.({
                pilotId: result.pilotId,
                runId: result.runId,
                actorId,
                confirmed: true,
              })
            }}
          >Añadir a Biblioteca</button>
        </div>
      )}
      {result.libraryIntegration !== 'not_started' && (
        <div className="terminal-library-integrated" role="status">
          <strong>Disponible en Biblioteca · Sin publicar</strong>
          <span>Se reutilizarán estas mismas entradas ante una repetición idéntica.</span>
          <div className="form-actions">
            {result.libraryIntegration.entries.map(entry => (
              <button className="button secondary" key={entry.entryId} onClick={() => onOpenLibraryEntry?.(entry.entryId)}>
                Abrir {entry.profile === 'adventure' ? 'Aventura' : 'Estudiante'} en Biblioteca
              </button>
            ))}
          </div>
          <small>Transfer ID: {result.libraryIntegration.transferId} · coste de Biblioteca 0 EUR · 0 publicaciones</small>
        </div>
      )}
    </section>
  )
}

function terminalDecisionLabel(decision: RealEditorialTerminalResolution['decision']): string {
  if (decision === 'approve_editorial_result') return 'Resultado aprobado editorialmente'
  if (decision === 'request_changes') return 'Cambios solicitados'
  return 'Resultado rechazado editorialmente'
}

interface RealEditorialHistoricalIncidentPanelProps {
  review: RealEditorialHistoricalIncidentReview
  actorId: string | null
  busy: boolean
  onResolve: (input: RealEditorialHistoricalIncidentResolution) => void
}

export function RealEditorialHistoricalIncidentPanel({
  review,
  actorId,
  busy,
  onResolve,
}: RealEditorialHistoricalIncidentPanelProps): JSX.Element {
  const [reason, setReason] = useState('')
  const submit = () => {
    if (
      review.status !== 'required'
      || !review.resolutionAllowed
      || !actorId
      || !reason.trim()
    ) return
    if (!window.confirm(
      `Resolver únicamente ${review.assessments.length} incidentes históricos con la evidencia mostrada. `
      + 'No se cambiarán coste, reservas, fuentes ni checkpoint; no se llamará a proveedores '
      + 'y el workflow no se reanudará.',
    )) return
    onResolve({
      pilotId: review.pilotId,
      runId: review.runId,
      incidentIds: review.assessments.map(assessment => assessment.incidentId),
      actorId,
      reason: reason.trim(),
      confirmed: true,
    })
  }
  return (
    <section
      className="source-limit-recovery"
      aria-label="Resolución humana de incidentes históricos"
    >
      <header>
        <div>
          <span className="card-kicker">INCIDENTES HISTÓRICOS DE PERSISTENCIA</span>
          <h4>Revisión individual antes de habilitar la reanudación</h4>
        </div>
        <span className={`state-badge ${
          review.status === 'applied' ? 'state-approved' : 'state-blocked'
        }`}>{review.status}</span>
      </header>
      <p>
        La fecha no decide la clasificación. Cada incidente exige checkpoint posterior,
        artefacto compatible, corrección identificada y ausencia de efectos pendientes.
      </p>
      <dl className="definition-grid compact">
        <div><dt>Checkpoint actual</dt><dd>{review.currentCheckpointVersion}</dd></div>
        <div><dt>Gasto conservado</dt><dd>{formatPreciseMoney(review.spentCostEur)}</dd></div>
        <div><dt>Reserva conservada</dt><dd>{formatPreciseMoney(review.reservedCostEur)}</dd></div>
        <div><dt>Fuentes conservadas</dt><dd>{review.sourceCount}</dd></div>
        <div><dt>Llamadas realizadas</dt><dd>{review.providerCallsPerformed}</dd></div>
        <div><dt>Workflow reanudado</dt><dd>{review.workflowResumed ? 'Sí' : 'No'}</dd></div>
      </dl>
      <div className="source-limit-exclusions">
        {review.assessments.map(assessment => (
          <article key={assessment.incidentId}>
            <strong>{assessment.code} · {assessment.classification}</strong>
            <span className="technical-id">{assessment.incidentId}</span>
            <small>
              Checkpoint {assessment.failureCheckpointVersion ?? 'sin identificar'} →{' '}
              {assessment.currentCheckpointVersion} · {assessment.artifactKind}/
              {assessment.artifactKey} v{assessment.artifactVersion}
            </small>
            {assessment.existingValue && assessment.conflictingValue && (
              <small>
                Existente: {assessment.existingValue} · Candidato: {assessment.conflictingValue}
              </small>
            )}
            {assessment.durableEvidence.map(item => <small key={item}>✓ {item}</small>)}
            <small><strong>Riesgo:</strong> {assessment.riskEvaluation}</small>
            {assessment.correctionReference && (
              <small className="technical-id">Corrección: {assessment.correctionReference}</small>
            )}
          </article>
        ))}
      </div>
      {review.status === 'applied' ? (
        <div className="alert success">
          <strong>Resolución histórica durable aplicada.</strong>
          <span>
            Los incidentes conservan su auditoría. El checkpoint no se ejecutó y la próxima
            reanudación continúa siendo una acción humana separada.
          </span>
        </div>
      ) : review.resolutionAllowed ? (
        <>
          <label className="field">
            <span>Motivo humano de la resolución</span>
            <input
              maxLength={500}
              value={reason}
              onChange={event => setReason(event.target.value)}
              placeholder="Motivo operativo obligatorio"
            />
          </label>
          <div className="form-actions">
            <span className="muted">
              Solo resuelve los IDs evaluados; no modifica ledger ni ejecuta proveedores.
            </span>
            <button
              className="button primary"
              disabled={busy || !actorId || !reason.trim()}
              onClick={submit}
            >
              Resolver incidentes históricos
            </button>
          </div>
        </>
      ) : (
        <div className="alert warning">
          <strong>Resolución bloqueada.</strong>
          <span>La evidencia no demuestra que todos los incidentes sean históricos.</span>
        </div>
      )}
    </section>
  )
}

interface RealEditorialPartialAnalysisRecoveryPanelProps {
  plan: RealEditorialPartialAnalysisRecoveryPlan
  actorId: string | null
  busy: boolean
  onRecover: (input: RealEditorialPartialAnalysisRecovery) => void
}

export function RealEditorialPartialAnalysisRecoveryPanel({
  plan,
  actorId,
  busy,
  onRecover,
}: RealEditorialPartialAnalysisRecoveryPanelProps): JSX.Element {
  const [reason, setReason] = useState('')
  const submit = () => {
    if (!actorId || !reason.trim() || plan.status !== 'required') return
    if (!window.confirm(
      `Confirmar la recuperación de 38 artefactos parciales y asumir prudencialmente ${
        formatPreciseMoney(plan.maximumExposureCostEur)
      }. No se llamará a OpenAI ni Tavily y el pipeline no se reanudará.`,
    )) return
    onRecover({
      pilotId: plan.pilotId,
      runId: plan.runId,
      incidentId: plan.incidentId,
      callId: plan.callId,
      reservationId: plan.reservationId,
      actorId,
      reason: reason.trim(),
      assumedCostEur: plan.maximumExposureCostEur,
      confirmed: true,
    })
  }
  return (
    <section className="source-limit-recovery" aria-label="Recuperación humana del análisis parcial">
      <header>
        <div>
          <span className="card-kicker">RECUPERACIÓN HUMANA DE OPENAI RONDA 2</span>
          <h4>Respuesta recibida con persistencia parcial</h4>
        </div>
        <span className={`state-badge ${
          plan.status === 'applied' ? 'state-approved' : 'state-blocked'
        }`}>{plan.status}</span>
      </header>
      <p>{plan.diagnosticMessage}</p>
      <div className="alert warning">
        <strong>Riesgo de duplicación.</strong>
        <span>{plan.duplicateRiskMessage}</span>
      </div>
      <dl className="definition-grid compact">
        <div><dt>Artefactos parciales</dt><dd>{plan.counts.total}</dd></div>
        <div><dt>Checkpoint conservado</dt><dd>{plan.checkpointVersion}</dd></div>
        <div><dt>Respuesta completa recuperable</dt><dd>No</dd></div>
        <div><dt>Coste actual</dt><dd>{formatPreciseMoney(plan.spentCostEur)}</dd></div>
        <div><dt>Exposición máxima OpenAI</dt><dd>{formatPreciseMoney(plan.maximumExposureCostEur)}</dd></div>
        <div><dt>Reserva pendiente</dt><dd>{formatPreciseMoney(plan.reservedCostEur)}</dd></div>
      </dl>
      {plan.status === 'applied' ? (
        <div className="alert success">
          <strong>Respuesta parcial conciliada.</strong>
          <span>
            Los 38 artefactos permanecen auditados como parciales. El análisis de ronda 2
            sigue pendiente y no se ha reanudado automáticamente.
          </span>
        </div>
      ) : (
        <>
          <label className="field">
            <span>Motivo de la decisión prudencial</span>
            <input
              maxLength={500}
              value={reason}
              onChange={event => setReason(event.target.value)}
              placeholder="Motivo operativo obligatorio"
            />
          </label>
          <div className="form-actions">
            <span className="muted">
              La decisión asumirá la exposición máxima de la llamada; no crea una reserva.
            </span>
            <button
              className="button primary"
              disabled={busy || !actorId || !reason.trim()}
              onClick={submit}
            >
              Conciliar respuesta parcial
            </button>
          </div>
        </>
      )}
    </section>
  )
}

interface RealEditorialSourceLimitRecoveryPanelProps {
  plan: RealEditorialSourceLimitRecoveryPlan
  actorId: string | null
  busy: boolean
  onRecover: (input: RealEditorialSourceLimitRecovery) => void
}

export function RealEditorialSourceLimitRecoveryPanel({
  plan,
  actorId,
  busy,
  onRecover,
}: RealEditorialSourceLimitRecoveryPanelProps): JSX.Element {
  const [reason, setReason] = useState('')
  const submit = () => {
    if (!actorId || !reason.trim() || plan.status !== 'required') return
    if (!window.confirm(
      `Confirmar la selección durable de ${plan.selectedSources.length} fuentes y excluir ${
        plan.excludedSources.length
      } por el máximo global. No se llamará a Tavily ni OpenAI y el pipeline no se reanudará.`,
    )) return
    onRecover({
      pilotId: plan.pilotId,
      runId: plan.runId,
      incidentId: plan.incidentId,
      actorId,
      reason: reason.trim(),
      confirmed: true,
    })
  }
  return (
    <section className="source-limit-recovery" aria-label="Recuperación humana del límite de fuentes">
      <header>
        <div>
          <span className="card-kicker">RECUPERACIÓN HUMANA DE FUENTES</span>
          <h4>Selección durable dentro del máximo global</h4>
        </div>
        <span className={`state-badge ${
          plan.status === 'applied' ? 'state-approved' : 'state-blocked'
        }`}>
          {plan.status}
        </span>
      </header>
      <p>{plan.diagnosticMessage}</p>
      <dl className="definition-grid compact">
        <div><dt>Fuentes ya analizadas</dt><dd>{plan.existingSources.length}</dd></div>
        <div><dt>Candidatas de ronda 2</dt><dd>{plan.candidateSources.length}</dd></div>
        <div><dt>Plazas disponibles</dt><dd>{plan.availableSlots}</dd></div>
        <div><dt>Máximo global</dt><dd>{plan.maximumSources}</dd></div>
        <div><dt>Seleccionadas</dt><dd>{plan.selectedSources.length}</dd></div>
        <div><dt>Excluidas con auditoría</dt><dd>{plan.excludedSources.length}</dd></div>
        <div><dt>Gasto conservado</dt><dd>{formatPreciseMoney(plan.spentCostEur)}</dd></div>
        <div><dt>Reserva conservada</dt><dd>{formatPreciseMoney(plan.reservedCostEur)}</dd></div>
      </dl>
      <div className="source-limit-exclusions">
        <strong>Fuentes excluidas por agotamiento del límite</strong>
        {plan.excludedSources.map(source => (
          <article key={source.id}>
            <span>{source.title}</span>
            <small>{source.normalizedUrl} · rango {source.rank}</small>
          </article>
        ))}
      </div>
      {plan.status === 'applied' ? (
        <div className="alert success">
          <strong>Selección durable aplicada.</strong>
          <span>
            Checkpoint {plan.recoveredCheckpointVersion} preparado para analizar la ronda 2.
            OpenAI continúa pendiente y no se ha reanudado automáticamente.
          </span>
        </div>
      ) : (
        <>
          <label className="field">
            <span>Motivo de la recuperación</span>
            <input
              maxLength={500}
              value={reason}
              onChange={event => setReason(event.target.value)}
              placeholder="Motivo operativo obligatorio"
            />
          </label>
          <div className="form-actions">
            <span className="muted">
              Actor: {actorId ?? 'No disponible'} · no crea coste ni llama a proveedores.
            </span>
            <button
              className="button primary"
              disabled={busy || !actorId || !reason.trim()}
              onClick={submit}
            >
              Aplicar selección durable
            </button>
          </div>
        </>
      )}
    </section>
  )
}

interface RealEditorialCoverageDecisionPanelProps {
  review: RealEditorialCoverageReview
  actorId: string | null
  busy: boolean
  onResolve: (input: RealEditorialCoverageResolution) => void
}

export function RealEditorialCoverageDecisionPanel({
  review,
  actorId,
  busy,
  onResolve,
}: RealEditorialCoverageDecisionPanelProps): JSX.Element {
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [riskAccepted, setRiskAccepted] = useState(false)
  const terminal = review.status === 'accepted' || review.status === 'rejected'
  const submit = (decision: RealEditorialCoverageDecision) => {
    if (!actorId || !reason.trim()) return
    if (decision === 'accept_with_warnings' && !riskAccepted) return
    const labels: Record<RealEditorialCoverageDecision, string> = {
      keep_review_required: 'mantener la revisión requerida',
      reject_editorial_run: 'rechazar editorialmente el expediente',
      accept_with_warnings: 'aceptar la cobertura disponible con advertencias',
    }
    if (!window.confirm(
      `Confirmar ${labels[decision]}. La decisión quedará ligada al checkpoint ${review.checkpointVersion}.`,
    )) return
    const base = {
      pilotId: review.pilotId,
      runId: review.runId,
      actorId,
      reason: reason.trim(),
      note: note.trim() || undefined,
      confirmed: true as const,
    }
    onResolve(decision === 'accept_with_warnings'
      ? { ...base, decision, riskAccepted: true }
      : { ...base, decision })
  }
  return (
    <section className="budget-decision-review" aria-label="Decisión humana de cobertura">
      <header>
        <div>
          <span className="card-kicker">DECISIÓN HUMANA DE COBERTURA</span>
          <h4>La segunda ronda terminó con gaps y contradicciones</h4>
        </div>
        <span className={`state-badge ${
          review.status === 'accepted' ? 'state-approved' : 'state-blocked'
        }`}>{review.status}</span>
      </header>
      <p>
        La decisión conserva el checkpoint {review.checkpointVersion}, no ejecuta proveedores,
        no resuelve los gaps y no amplía el presupuesto automáticamente.
      </p>
      <dl className="definition-grid compact">
        <div><dt>Cobertura</dt><dd>{Math.round(review.coverageScore * 100)} %</dd></div>
        <div><dt>Gaps abiertos</dt><dd>{review.gaps.length}</dd></div>
        <div><dt>Contradicciones</dt><dd>{review.contradictions.length}</dd></div>
        <div><dt>Gasto actual</dt><dd>{formatPreciseMoney(review.spentCostEur)}</dd></div>
        <div><dt>Disponible</dt><dd>{formatPreciseMoney(review.availableCostEur)}</dd></div>
        <div>
          <dt>Mantener o rechazar</dt>
          <dd>{formatPreciseMoney(review.estimates.keepReviewRequired.remainingEstimatedCostEur)}</dd>
        </div>
        <div>
          <dt>Aceptar con advertencias</dt>
          <dd>{formatPreciseMoney(review.estimates.acceptWithWarnings.remainingEstimatedCostEur)}</dd>
        </div>
        <div>
          <dt>Total si se acepta</dt>
          <dd>{formatPreciseMoney(review.estimates.acceptWithWarnings.projectedTotalCostEur)}</dd>
        </div>
        <div>
          <dt>Déficit si se acepta</dt>
          <dd>{formatPreciseMoney(review.estimates.acceptWithWarnings.shortfallCostEur)}</dd>
        </div>
      </dl>
      <div className="source-limit-exclusions">
        {review.gaps.map(gap => (
          <article key={gap.id}>
            <strong>{gap.id} · {gap.importance} · {gap.topic}</strong>
            <span>{gap.description}</span>
            <small>Perfiles: {gap.requiredForProfiles.join(', ')}</small>
          </article>
        ))}
        {review.contradictions.map((contradiction, index) => (
          <article key={contradiction}>
            <strong>Contradicción {index + 1}</strong>
            <span>{contradiction}</span>
          </article>
        ))}
      </div>
      {review.latestDecision && (
        <div className={review.status === 'accepted' ? 'alert success' : 'alert warning'}>
          <strong>{coverageDecisionLabel(review.latestDecision.decision)}</strong>
          <span>{review.latestDecision.riskStatement}</span>
        </div>
      )}
      {!terminal && (
        <>
          <div className="form-grid budget-decision-form">
            <label className="field">
              <span>Motivo humano obligatorio</span>
              <input
                maxLength={500}
                value={reason}
                onChange={event => setReason(event.target.value)}
                placeholder="Justificación editorial"
              />
            </label>
            <label className="field full">
              <span>Nota opcional, sin credenciales</span>
              <textarea
                rows={3}
                maxLength={1_000}
                value={note}
                onChange={event => setNote(event.target.value)}
              />
            </label>
            <label className="field full checkbox-field">
              <input
                type="checkbox"
                checked={riskAccepted}
                onChange={event => setRiskAccepted(event.target.checked)}
              />
              <span>
                Acepto expresamente que los gaps y contradicciones seguirán abiertos y que la
                redacción deberá tratarlos con advertencias prudentes y trazables.
              </span>
            </label>
          </div>
          <div className="form-actions">
            <button
              className="button ghost"
              disabled={busy || !actorId || !reason.trim()}
              onClick={() => submit('keep_review_required')}
            >
              Mantener revisión
            </button>
            <button
              className="button danger"
              disabled={busy || !actorId || !reason.trim()}
              onClick={() => submit('reject_editorial_run')}
            >
              Rechazar expediente
            </button>
            <button
              className="button primary"
              disabled={busy || !actorId || !reason.trim() || !riskAccepted}
              onClick={() => submit('accept_with_warnings')}
            >
              Aceptar con advertencias
            </button>
          </div>
        </>
      )}
    </section>
  )
}

function coverageDecisionLabel(decision: RealEditorialCoverageDecision): string {
  if (decision === 'accept_with_warnings') return 'Cobertura aceptada con advertencias.'
  if (decision === 'reject_editorial_run') return 'Expediente rechazado editorialmente.'
  return 'La revisión humana continúa abierta.'
}

interface RealEditorialBudgetDecisionPanelProps {
  review: RealEditorialBudgetReview
  actorId: string | null
  busy: boolean
  onResolve: (input: RealEditorialBudgetResolution) => void
}

export function RealEditorialBudgetDecisionPanel({
  review,
  actorId,
  busy,
  onResolve,
}: RealEditorialBudgetDecisionPanelProps): JSX.Element {
  const [newMaximum, setNewMaximum] = useState('')
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const parsedMaximum = Number(newMaximum)
  const validMaximum = newMaximum !== ''
    && Number.isFinite(parsedMaximum)
    && parsedMaximum > review.currentMaximumCostEur
    && parsedMaximum >= review.totalEstimatedCostEur
    && parsedMaximum <= REAL_EDITORIAL_PILOT_POLICY.technicalLimitCostEur
  const margin = validMaximum
    ? parsedMaximum - review.totalEstimatedCostEur
    : undefined
  const terminal = review.status === 'authorized' || review.status === 'cancelled'

  const submit = (decision: RealEditorialBudgetDecision) => {
    if (!actorId || !reason.trim()) return
    const labels: Record<RealEditorialBudgetDecision, string> = {
      keep_limit: 'mantener el límite actual',
      authorize_extension: 'autorizar la ampliación manual',
      cancel_permanently: 'cancelar definitivamente',
    }
    if (!window.confirm(
      `Confirmar ${labels[decision]}. La decisión quedará registrada de forma durable.`,
    )) return
    const base = {
      pilotId: review.pilotId,
      runId: review.runId,
      actorId,
      reason: reason.trim(),
      note: note.trim() || undefined,
      confirmed: true as const,
    }
    onResolve(decision === 'authorize_extension'
      ? { ...base, decision, newMaximumCostEur: parsedMaximum }
      : { ...base, decision })
  }

  return (
    <section
      className="budget-decision-review"
      aria-label="Decisión humana de presupuesto"
    >
      <header>
        <div>
          <span className="card-kicker">DECISIÓN HUMANA DE PRESUPUESTO</span>
          <h4>{review.context === 'coverage_acceptance'
            ? 'Presupuesto para redactar con advertencias'
            : 'El máximo vigente no cubre el trabajo restante'}</h4>
        </div>
        <span className={`state-badge ${
          review.status === 'authorized' ? 'state-approved' : 'state-blocked'
        }`}>
          {review.status}
        </span>
      </header>
      <p>
        Los importes proceden del ledger durable. Esta decisión no llama a Tavily ni a OpenAI
        y no crea otro piloto, run o presupuesto.
      </p>
      <dl className="definition-grid compact">
        <div><dt>Gasto actual</dt><dd>{formatPreciseMoney(review.spentCostEur)}</dd></div>
        <div><dt>Máximo anterior</dt><dd>{formatPreciseMoney(review.previousMaximumCostEur)}</dd></div>
        <div><dt>Máximo vigente</dt><dd>{formatPreciseMoney(review.currentMaximumCostEur)}</dd></div>
        <div><dt>Disponible</dt><dd>{formatPreciseMoney(review.availableCostEur)}</dd></div>
        <div>
          <dt>Coste restante estimado</dt>
          <dd>{formatPreciseMoney(review.remainingEstimatedCostEur)}</dd>
        </div>
        <div><dt>Déficit</dt><dd>{formatPreciseMoney(review.shortfallCostEur)}</dd></div>
        <div><dt>Total estimado</dt><dd>{formatPreciseMoney(review.totalEstimatedCostEur)}</dd></div>
        <div><dt>Reservado</dt><dd>{formatPreciseMoney(review.reservedCostEur)}</dd></div>
      </dl>
      {review.latestDecision && (
        <div className={review.status === 'authorized' ? 'alert success' : 'alert warning'}>
          <strong>
            {review.latestDecision.decision === 'authorize_extension'
              ? 'Ampliación humana autorizada.'
              : review.latestDecision.decision === 'cancel_permanently'
                ? 'Cancelación definitiva registrada.'
                : 'Se mantiene el límite actual.'}
          </strong>
          <span>
            Actor {review.latestDecision.actorId} · {formatDate(review.latestDecision.decidedAt)}
            {' · '}{review.latestDecision.reason}
          </span>
        </div>
      )}
      {review.status === 'authorized' && (
        <div className="alert success">
          <strong>Checkpoint listo para reanudarse.</strong>
          <span>
            {review.context === 'coverage_acceptance'
              ? 'El checkpoint de ronda 2 está conservado. La acción posterior continuará directamente a redacción sin repetir Tavily ni análisis.'
              : 'Tavily ronda 1 y el análisis OpenAI ronda 1 ya están guardados. Solo se ejecutará el trabajo restante.'}
          </span>
        </div>
      )}
      {!terminal && (
        <>
          <div className="form-grid budget-decision-form">
            <label className="field">
              <span>Nuevo máximo total (EUR)</span>
              <input
                type="number"
                min={review.totalEstimatedCostEur}
                max={REAL_EDITORIAL_PILOT_POLICY.technicalLimitCostEur}
                step="0.000001"
                value={newMaximum}
                onChange={event => setNewMaximum(event.target.value)}
                placeholder="Introducir manualmente"
              />
            </label>
            <label className="field">
              <span>Margen tras ampliación</span>
              <output>{margin === undefined ? 'Pendiente' : formatPreciseMoney(margin)}</output>
            </label>
            <label className="field full">
              <span>Motivo de la decisión</span>
              <input
                maxLength={500}
                value={reason}
                onChange={event => setReason(event.target.value)}
                placeholder="Motivo operativo obligatorio"
              />
            </label>
            <label className="field full">
              <span>Nota opcional, sin claves ni cabeceras</span>
              <textarea
                rows={3}
                maxLength={1_000}
                value={note}
                onChange={event => setNote(event.target.value)}
              />
            </label>
          </div>
          <div className="form-actions">
            <span className="muted">
              Actor: {actorId ?? 'No disponible'} · se pedirá confirmación antes de guardar.
            </span>
            <button
              className="button ghost"
              disabled={busy || !actorId || !reason.trim()}
              onClick={() => submit('keep_limit')}
            >
              Mantener límite
            </button>
            <button
              className="button primary"
              disabled={busy || !actorId || !reason.trim() || !validMaximum}
              onClick={() => submit('authorize_extension')}
            >
              Autorizar ampliación
            </button>
            <button
              className="button danger"
              disabled={busy || !actorId || !reason.trim()}
              onClick={() => submit('cancel_permanently')}
            >
              Cancelar definitivamente
            </button>
          </div>
        </>
      )}
    </section>
  )
}

interface RealEditorialAmbiguousCallPanelProps {
  call: RealEditorialAmbiguousCall
  actorId: string | null
  busy: boolean
  onResolve: (input: RealEditorialAmbiguousCallResolution) => void
}

export function RealEditorialAmbiguousCallPanel({
  call,
  actorId,
  busy,
  onResolve,
}: RealEditorialAmbiguousCallPanelProps): JSX.Element {
  const [decision, setDecision] =
    useState<RealEditorialAmbiguousCallDecision>('indeterminate')
  const [recognizedCost, setRecognizedCost] = useState('')
  const [credits, setCredits] = useState('')
  const [inputTokens, setInputTokens] = useState('')
  const [outputTokens, setOutputTokens] = useState('')
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const consumption = decision === 'consumption_confirmed'
  const prudential = decision === 'prudential_cost_assumed'
  const providerName = providerDisplayName(call.providerId)
  const submit = () => {
    if (!actorId) return
    const label = humanResolutionDecisionLabel(decision)
    const confirmation = prudential && call.prudentialReconciliation
      ? `Confirmar “${label}”. ${providerName} no confirmó el consumo. Se imputarán ${formatPreciseMoney(call.prudentialReconciliation.maximumSubrequestCostEur)} y se liberarán ${formatPreciseMoney(call.prudentialReconciliation.releasedReserveEur)}. Se acepta el riesgo de un posible doble consumo real. La operación no reanudará el pipeline.`
      : `Confirmar “${label}”. La decisión quedará registrada de forma durable y no borrará la llamada histórica.`
    if (!window.confirm(confirmation)) return
    onResolve({
      pilotId: call.pilotId,
      runId: call.runId,
      callId: call.callId,
      actorId,
      decision,
      recognizedCostEur: consumption ? Number(recognizedCost) : undefined,
      credits: consumption && credits ? Number(credits) : undefined,
      inputTokens: consumption && inputTokens ? Number(inputTokens) : undefined,
      outputTokens: consumption && outputTokens ? Number(outputTokens) : undefined,
      prudentialCostEur: prudential
        ? call.prudentialReconciliation?.maximumSubrequestCostEur
        : undefined,
      currency: prudential
        ? call.prudentialReconciliation?.currency
        : undefined,
      reason: prudential ? reason.trim() : undefined,
      acceptsPotentialDuplicateCharge: prudential ? true : undefined,
      note: note.trim() || undefined,
      confirmed: true,
    })
  }
  const validConsumption = !consumption
    || recognizedCost !== ''
      && Number.isFinite(Number(recognizedCost))
      && Number(recognizedCost) >= 0
      && (
        Number(recognizedCost) > 0
        || Number(credits) > 0
        || Number(inputTokens) > 0
        || Number(outputTokens) > 0
      )
  const validPrudential = !prudential
    || Boolean(call.prudentialReconciliation && reason.trim())
  return (
    <section className="ambiguous-call-review" aria-label="Resolución humana de llamada remota">
      <header>
        <div>
          <span className="card-kicker">DECISIÓN HUMANA REQUERIDA</span>
          <h4>Llamada remota con consumo indeterminado</h4>
        </div>
        <span className="state-badge state-blocked">human_required</span>
      </header>
      <p>
        No se realizará otro intento hasta que compruebes esta llamada en el panel del proveedor.
        Resolverla no llama al proveedor ni reanuda automáticamente el pipeline.
      </p>
      <dl className="definition-grid compact">
        <div><dt>Proveedor</dt><dd>{call.providerId}</dd></div>
        <div><dt>Operación</dt><dd>{call.operation}</dd></div>
        <div><dt>Intento</dt><dd>{call.attempt}</dd></div>
        <div><dt>Fecha y hora</dt><dd>{formatDate(call.occurredAt)}</dd></div>
        <div><dt>Estado</dt><dd>{call.reviewState}</dd></div>
        <div><dt>Coste local conocido</dt><dd>{formatMoney(call.localKnownCostEur)}</dd></div>
        <div><dt>Exposición máxima de la llamada</dt><dd>{formatMoney(call.maximumExposureEur)}</dd></div>
        <div><dt>Límite automático inicial</dt><dd>{formatMoney(call.initialAutomaticLimitEur)}</dd></div>
        <div><dt>Gastado / máximo vigente</dt><dd>{formatMoney(call.spentCostEur)} / {formatMoney(call.currentMaximumCostEur)}</dd></div>
      </dl>
      {call.latestDecision && (
        <div className="alert warning">
          <strong>La ambigüedad continúa abierta.</strong>
          <span>
            “No puedo determinarlo” registrado por {call.latestDecision.actorId}
            {' · '}{formatDate(call.latestDecision.decidedAt)}.
          </span>
        </div>
      )}
      <div className="form-grid ambiguity-resolution-form">
        <label className="field full">
          <span>Decisión tras comprobar el panel de {providerName}</span>
          <select
            value={decision}
            onChange={event => setDecision(
              event.target.value as RealEditorialAmbiguousCallDecision,
            )}
          >
            <option value="no_consumption">El proveedor no registró consumo</option>
            <option value="consumption_confirmed">El proveedor sí registró consumo</option>
            <option value="indeterminate">No puedo determinarlo</option>
            <option
              value="prudential_cost_assumed"
              disabled={!call.prudentialReconciliation}
            >
              Asumir coste prudencial y permitir reintento
            </option>
            <option value="cancel_permanently">Cancelar definitivamente</option>
          </select>
        </label>
        {consumption && <>
          <label className="field">
            <span>Coste confirmado (EUR)</span>
            <input
              type="number"
              min="0"
              max={call.currentMaximumCostEur - call.spentCostEur}
              step="0.000001"
              value={recognizedCost}
              onChange={event => setRecognizedCost(event.target.value)}
            />
          </label>
          <label className="field">
            <span>Créditos, si constan</span>
            <input type="number" min="0" step="0.000001" value={credits} onChange={event => setCredits(event.target.value)} />
          </label>
          <label className="field">
            <span>Tokens de entrada</span>
            <input type="number" min="0" step="1" value={inputTokens} onChange={event => setInputTokens(event.target.value)} />
          </label>
          <label className="field">
            <span>Tokens de salida</span>
            <input type="number" min="0" step="1" value={outputTokens} onChange={event => setOutputTokens(event.target.value)} />
          </label>
        </>}
        {prudential && call.prudentialReconciliation && (
          <div className="alert warning field full">
            <strong>{providerName} no ha confirmado el consumo.</strong>
            <span>
              Se imputará por prudencia el máximo estimado de la subpetición,
              {' '}{formatPreciseMoney(call.prudentialReconciliation.maximumSubrequestCostEur)};
              se liberará {formatPreciseMoney(call.prudentialReconciliation.releasedReserveEur)}.
              La decisión será auditada y solo habilitará el reintento desde checkpoint.
            </span>
            <span>
              No se recuperará un posible resultado anterior y podría existir un pequeño doble
              consumo real si el proveedor procesó la primera petición.
            </span>
            <span className="technical-id">
              Query: {call.prudentialReconciliation.query}
            </span>
          </div>
        )}
        {prudential && (
          <label className="field full">
            <span>Motivo obligatorio de la conciliación prudencial</span>
            <textarea
              rows={2}
              maxLength={500}
              required
              value={reason}
              onChange={event => setReason(event.target.value)}
              placeholder="Justificación humana para asumir el coste máximo estimado"
            />
          </label>
        )}
        <label className="field full">
          <span>Nota opcional, sin claves ni cabeceras</span>
          <textarea
            rows={3}
            maxLength={1_000}
            value={note}
            onChange={event => setNote(event.target.value)}
            placeholder="Referencia de la comprobación humana, sin datos sensibles"
          />
        </label>
      </div>
      <div className="form-actions">
        <span className="muted">
          Actor: {actorId ?? 'No disponible'} · se pedirá confirmación antes de guardar.
        </span>
        <button
          className={decision === 'cancel_permanently' ? 'button danger' : 'button secondary'}
          disabled={busy || !actorId || !validConsumption || !validPrudential}
          onClick={submit}
        >
          {busy ? 'Guardando decisión…' : 'Guardar decisión humana'}
        </button>
      </div>
    </section>
  )
}

function humanResolutionDecisionLabel(decision: RealEditorialAmbiguousCallDecision): string {
  if (decision === 'no_consumption') return 'El proveedor no registró consumo'
  if (decision === 'consumption_confirmed') return 'El proveedor sí registró consumo'
  if (decision === 'prudential_cost_assumed') {
    return 'Asumir coste prudencial y permitir reintento'
  }
  if (decision === 'cancel_permanently') return 'Cancelar definitivamente'
  return 'No puedo determinarlo'
}

function providerDisplayName(providerId: string): string {
  if (providerId === 'openai') return 'OpenAI'
  return providerId.charAt(0).toUpperCase() + providerId.slice(1)
}

function RealConnectivityResultPanel({ result }: { result: RealConnectivityResult }): JSX.Element {
  return (
    <section className={`connectivity-result connectivity-${result.status}`} aria-label="Resultado de conectividad real">
      <header>
        <div>
          <span className="card-kicker">AUDITORÍA DURABLE</span>
          <h4>{result.status === 'succeeded' ? 'Conectividad validada' : 'Prueba detenida'}</h4>
        </div>
        <StateBadge value={result.status === 'succeeded' ? 'approved' : 'blocked'} />
      </header>
      {result.errorMessage && <div className="alert error"><strong>{result.errorCode}</strong><span>{result.errorMessage}</span></div>}
      <div className="connectivity-call-grid">
        {result.calls.map(call => (
          <article key={call.providerId}>
            <strong>
              {call.providerId === 'tavily'
                ? 'Tavily Search basic'
                : `OpenAI ${REAL_EDITORIAL_OPENAI_MODEL.displayName}`
                  + ` (API: ${REAL_EDITORIAL_OPENAI_MODEL.apiId})`}
            </strong>
            <dl className="definition-grid">
              <div><dt>Estado</dt><dd>{call.status}</dd></div>
              <div><dt>Duración</dt><dd>{call.durationMs} ms</dd></div>
              <div><dt>ID remoto</dt><dd>{call.remoteIdMask ?? 'No disponible'}</dd></div>
              <div><dt>Reserva estimada</dt><dd>{formatMoney(call.estimatedCostEur)}</dd></div>
              <div><dt>Coste conciliado</dt><dd>{formatMoney(call.costEur)} · USD {call.costUsd?.toFixed(9) ?? '—'}</dd></div>
              {call.providerId === 'tavily' && <>
                <div><dt>Créditos</dt><dd>{call.credits}</dd></div>
                <div><dt>Dominio</dt><dd>{call.domain ?? '—'}</dd></div>
              </>}
              {call.providerId === 'openai' && <>
                <div><dt>Tokens</dt><dd>{call.inputTokens} entrada · {call.cachedInputTokens} cache · {call.outputTokens} salida</dd></div>
                <div><dt>Literal esperado</dt><dd>{call.expectedOutputMatched ? 'Correcto' : 'Incorrecto'}</dd></div>
              </>}
            </dl>
          </article>
        ))}
      </div>
      <div className="real-policy-strip">
        <span>Ledger: {result.audit.providerCalls} llamadas</span>
        <span>{result.audit.pendingReservations === 0 ? 'Ledger conciliado' : 'Ledger no conciliado'}</span>
        <span>Pendientes: {result.audit.pendingReservations}</span>
        <span>Gastado: {formatMoney(result.audit.spentEur)}</span>
        <span>Restante: {formatMoney(result.audit.remainingEur)}</span>
        <span>Guarda: {result.audit.guardFree ? 'libre' : 'ocupada'}</span>
        <span>Publicaciones: {result.publicationCount}</span>
      </div>
    </section>
  )
}

function StateBadge({ value }: { value: string }): JSX.Element {
  return <span className={`state-badge state-${value}`}>{stateLabels[value] ?? value.replaceAll('_', ' ')}</span>
}

function viewTitle(view: View, selected: ResearchDestinationResult | null): string {
  if (view === 'new') return 'Nueva investigación'
  if (view === 'detail') return selected?.destination.name ?? 'Detalle de ejecución'
  if (view === 'contributions') return 'Contribuciones'
  if (view === 'providers') return 'Centro de proveedores'
  if (view === 'real-config') return 'Pipeline real'
  return 'Biblioteca editorial'
}

function profileLabel(profile: EditorialProfile): string { return profile === 'adventure' ? 'Aventura' : 'Estudiante' }
function sourceUnavailableEventDetail(event: ResearchDestinationResult['events'][number]): string {
  const httpStatus = typeof event.payload.httpStatus === 'number' ? `HTTP ${event.payload.httpStatus}` : undefined
  const errorCode = typeof event.payload.errorCode === 'string' ? event.payload.errorCode : 'SOURCE_UNAVAILABLE'
  const message = typeof event.payload.message === 'string' ? event.payload.message : 'Fuente no disponible'
  const sourceId = typeof event.payload.sourceId === 'string' ? event.payload.sourceId : 'sin source ID'
  const attempt = typeof event.payload.attempt === 'number' ? `intento ${event.payload.attempt}` : 'intento no registrado'
  return `${httpStatus ?? errorCode} · ${message} · ${sourceId} · ${attempt}`
}
function initials(value: string): string { return value.split(/\s+/).slice(0, 2).map(item => item[0]?.toUpperCase()).join('') }
function formatMoney(value?: number, currency = 'EUR'): string { return value === undefined ? '—' : new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(value) }
function formatPreciseMoney(value: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 6,
    maximumFractionDigits: 6,
  }).format(value)
}
function formatDate(value: Date | string): string { return new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) }
function formatTime(value: Date | string): string { return new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value)) }
function connectionLabel(value: ProviderPublicStatus['connectionState']): string {
  if (value === 'simulated_ok') return 'Simulada correcta'
  if (value === 'simulated_error') return 'Simulada fallida'
  return 'Sin probar'
}
function tariffStatusLabel(provider: ProviderPublicStatus): string {
  if (provider.tariffStatus === 'current') return `Vigente · ${provider.tariffCurrency ?? 'USD'}`
  if (provider.tariffStatus === 'stale') return 'Caducada · requiere revisión'
  return 'Sin verificar'
}
function preflightStatusLabel(value: RealConnectivityPreflight['status']): string {
  const labels: Record<RealConnectivityPreflight['status'], string> = {
    ready_for_live_connectivity_check: 'Preparado para conectividad',
    missing_credentials: 'Faltan credenciales',
    missing_tariff: 'Falta tarifa vigente',
    unsafe_storage: 'Almacenamiento inseguro',
    real_feature_disabled: 'Feature flag desactivada',
    budget_invalid: 'Presupuesto inválido',
    provider_inactive: 'Proveedor inactivo',
    blocked: 'Bloqueado',
  }
  return labels[value]
}
function editorialPreflightLabel(value: RealEditorialPreflight['status']): string {
  const labels: Record<RealEditorialPreflight['status'], string> = {
    ready_for_real_editorial_pilot: 'Preparado para piloto',
    missing_credentials: 'Faltan credenciales',
    provider_inactive: 'Proveedor inactivo',
    missing_tariff: 'Falta tarifa vigente',
    budget_invalid: 'Presupuesto pendiente',
    unsafe_storage: 'Almacenamiento inseguro',
    duplicate_requires_resolution: 'Duplicado bloqueado',
    repository_unavailable: 'Repositorio no disponible',
    real_feature_disabled: 'Feature flag desactivada',
    blocked: 'Bloqueado',
  }
  return labels[value]
}
function errorText(reason: unknown): string { return reason instanceof Error ? reason.message : String(reason) }
function summaryFromResult(result: ResearchDestinationResult): LibraryItem { return { requestId: result.request.id, runId: result.run.id, destinationId: result.destination.id, destinationQuery: result.request.destinationQuerySnapshot, profiles: result.request.profiles, state: result.request.state, version: result.request.version, stage: result.run.stage, runState: result.run.state, errorCode: result.run.errorCode, errorMessage: result.run.errorMessage, failureClassification: result.run.failureClassification, failedAt: result.run.state === 'failed' ? result.run.completedAt : undefined, hasActiveIncident: ['failed', 'retry_pending'].includes(result.request.state) || ['failed', 'retry_pending'].includes(result.run.state), latestRunActualCost: result.run.actualCost, currency: result.run.currency, createdAt: result.request.createdAt, updatedAt: result.request.updatedAt } }
function summaryFromIncident(incident: ManualResearchIncident): LibraryItem { return { requestId: incident.requestId, runId: incident.runId, destinationId: incident.destinationId, destinationQuery: incident.destinationQuery, profiles: incident.profiles, state: 'failed', version: 1, stage: incident.stage, runState: 'failed', errorCode: incident.errorCode, errorMessage: incident.errorMessage, failureClassification: incident.failureClassification, failedAt: incident.occurredAt, hasActiveIncident: true, createdAt: incident.occurredAt, updatedAt: incident.occurredAt } }
