/**
 * Investighost - Preload Script
 * 
 * Propósito: Puente seguro entre main process y renderer
 * Alcance: Expone API segura al contexto de la ventana
 * 
 * Decisiones:
 *   - contextIsolation: true requiere preload explícito
 *   - Solo expone APIs necesarias, nada de node_modules crudos
 */

import { contextBridge, ipcRenderer } from 'electron'

// API expuesta al renderer
const electronAPI = {
  // Info de la app
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  getPlatform: () => ipcRenderer.invoke('app:get-platform'),
  
  // Placeholder para futura API de DB
  db: {
    status: () => Promise.resolve({ connected: false, reason: 'Not implemented in skeleton phase' }),
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

// Tipos para TypeScript
export type ElectronAPI = typeof electronAPI