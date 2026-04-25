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
}

// Exponer como window.electronAPI
contextBridge.exposeInMainWorld('electronAPI', electronAPI)

// Tipos para TypeScript
declare global {
  interface Window {
    electronAPI: typeof electronAPI
  }
}

console.log('[Preload] Electron API exposed')
console.log('[Preload] Investighost security context initialized')