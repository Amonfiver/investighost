/**
 * Investighost - Tipos Vite
 * 
 * Propósito: Declaraciones de tipos para Vite y Electron API
 */

/// <reference types="vite/client" />

declare module '*.css' {
  const css: string
  export default css
}

import type { ContributionImportJob, ContributionSyncSummary } from './shared/contracts'
import type { ResearchDestinationResult } from './shared/editorial-contracts'
import type {
  ManualDestinationCorrection,
  ManualDestinationQuery,
  ManualDestinationResolution,
  ManualDraftDecision,
  ManualDraftReopen,
  ManualDraftReview,
  ManualExecutionAction,
  ManualPersistenceStatus,
  ManualResearchExecutionOutcome,
  ManualResearchStart,
  ManualSectionEdit,
  ManualSectionRegeneration,
} from './shared/manual-contracts'
import type {
  LibraryPage,
  LibraryPageQueryInput,
} from './shared/library-contracts'
import type { EditorialDraftVersionSummary } from './modules/editorial-pipeline/repository'
import type {
  ProviderActivationInput,
  ProviderCenterSnapshot,
  ProviderConfigureInput,
  ProviderDeleteInput,
  ProviderTestInput,
} from './shared/provider-center-contracts'
import type { RealProfileSettings } from './shared/real-profile-settings'
import type { RealConnectivityPreflight } from './modules/real-pipeline/real-connectivity-preflight'
import type {
  RealConnectivityAuthorization,
  RealConnectivityResult,
} from './shared/real-connectivity-contracts'

declare global {
  interface Window {
    electronAPI: {
      // App info
      getVersion: () => Promise<string>
      getPlatform: () => Promise<string>
      
      getContributionPersistenceStatus: () => Promise<{ connected: boolean; target: 'Supabase local'; url?: string; error?: string }>
      importPendingContributions: () => Promise<ContributionSyncSummary>
      listContributionImportJobs: () => Promise<ContributionImportJob[]>
      retryContributionImportJob: (jobId: string) => Promise<ContributionSyncSummary>

      // Pipeline Manual canónico
      getManualPersistenceStatus: () => Promise<ManualPersistenceStatus>
      getManualActor: () => Promise<string>
      resolveManualDestination: (input: ManualDestinationQuery) => Promise<ManualDestinationResolution>
      correctManualDestination: (input: ManualDestinationCorrection) => Promise<ManualDestinationResolution>
      startManualResearch: (input: ManualResearchStart) => Promise<ManualResearchExecutionOutcome>
      resumeManualResearch: (input: ManualExecutionAction) => Promise<ResearchDestinationResult>
      retryManualResearch: (input: ManualExecutionAction) => Promise<ManualResearchExecutionOutcome>
      cancelManualResearch: (input: ManualExecutionAction) => Promise<void>
      listManualResearch: (query?: LibraryPageQueryInput) => Promise<LibraryPage>
      getManualResearch: (requestId: string) => Promise<ResearchDestinationResult | null>
      listManualDraftVersions: (requestId: string) => Promise<EditorialDraftVersionSummary[]>
      editManualSection: (input: ManualSectionEdit) => Promise<ResearchDestinationResult>
      regenerateManualSection: (input: ManualSectionRegeneration) => Promise<ResearchDestinationResult>
      submitManualDraftReview: (input: ManualDraftReview) => Promise<ResearchDestinationResult>
      decideManualDraft: (input: ManualDraftDecision) => Promise<ResearchDestinationResult>
      reopenManualDraftReview: (input: ManualDraftReopen) => Promise<ResearchDestinationResult>

      // Centro de proveedores; las respuestas son siempre públicas y no incluyen credenciales.
      listProviders: () => Promise<ProviderCenterSnapshot>
      configureProvider: (input: ProviderConfigureInput) => Promise<ProviderCenterSnapshot>
      setProviderActive: (input: ProviderActivationInput) => Promise<ProviderCenterSnapshot>
      removeProviderCredential: (input: ProviderDeleteInput) => Promise<ProviderCenterSnapshot>
      testProviderSimulated: (input: ProviderTestInput) => Promise<ProviderCenterSnapshot>
      getRealConnectivityPreflight: () => Promise<RealConnectivityPreflight>
      runRealConnectivityCheck: (input: RealConnectivityAuthorization) => Promise<RealConnectivityResult>
      getRealProfileSettings: () => Promise<RealProfileSettings>
      saveRealProfileSettings: (input: RealProfileSettings) => Promise<RealProfileSettings>
    }
  }
}

export {}
