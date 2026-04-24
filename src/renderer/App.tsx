/**
 * Investighost - Componente Principal App (MVP Funcional)
 * 
 * Propósito: UI completa del flujo de investigación → revisión
 * Alcance: Formulario, listado, detalle y visualización de resultados
 * Estado: Funcional con simulación - investigación real pendiente
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

  // Cargar solicitudes al iniciar
  const loadRequests = useCallback(async () => {
    const all = await researchModule.getAllRequests()
    setRequests(all)
  }, [])

  useEffect(() => {
    loadRequests()
  }, [loadRequests])

  // Handlers
  const handleCreateRequest = async (input: unknown) => {
    setIsLoading(true)
    try {
      const request = await researchModule.createRequest(input)
      await loadRequests()
      setActiveView('list')
      
      // Iniciar investigación automáticamente
      setTimeout(async () => {
        await researchModule.startResearch(request.id)
        await loadRequests()
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

  return (
    <div className="app">
      <header className="app-header">
        <h1 onClick={() => setActiveView('list')} style={{ cursor: 'pointer' }}>
          Investighost
        </h1>
        <p className="subtitle">Investigación de destinos para Trawel</p>
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
        {activeView === 'list' && (
          <ResearchList 
            requests={requests} 
            onSelect={handleSelectRequest}
            isLoading={isLoading}
          />
        )}
        
        {activeView === 'new' && (
          <NewResearchForm 
            onSubmit={handleCreateRequest}
            onCancel={() => setActiveView('list')}
            isLoading={isLoading}
          />
        )}
        
        {activeView === 'detail' && selectedRequest && (
          <ResearchDetail 
            request={selectedRequest}
            result={selectedResult}
            draft={selectedDraft}
            onBack={() => setActiveView('list')}
            isLoading={isLoading}
          />
        )}
      </main>

      <footer className="app-footer">
        <p>
          <span className="badge-mock">🔄 SIMULACIÓN</span>
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
}

function ResearchList({ requests, onSelect, isLoading }: ResearchListProps): JSX.Element {
  const getStatusLabel = (status: ResearchRequest['status']) => {
    const labels: Record<string, string> = {
      pending: '⏳ Pendiente',
      researching: '🔍 Investigando...',
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
          <p>Crea tu primera investigación para empezar.</p>
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
}

function NewResearchForm({ onSubmit, onCancel, isLoading }: NewResearchFormProps): JSX.Element {
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
            {isLoading ? 'Creando...' : 'Crear investigación'}
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
}

function ResearchDetail({ request, result, draft, onBack, isLoading }: ResearchDetailProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<'overview' | 'places' | 'activities' | 'draft'>('overview')

  if (isLoading) {
    return <div className="loading">Cargando detalles...</div>
  }

  return (
    <div className="research-detail">
      <button className="btn-back" onClick={onBack}>← Volver al listado</button>
      
      <div className="detail-header">
        <h2>{request.input.region || request.input.country}</h2>
        <span className={`status-badge status-${request.status}`}>
          {request.status}
        </span>
      </div>

      {!result ? (
        <div className="waiting-state">
          <p>La investigación está en curso...</p>
          <p>Estado actual: <strong>{request.status}</strong></p>
          {request.status === 'error' && request.errorMessage && (
            <p className="error-message">Error: {request.errorMessage}</p>
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
              <OverviewTab result={result} request={request} />
            )}
            {activeTab === 'places' && <PlacesTab places={result.places} />}
            {activeTab === 'activities' && <ActivitiesTab activities={result.activities} />}
            {activeTab === 'draft' && draft && <DraftTab draft={draft} />}
          </div>
        </>
      )}
    </div>
  )
}

function OverviewTab({ result }: { result: ResearchResult; request: ResearchRequest }): JSX.Element {
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

function DraftTab({ draft }: { draft: EditorialDraft }): JSX.Element {
  return (
    <div className="draft-tab">
      <div className="draft-header">
        <h3>{draft.title}</h3>
        <div className="draft-meta">
          <span className="badge">Tono: {draft.tone}</span>
          <span className="badge">{draft.wordCount} palabras</span>
          <span className="badge">Estado: {draft.status}</span>
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