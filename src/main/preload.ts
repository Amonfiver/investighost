/**
 * Investighost - Preload Script
 * 
 * Propósito: Puente seguro entre main process y renderer
 * Alcance: Expone API segura a window.electronAPI
 * Estado: Superficie activa limitada a Manual local, contribuciones e información de app.
 * 
 * NOTA: Este archivo se ejecuta en contexto aislado, no tiene acceso a Node.js
 */

import { contextBridge, ipcRenderer } from 'electron'

// API expuesta al renderer
const electronAPI = {
  // App info
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  getPlatform: () => ipcRenderer.invoke('app:get-platform'),
  
  // Importación en Supabase local. La clave privilegiada permanece en main.
  getContributionPersistenceStatus: () => ipcRenderer.invoke('contributions:persistence-status'),
  importPendingContributions: () => ipcRenderer.invoke('contributions:import-pending'),
  listContributionImportJobs: () => ipcRenderer.invoke('contributions:list-jobs'),
  retryContributionImportJob: (jobId: string) => ipcRenderer.invoke('contributions:retry-job', jobId),

  // Flujo Manual canónico; el renderer nunca recibe credenciales de Supabase.
  getManualPersistenceStatus: () => ipcRenderer.invoke('manual:persistence-status'),
  getManualActor: () => ipcRenderer.invoke('manual:get-actor'),
  resolveManualDestination: (input: unknown) => ipcRenderer.invoke('manual:resolve-destination', input),
  correctManualDestination: (input: unknown) => ipcRenderer.invoke('manual:correct-destination', input),
  startManualResearch: (input: unknown) => ipcRenderer.invoke('manual:start', input),
  listManualResearch: () => ipcRenderer.invoke('manual:list'),
  getManualResearch: (requestId: string) => ipcRenderer.invoke('manual:get', requestId),
  listManualDraftVersions: (requestId: string) => ipcRenderer.invoke('manual:list-draft-versions', requestId),
  editManualSection: (input: unknown) => ipcRenderer.invoke('manual:edit-section', input),
  regenerateManualSection: (input: unknown) => ipcRenderer.invoke('manual:regenerate-section', input),
  submitManualDraftReview: (input: unknown) => ipcRenderer.invoke('manual:submit-review', input),
  decideManualDraft: (input: unknown) => ipcRenderer.invoke('manual:decide', input),
}

// Exponer como window.electronAPI
contextBridge.exposeInMainWorld('electronAPI', electronAPI)

console.log('[Preload] Electron API exposed')
console.log('[Preload] Investighost security context initialized')
