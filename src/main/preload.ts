/**
 * Investighost - Preload Script
 * 
 * Propósito: Puente seguro entre main process y renderer
 * Alcance: Expone API segura a window.electronAPI
 * Estado: Actualizado con estado de proveedores AI
 * 
 * NOTA: Este archivo se ejecuta en contexto aislado, no tiene acceso a Node.js
 */

import { contextBridge, ipcRenderer } from 'electron'

// API expuesta al renderer
const electronAPI = {
  // App info
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  getPlatform: () => ipcRenderer.invoke('app:get-platform'),
  
  // AI Providers
  getProviderStatus: () => ipcRenderer.invoke('ai:get-provider-status'),
  
  // Research operations
  createResearch: (input: unknown) => ipcRenderer.invoke('research:create', input),
  startResearch: (requestId: string) => ipcRenderer.invoke('research:start', requestId),
  getAllResearch: () => ipcRenderer.invoke('research:get-all'),
  getResearchResult: (requestId: string) => ipcRenderer.invoke('research:get-result', requestId),
  getDraft: (resultId: string) => ipcRenderer.invoke('research:get-draft', resultId),

  // Search operations
  collectWebResearch: (input: unknown) => ipcRenderer.invoke('search:collect', input),
}

// Exponer como window.electronAPI
contextBridge.exposeInMainWorld('electronAPI', electronAPI)

console.log('[Preload] Electron API exposed')
console.log('[Preload] Investighost security context initialized')
