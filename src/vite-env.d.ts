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

import type { ResearchRequest, ResearchResult, EditorialDraft, WebResearchBundle } from './shared/types'
import type { ContributionImportJob, ContributionSyncSummary } from './shared/contracts'

declare global {
  interface Window {
    electronAPI: {
      // App info
      getVersion: () => Promise<string>
      getPlatform: () => Promise<string>
      
      // AI Providers
      getProviderStatus: () => Promise<{
        kimi: { configured: boolean; hasKey: boolean }
        openai: { configured: boolean; hasKey: boolean }
        debug: boolean
      }>
      
      // Research operations
      createResearch: (input: unknown) => Promise<ResearchRequest>
      startResearch: (requestId: string) => Promise<{ started: boolean; requestId: string }>
      getAllResearch: () => Promise<ResearchRequest[]>
      getResearchResult: (requestId: string) => Promise<ResearchResult | null>
      getDraft: (resultId: string) => Promise<EditorialDraft | null>
      
      // Search operations
      collectWebResearch: (input: unknown) => Promise<WebResearchBundle>
      getContributionPersistenceStatus: () => Promise<{ connected: boolean; target: 'Supabase local'; url?: string; error?: string }>
      importPendingContributions: () => Promise<ContributionSyncSummary>
      listContributionImportJobs: () => Promise<ContributionImportJob[]>
      retryContributionImportJob: (jobId: string) => Promise<ContributionSyncSummary>
    }
  }
}

export {}
