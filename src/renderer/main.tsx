/**
 * Investighost - Entry Point del Renderer (React)
 * 
 * Propósito: Montar la aplicación React en Electron
 * Alcance: UI de escritorio, comunica con main via electronAPI
 */

import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'

// Tipos globales de window
declare global {
  interface Window {
    electronAPI: {
      getVersion: () => Promise<string>
      getPlatform: () => Promise<string>
      db: {
        status: () => Promise<{ connected: boolean; reason: string }>
      }
    }
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)