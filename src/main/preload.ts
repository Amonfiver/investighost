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
import type { LibraryPageQueryInput } from '@shared/library-contracts'
import type {
  ProviderActivationInput,
  ProviderConfigureInput,
  ProviderDeleteInput,
  ProviderTestInput,
} from '@shared/provider-center-contracts'
import type { RealProfileSettings } from '@shared/real-profile-settings'
import type {
  RealConnectivityAuthorization,
} from '@shared/real-connectivity-contracts'
import type {
  RealEditorialAmbiguousCallResolution,
  RealEditorialBudgetResolution,
  RealEditorialPilotAction,
  RealEditorialPilotCancel,
  RealEditorialPilotPrepare,
  RealEditorialPilotProgress,
  RealEditorialSourceLimitRecovery,
} from '@shared/real-editorial-pilot-contracts'

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
  resumeManualResearch: (input: unknown) => ipcRenderer.invoke('manual:resume', input),
  retryManualResearch: (input: unknown) => ipcRenderer.invoke('manual:retry', input),
  cancelManualResearch: (input: unknown) => ipcRenderer.invoke('manual:cancel', input),
  listManualResearch: (query: LibraryPageQueryInput = {}) => ipcRenderer.invoke('manual:list', query),
  getManualResearch: (requestId: string) => ipcRenderer.invoke('manual:get', requestId),
  listManualDraftVersions: (requestId: string) => ipcRenderer.invoke('manual:list-draft-versions', requestId),
  editManualSection: (input: unknown) => ipcRenderer.invoke('manual:edit-section', input),
  regenerateManualSection: (input: unknown) => ipcRenderer.invoke('manual:regenerate-section', input),
  submitManualDraftReview: (input: unknown) => ipcRenderer.invoke('manual:submit-review', input),
  decideManualDraft: (input: unknown) => ipcRenderer.invoke('manual:decide', input),
  reopenManualDraftReview: (input: unknown) => ipcRenderer.invoke('manual:reopen-review', input),

  // Centro de proveedores. Configure es escritura unidireccional: ninguna respuesta contiene la credencial.
  listProviders: () => ipcRenderer.invoke('providers:list'),
  configureProvider: (input: ProviderConfigureInput) => ipcRenderer.invoke('providers:configure', input),
  setProviderActive: (input: ProviderActivationInput) => ipcRenderer.invoke('providers:set-active', input),
  removeProviderCredential: (input: ProviderDeleteInput) => ipcRenderer.invoke('providers:remove', input),
  testProviderSimulated: (input: ProviderTestInput) => ipcRenderer.invoke('providers:test-simulated', input),
  getRealConnectivityPreflight: () => ipcRenderer.invoke('real-preflight:get'),
  runRealConnectivityCheck: (input: RealConnectivityAuthorization) =>
    ipcRenderer.invoke('real-connectivity:run', input),
  getRealProfileSettings: () => ipcRenderer.invoke('real-profiles:get'),
  saveRealProfileSettings: (input: RealProfileSettings) => ipcRenderer.invoke('real-profiles:save', input),
  getRealEditorialPreflight: (pilotId?: string) => ipcRenderer.invoke('real-editorial:preflight', pilotId),
  prepareRealEditorialPilot: (input: RealEditorialPilotPrepare) =>
    ipcRenderer.invoke('real-editorial:prepare', input),
  confirmRealEditorialBudget: (input: RealEditorialPilotAction) =>
    ipcRenderer.invoke('real-editorial:confirm-budget', input),
  getRealEditorialProgress: (input: RealEditorialPilotAction): Promise<RealEditorialPilotProgress> =>
    ipcRenderer.invoke('real-editorial:progress', input),
  getRealEditorialResult: (input: RealEditorialPilotAction) =>
    ipcRenderer.invoke('real-editorial:result', input),
  startRealEditorialPilot: (input: RealEditorialPilotAction) =>
    ipcRenderer.invoke('real-editorial:start', input),
  cancelRealEditorialPilot: (input: RealEditorialPilotCancel) =>
    ipcRenderer.invoke('real-editorial:cancel', input),
  resumeRealEditorialPilot: (input: RealEditorialPilotAction) =>
    ipcRenderer.invoke('real-editorial:resume', input),
  resolveRealEditorialAmbiguousCall: (input: RealEditorialAmbiguousCallResolution) =>
    ipcRenderer.invoke('real-editorial:resolve-ambiguous-call', input),
  resolveRealEditorialBudget: (input: RealEditorialBudgetResolution) =>
    ipcRenderer.invoke('real-editorial:resolve-budget', input),
  recoverRealEditorialSourceLimit: (input: RealEditorialSourceLimitRecovery) =>
    ipcRenderer.invoke('real-editorial:recover-source-limit', input),
}

// Exponer como window.electronAPI
contextBridge.exposeInMainWorld('electronAPI', electronAPI)

console.log('[Preload] Electron API exposed')
console.log('[Preload] Investighost security context initialized')
