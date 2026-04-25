/**
 * Investighost - Componente Principal App (Con Integración Kimi)
 * 
 * Propósito: UI completa del flujo de investigación con soporte para IA real
 * Alcance: Formulario, listado, detalle, configuración y visualización de resultados
 * Estado: Integrado con Kimi - muestra estados de configuración y errores
 */

import { useState, useEffect, useCallback } from 'react'
import './App.css'
import { researchModule } from '@modules/research'
import * as store from '@modules/persistence/memory-store'
import type { ResearchRequest, ResearchResult, EditorialDraft } from '@shared/types'

// ============================================
// Componente Principal
// ============================================

export function App(): JSX.Element {
  const [activeView, setActiveView] = useState<'list' | 'new' | 'detail'>('list')
  const [requests, setRequests] = useState<ResearchRequest[]>([])
  const [selectedRequest, setSelectedRequest] = useState<ResearchRequest | null>(null)
  const [selectedResult, setSelectedResult] = useState<ResearchResult | null>(null)
  const [selectedDraft, setSelectedDraft] = useState<EditorialDraft | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  
  // Estado de configuración de proveedores
  const [providerStatus, setProviderStatus] = useState<{
    kimi: { configured: boolean; hasKey: boolean }
    openai: { configured: boolean; hasKey: boolean }
    debug: boolean
  } | null>(null)

  // Cargar solicitudes y estado de proveedores al iniciar
  const loadRequests = useCallback(async () => {
    const all = await researchModule.getAllRequests()
    setRequests(all)
  }, [])

  const loadProviderStatus = useCallback(async () => {
    try {
      const status = await window.electronAPI?.getProviderStatus?.()
      if (status) {
        setProviderStatus(status)
      }
    } catch (error) {
      console.error('Failed to load provider status:', error)
    }
  }, [])

  useEffect(() => {
    loadRequests()
    loadProviderStatus()
  }, [loadRequests, loadProviderStatus])

  // Handlers
  const handleCreateRequest = async (input: unknown) => {
    setIsLoading(true)
    try {
      const request = await researchModule.createRequest(input)
      await loadRequests()
      setActiveView('list')
      
      // Iniciar investigación automáticamente
      setTimeout(async () => {
        try {
          await researchModule.startResearch(request.id)
        } catch (error) {
          console.error('Research failed:', error)
        } finally {
          await loadRequests()
        }
      }, 100)
    } catch (error) {
      alert('Error: ' + (error as Error).message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSelectRequest = async (request: ResearchRequest) => {
    setSelectedRequest(request)
    setIsLoading(true)
    
    const result = await researchModule.getResult(request.id)
    setSelectedResult(result)
    
    if (result) {
      const draft = await store.getDraftByResultId(result.id)
      setSelectedDraft(draft)
    }
    
    setIsLoading(false)
    setActiveView('detail')
  }

  const kimiConfigured = providerStatus?.kimi?.configured ?? false

  return (
    <div className="app">
      <header className="app-header">
        <h1 onClick={() => setActiveView('list')} style={{ cursor: 'pointer' }}>
          Investighost
        </h1>
        <p className="subtitle">Investigación de destinos para Trawel</p>
        
        {/* Indicador de estado de Kimi */}
        <div className="provider-status">
          {providerStatus && (
            <span className={`status-indicator ${kimiConfigured ? 'ready' : 'not-ready'}`}>
              {kimiConfigured ? '🟢 Kimi listo' : '🔴 Kimi no configurado'}
            </span>
          )}
        </div>
        
        <div className="header-actions">
          <button 
            className="btn-primary"
            onClick={() => setActiveView('new')}
            disabled={activeView === 'new'}
          >
            + Nueva investigación
          </button>
        </div>
      </header>

      <main className="app-main">
        {/* Banner de configuración si Kimi no está listo */}
        {!kimiConfigured && activeView === 'list' && (
          <div className="config-banner">
            <h3>⚠️ Configuración necesaria</h3>
            <p>
              Para usar investigación real con Kimi, crea un archivo <code>.env</code> en la raíz del proyecto:
            </p>
            <pre>
              KIMI_API_KEY=sk-tu-clave-aqui
            </pre>
            <p>
              Obtén tu API key en <a href="https://platform.moonshot.cn/" target="_blank" rel="noopener noreferrer">platform.moonshot.cn</a>
            </p>
            <p className="note">
              Sin configuración, la app funcionará en modo simulación con datos de ejemplo.
            </p>
          </div>
        )}

        {activeView === 'list' && (
          <ResearchList 
            requests={requests} 
            onSelect={handleSelectRequest}
            isLoading={isLoading}
            kimiConfigured={kimiConfigured}
          />
        )}
        
        {activeView === 'new' && (
          <NewResearchForm 
            onSubmit={handleCreateRequest}
            onCancel={() => setActiveView('list')}
            isLoading={isLoading}
            kimiConfigured={kimiConfigured}
          />
        )}
        
        {activeView === 'detail' && selectedRequest && (
          <ResearchDetail 
            request={selectedRequest}
            result={selectedResult}
            draft={selectedDraft}
            onBack={() => setActiveView('list')}
            isLoading={isLoading}
            kimiConfigured={kimiConfigured}
          />
        )}
      </main>

      <footer className="app-footer">
        <p>
          {!kimiConfigured && <span className="badge-mock">🔄 SIMULACIÓN</span>}
          {kimiConfigured && <span className="badge-live">🤖 KIMI ACTIVO</span>}
          {' '}| Stack: Electron + React + TypeScript + Vite
          {' '}| Persistencia: Memoria temporal
        </p>
      </footer>
    </div>
  )
}

// ============================================
// Sub-componentes
// ============================================

interface ResearchListProps {
  requests: ResearchRequest[]
  onSelect: (r: ResearchRequest) => void
  isLoading: boolean
  kimiConfigured: boolean
}

function ResearchList({ requests, onSelect, isLoading, kimiConfigured }: ResearchListProps): JSX.Element {
  const getStatusLabel = (status: ResearchRequest['status']) => {
    const labels: Record<string, string> = {
      pending: '⏳ Pendiente',
      researching: kimiConfigured ? '🔍 Investigando con Kimi...' : '🔍 Simulando...',
      structured: '📊 Estructurado',
      drafted: '📝 Borrador listo',
      under_review: '👀 En revisión',
      approved: '✅ Aprobado',
      published: '🚀 Publicado',
      error: '❌ Error',
    }
    return labels[status] || status
  }

  const getStatusClass = (status: ResearchRequest['status']) => {
    return `status-badge status-${status}`
  }

  if (isLoading && requests.length === 0) {
    return <div className="loading">Cargando investigaciones...</div>
  }

  return (
    <div className="research-list">
      <h2>Mis investigaciones ({requests.length})</h2>
      
      {requests.length === 0 ? (
        <div className="empty-state">
          <p>No hay investigaciones todavía.</p>
          <p>{kimiConfigured ? 'Crea tu primera investigación con Kimi.' : 'Crea tu primera investigación (modo simulación).'}</p>
        </div>
      ) : (
        <div className="request-grid">
          {requests.map(req => (
            <div 
              key={req.id} 
              className="request-card"
              onClick={() => onSelect(req)}
            >
              <div className="request-header">
                <h3>{req.input.region || req.input.country}</h3>
                <span className={getStatusClass(req.status)}>
                  {getStatusLabel(req.status)}
                </span>
              </div>
              <div className="request-body">
                <p><strong>País:</strong> {req.input.country}</p>
                {req.input.focus && <p><strong>Enfoque:</strong> {req.input.focus}</p>}
                <p><strong>Idioma:</strong> {req.input.outputLanguage}</p>
              </div>
              <div className="request-footer">
                <small>{req.createdAt.toLocaleDateString('es-ES')}</small>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface NewResearchFormProps {
  onSubmit: (input: unknown) => void
  onCancel: () => void
  isLoading: boolean
  kimiConfigured: boolean
}

function NewResearchForm({ onSubmit, onCancel, isLoading, kimiConfigured }: NewResearchFormProps): JSX.Element {
  const [formData, setFormData] = useState({
    country: '',
    region: '',
    focus: '',
    outputLanguage: 'es',
    userNotes: '',
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(formData)
  }

  return (
    <div className="new-research-form">
      <h2>Nueva investigación</h2>
      
      {!kimiConfigured && (
        <div className="warning-box">
          <p>⚠️ <strong>Modo simulación:</strong> No hay Kimi configurado.</p>
          <p>La investigación usará datos de ejemplo en lugar de IA real.</p>
        </div>
      )}
      
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="country">País *</label>
          <input
            id="country"
            type="text"
            value={formData.country}
            onChange={e => setFormData({ ...formData, country: e.target.value })}
            placeholder="Ej: España, Italia, Japón"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="region">Región/Ciudad (opcional)</label>
          <input
            id="region"
            type="text"
            value={formData.region}
            onChange={e => setFormData({ ...formData, region: e.target.value })}
            placeholder="Ej: Valencia, Roma, Tokio"
          />
        </div>

        <div className="form-group">
          <label htmlFor="focus">Enfoque (opcional)</label>
          <input
            id="focus"
            type="text"
            value={formData.focus}
            onChange={e => setFormData({ ...formData, focus: e.target.value })}
            placeholder="Ej: gastronomía, cultura, relax"
          />
        </div>

        <div className="form-group">
          <label htmlFor="language">Idioma de salida</label>
          <select
            id="language"
            value={formData.outputLanguage}
            onChange={e => setFormData({ ...formData, outputLanguage: e.target.value })}
          >
            <option value="es">Español</option>
            <option value="en">English</option>
            <option value="fr">Français</option>
            <option value="de">Deutsch</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="notes">Notas adicionales (opcional)</label>
          <textarea
            id="notes"
            value={formData.userNotes}
            onChange={e => setFormData({ ...formData, userNotes: e.target.value })}
            placeholder="Cualquier información adicional relevante..."
            rows={3}
          />
        </div>

        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={isLoading}>
            {isLoading ? 'Creando...' : (kimiConfigured ? 'Investigar con Kimi' : 'Crear (simulación)')}
          </button>
        </div>
      </form>
    </div>
  )
}

interface ResearchDetailProps {
  request: ResearchRequest
  result: ResearchResult | null
  draft: EditorialDraft | null
  onBack: () => void
  isLoading: boolean
  kimiConfigured: boolean
}

function ResearchDetail({ request, result, draft, onBack, isLoading, kimiConfigured }: ResearchDetailProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<'overview' | 'places' | 'activities' | 'draft'>('overview')

  if (isLoading) {
    return <div className="loading">Cargando detalles...</div>
  }

  const isError = request.status === 'error'
  const errorMessage = request.errorMessage

  return (
    <div className="research-detail">
      <button className="btn-back" onClick={onBack}>← Volver al listado</button>
      
      <div className="detail-header">
        <h2>{request.input.region || request.input.country}</h2>
        <span className={`status-badge status-${request.status}`}>
          {request.status}
        </span>
      </div>

      {/* Mensaje de error si lo hay */}
      {isError && errorMessage && (
        <div className="error-banner">
          <h4>❌ Error en la investigación</h4>
          <p>{errorMessage}</p>
          {!kimiConfigured && (
            <p className="hint">
              ¿No tienes Kimi configurado? Revisa el archivo <code>.env</code> y añade tu KIMI_API_KEY.
            </p>
          )}
          {kimiConfigured && errorMessage?.includes('API key') && (
            <p className="hint">
              Parece que hay un problema con la API key. Verifica que sea válida y tenga saldo.
            </p>
          )}
        </div>
      )}

      {!result ? (
        <div className="waiting-state">
          <p>La investigación está en curso...</p>
          <p>Estado actual: <strong>{request.status}</strong></p>
          {!kimiConfigured && request.status === 'researching' && (
            <p className="note">Usando modo simulación (sin IA real)</p>
          )}
          {kimiConfigured && request.status === 'researching' && (
            <p className="note">Consultando con Kimi AI...</p>
          )}
        </div>
      ) : (
        <>
          <div className="tabs">
            <button 
              className={activeTab === 'overview' ? 'active' : ''}
              onClick={() => setActiveTab('overview')}
            >
              Resumen
            </button>
            <button 
              className={activeTab === 'places' ? 'active' : ''}
              onClick={() => setActiveTab('places')}
            >
              Lugares ({result.places.length})
            </button>
            <button 
              className={activeTab === 'activities' ? 'active' : ''}
              onClick={() => setActiveTab('activities')}
            >
              Actividades ({result.activities.length})
            </button>
            <button 
              className={activeTab === 'draft' ? 'active' : ''}
              onClick={() => setActiveTab('draft')}
            >
              Borrador
            </button>
          </div>

          <div className="tab-content">
            {activeTab === 'overview' && (
              <OverviewTab result={result} kimiConfigured={kimiConfigured} />
            )}
            {activeTab === 'places' && <PlacesTab places={result.places} />}
            {activeTab === 'activities' && <ActivitiesTab activities={result.activities} />}
            {activeTab === 'draft' && draft && <DraftTab draft={draft} kimiConfigured={kimiConfigured} />}
          </div>
        </>
      )}
    </div>
  )
}

function OverviewTab({ result, kimiConfigured }: { 
  result: ResearchResult; 
  kimiConfigured: boolean;
}): JSX.Element {
  return (
    <div className="overview-tab">
      <section>
        <h3>Destino</h3>
        <p><strong>{result.destination.region}, {result.destination.country}</strong></p>
        <p>{result.destination.description}</p>
      </section>

      <section>
        <h3>Resumen</h3>
        <p>{result.summary}</p>
      </section>

      <section>
        <h3>Confianza de la investigación</h3>
        <div className="confidence-bar">
          <div 
            className="confidence-fill" 
            style={{ width: `${result.confidence * 100}%` }}
          />
          <span>{Math.round(result.confidence * 100)}%</span>
        </div>
        {!kimiConfigured && (
          <p className="note">⚠️ Modo simulación - confianza estimada</p>
        )}
      </section>

      <section>
        <h3>Consejos prácticos</h3>
        <ul className="tips-list">
          {result.tips.map((tip, i) => (
            <li key={i}>{tip}</li>
          ))}
        </ul>
      </section>

      <section>
        <h3>Fuentes consultadas</h3>
        <ul className="sources-list">
          {result.sources.map(source => (
            <li key={source.id}>
              <a href={source.url} target="_blank" rel="noopener noreferrer">
                {source.title}
              </a>
              {' '}
              <small>({source.type}, fiabilidad: {Math.round(source.reliability * 100)}%)</small>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function PlacesTab({ places }: { places: ResearchResult['places'] }): JSX.Element {
  return (
    <div className="places-tab">
      {places.map(place => (
        <div key={place.id} className="place-card">
          <div className="place-header">
            <h4>{place.name}</h4>
            <span className="category-badge">{place.category}</span>
          </div>
          <p>{place.description}</p>
          <p><strong>Por qué visitar:</strong> {place.whyVisit}</p>
          {place.bestFor && <p><strong>Ideal para:</strong> {place.bestFor}</p>}
          {place.estimatedTime && <p><strong>Tiempo:</strong> {place.estimatedTime}</p>}
          {place.practicalInfo && (
            <p className="practical-info">ℹ️ {place.practicalInfo}</p>
          )}
        </div>
      ))}
    </div>
  )
}

function ActivitiesTab({ activities }: { activities: ResearchResult['activities'] }): JSX.Element {
  return (
    <div className="activities-tab">
      {activities.map(activity => (
        <div key={activity.id} className="activity-card">
          <div className="activity-header">
            <h4>{activity.name}</h4>
            <span className="category-badge">{activity.category}</span>
          </div>
          <p>{activity.description}</p>
          {activity.idealFor && <p><strong>Ideal para:</strong> {activity.idealFor}</p>}
          {activity.duration && <p><strong>Duración:</strong> {activity.duration}</p>}
        </div>
      ))}
    </div>
  )
}

function DraftTab({ draft, kimiConfigured }: { draft: EditorialDraft; kimiConfigured: boolean }): JSX.Element {
  return (
    <div className="draft-tab">
      <div className="draft-header">
        <h3>{draft.title}</h3>
        <div className="draft-meta">
          <span className="badge">Tono: {draft.tone}</span>
          <span className="badge">{draft.wordCount} palabras</span>
          <span className="badge">Estado: {draft.status}</span>
          {!kimiConfigured && <span className="badge badge-mock">SIMULADO</span>}
          {kimiConfigured && <span className="badge badge-live">KIMI</span>}
        </div>
      </div>

      <div className="draft-content">
        <section className="introduction">
          <h4>Introducción</h4>
          <p>{draft.introduction}</p>
        </section>

        {draft.sections.map(section => (
          <section key={section.id}>
            <h4>{section.heading}</h4>
            <div className="section-content">
              {section.content.split('\n').map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="draft-actions">
        <button className="btn-secondary">Editar borrador</button>
        <button className="btn-primary">Aprobar</button>
      </div>
    </div>
  )
}