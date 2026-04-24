/**
 * Investighost - Componente Principal App
 * 
 * Propósito: UI raíz de la aplicación
 * Alcance: Pantalla inicial de estado del sistema
 * Estado: Esqueleto funcional, sin lógica de negocio real
 */

import { useEffect, useState } from 'react'
import './App.css'

interface SystemStatus {
  uiLoaded: boolean
  environment: string
  persistenceReady: boolean
  modulesReady: boolean
  version: string
  platform: string
}

export function App(): JSX.Element {
  const [status, setStatus] = useState<SystemStatus>({
    uiLoaded: false,
    environment: 'checking...',
    persistenceReady: false,
    modulesReady: false,
    version: '-',
    platform: '-',
  })

  useEffect(() => {
    // Simular carga de estado del sistema
    const loadStatus = async (): Promise<void> => {
      const [version, platform, dbStatus] = await Promise.all([
        window.electronAPI.getVersion(),
        window.electronAPI.getPlatform(),
        window.electronAPI.db.status(),
      ])

      setStatus({
        uiLoaded: true,
        environment: 'local/electron',
        persistenceReady: dbStatus.connected,
        modulesReady: true, // Placeholder: módulos creados
        version,
        platform,
      })
    }

    loadStatus()
  }, [])

  const upcomingModules = [
    { name: 'research', desc: 'Investigación de destinos' },
    { name: 'signals', desc: 'Recopilación de señales útiles' },
    { name: 'editorial', desc: 'Generación de borradores' },
    { name: 'review', desc: 'Revisión humana' },
    { name: 'publishing', desc: 'Publicación en Trawel' },
  ]

  return (
    <div className="app">
      <header className="app-header">
        <h1>Investighost</h1>
        <p className="subtitle">
          Herramienta personal de investigación para alimentar Trawel
        </p>
        <span className="version">v{status.version} | {status.platform}</span>
      </header>

      <main className="app-main">
        <section className="status-section">
          <h2>Estado del sistema</h2>
          <div className="status-grid">
            <StatusIndicator 
              label="UI cargada" 
              active={status.uiLoaded} 
            />
            <StatusIndicator 
              label="Entorno local operativo" 
              active={status.environment === 'local/electron'} 
            />
            <StatusIndicator 
              label="Persistencia preparada" 
              active={status.persistenceReady}
              note={!status.persistenceReady ? 'SQLite listo, pendiente de activar' : undefined}
            />
            <StatusIndicator 
              label="Módulos base creados" 
              active={status.modulesReady} 
            />
          </div>
        </section>

        <section className="modules-section">
          <h2>Próximos módulos</h2>
          <ul className="modules-list">
            {upcomingModules.map(mod => (
              <li key={mod.name} className="module-item">
                <code>{mod.name}</code>
                <span>{mod.desc}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="app-footer">
        <p>Stack: Electron + React + TypeScript + Vite + SQLite + Drizzle + Zod</p>
      </footer>
    </div>
  )
}

// Componente auxiliar para indicadores de estado
interface StatusIndicatorProps {
  label: string
  active: boolean
  note?: string
}

function StatusIndicator({ label, active, note }: StatusIndicatorProps): JSX.Element {
  return (
    <div className={`status-item ${active ? 'active' : 'inactive'}`}>
      <span className="status-dot" />
      <span className="status-label">{label}</span>
      {note && <span className="status-note">{note}</span>}
    </div>
  )
}