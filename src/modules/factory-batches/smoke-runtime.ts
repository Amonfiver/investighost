import type { SupabaseClient } from '@supabase/supabase-js'
import type { ProviderCenterService } from '@modules/real-pipeline/provider-center'
import type {
  IntelligenceDraft,
  IntelligenceEngine,
  IntelligenceReview,
  IntelligenceRoundAnalysis,
  ResearchTool,
  ResearchToolResult,
} from '@modules/real-pipeline'
import type { RealResearchMission, RealResearchSource } from '@shared/real-pipeline-contracts'
import type { ZodTypeAny } from 'zod'
import { REAL_BATCH_EXECUTION_TOKEN_ENV } from './batch-provider-authorization'
import type { BatchEditorialPhaseContext, BatchEditorialPhasePort } from './editorial-phase-port'
import { ProductionBatchEditorialPhasePort } from './real-batch-phase-port'

/** Explicitly opt-in development harness. It is not a production capability. */
export const FACTORY_SMOKE_MODE_ENV = 'INVESTIGHOST_FACTORY_SMOKE_MODE'
const smokeCapability = 'factory_smoke_deterministic_capability_085cr2'

export function isFactorySmokeMode(
  environment: NodeJS.ProcessEnv = process.env,
  isDevelopment = false,
): boolean {
  return isDevelopment && environment[FACTORY_SMOKE_MODE_ENV] === 'true'
}

export function canUseFactorySmokeRuntime(
  batch: { smokeFixture?: boolean },
  environment: NodeJS.ProcessEnv = process.env,
  isDevelopment = false,
): boolean {
  return isFactorySmokeMode(environment, isDevelopment) && batch.smokeFixture === true
}

export function createFactoryBatchPhasePort(input: {
  client: SupabaseClient
  providerCenter: () => Promise<ProviderCenterService>
  environment?: NodeJS.ProcessEnv
  isDevelopment: boolean
}): BatchEditorialPhasePort {
  const environment = input.environment ?? process.env
  const production = new ProductionBatchEditorialPhasePort({
    client: input.client,
    providerCenter: input.providerCenter,
    environment,
  })
  if (!isFactorySmokeMode(environment, input.isDevelopment)) return production

  // ProductionBatchEditorialPhasePort still owns the worker-facing composition.
  // The only replacement is the external boundary, and only for a DB-marked
  // fixture in an unpackaged local Electron process.
  const smoke = new ProductionBatchEditorialPhasePort({
    client: input.client,
    providerCenter: smokeProviderCenter,
    environment: {
      ...environment,
      NODE_ENV: 'test',
      [REAL_BATCH_EXECUTION_TOKEN_ENV]: smokeCapability,
    },
    testProviderSelection: {
      researchTool: new SmokeResearchTool(),
      intelligenceEngine: new SmokeIntelligenceEngine(),
    },
    testWikimediaFetch: smokeWikimediaFetch(),
    testImageFetch: smokeImageFetch(),
  })
  return {
    run(context: BatchEditorialPhaseContext) {
      return canUseFactorySmokeRuntime(context.batch, environment, input.isDevelopment)
        ? smoke.run(context)
        : production.run(context)
    },
  }
}

class SmokeResearchTool implements ResearchTool {
  readonly id = 'tavily'
  readonly model = 'search-and-extract'
  readonly simulation = true

  async research(mission: RealResearchMission): Promise<ResearchToolResult> {
    const source: RealResearchSource = {
      id: `factory-smoke-source-${mission.round}`,
      round: mission.round,
      url: `https://fixture.invalid/factory-smoke/${mission.round}`,
      normalizedUrl: `https://fixture.invalid/factory-smoke/${mission.round}`,
      title: 'Fuente determinista de smoke local',
      capturedAt: '2026-09-23T00:00:00.000Z',
      contentHash: 'a'.repeat(64),
      score: 0.95,
      content: 'Granada conserva patrimonio histórico, paisaje urbano y una vida cultural documentable.',
    }
    return { round: mission.round, sources: [source], providerRequestIds: [`smoke-research-${mission.round}`], failures: [], usageUnits: 0, credits: 0 }
  }
}

class SmokeIntelligenceEngine implements IntelligenceEngine {
  readonly id = 'openai'
  readonly model = 'gpt-5.6-luna'
  readonly simulation = true
  readonly routedByStage = true

  async analyze(mission: RealResearchMission): Promise<IntelligenceRoundAnalysis> {
    return {
      masterKnowledge: {
        requestId: mission.requestId, destinationId: mission.destination.canonicalId, revision: mission.round,
        claims: [{ id: 'factory-smoke-claim', topic: 'patrimonio', statement: 'Granada reúne patrimonio histórico y vida cultural.', evidenceIds: [], confidence: 0.9, suitableProfiles: ['student', 'adventure'] }],
        contradictions: [], generatedAt: '2026-09-23T00:00:00.000Z',
      },
      coverage: { score: 0.95, sufficient: true, topics: [{ topic: 'contexto', required: true, coverage: 1, evidenceIds: [] }] },
      proposedQueries: [], gaps: [], decision: { action: 'stop_ready', reason: 'Cobertura suficiente en smoke local.', queries: [] },
      usage: { providerId: 'openai', model: 'gpt-5.6-luna', inputTokens: 0, outputTokens: 0, estimatedCost: 0, currency: 'EUR' },
    }
  }

  async draft(mission: RealResearchMission): Promise<IntelligenceDraft[]> {
    const profile = mission.profiles[0]?.profile
    if (!profile) throw new Error('FACTORY_SMOKE_PROFILE_REQUIRED')
    return [{
      profile,
      title: profile === 'student' ? 'Granada' : 'Granada para explorar',
      content: profile === 'student'
        ? 'Granada es una ciudad andaluza con patrimonio histórico y una vida cultural documentada.'
        : 'Granada combina patrimonio, miradores y barrios históricos para una experiencia viajera consciente.',
      approximateWordCount: 16, promptVersion: 'factory-smoke-v1', schemaVersion: 'factory-smoke-v1',
      usage: { providerId: 'openai', model: 'gpt-5.6-luna', inputTokens: 0, outputTokens: 0, estimatedCost: 0, currency: 'EUR' },
    }]
  }

  async generateStructured<T>(operation: string, _payload: Record<string, unknown>, schema: ZodTypeAny): Promise<{ output: T; usage: IntelligenceRoundAnalysis['usage'] }> {
    const source = [{ kind: 'source' as const, referenceId: 'factory-smoke-source-1' }]
    const ids = {
      figure: '085f0000-0000-4000-8000-000000000001', hero: '085f0000-0000-4000-8000-000000000002',
      story: '085f0000-0000-4000-8000-000000000003', place: '085f0000-0000-4000-8000-000000000004',
      storyItem: '085f0000-0000-4000-8000-000000000005', placeItem: '085f0000-0000-4000-8000-000000000006', linked: '085f0000-0000-4000-8000-000000000007',
    }
    const visual = (id: string, purpose: 'STUDENT_FIGURE' | 'ADVENTURE_HERO' | 'VISUAL_STORY' | 'PLACE_ASSET', linkedContent: 'STUDENT_BLOCK' | 'HERO' | 'VISUAL_STORY_ITEM' | 'PLACE', subject: string) => ({
      id, purpose, subject, keywords: subject.split(' ').slice(0, 3), context: 'Entidad presente en el corpus determinista.', desiredRole: purpose === 'ADVENTURE_HERO' ? 'HERO' as const : purpose === 'STUDENT_FIGURE' ? 'FIGURE' as const : purpose === 'PLACE_ASSET' ? 'PLACE' as const : 'HIGHLIGHT' as const,
      desiredPlacement: purpose === 'STUDENT_FIGURE' ? 'WIDE' as const : 'OVERLAY' as const, linkedContent: { type: linkedContent, id: linkedContent === 'VISUAL_STORY_ITEM' ? ids.storyItem : linkedContent === 'PLACE' ? ids.placeItem : ids.linked }, evidenceRefs: source,
    })
    const output = operation === 'generate_student_document_v1'
      ? { document: { version: 'student-document-v1' as const, headline: 'Granada, patrimonio y vida cultural', lead: ['Una síntesis basada en el corpus común.'], blocks: [
        { type: 'heading' as const, level: 2 as const, text: 'Contexto' }, { type: 'paragraph' as const, text: 'Granada conserva patrimonio histórico, paisaje urbano y una vida cultural documentable.' },
        { type: 'list' as const, style: 'unordered' as const, items: ['Patrimonio histórico', 'Paisaje urbano'] }, { type: 'key_facts' as const, items: [{ label: 'Enfoque', value: 'Patrimonio y cultura' }] },
        { type: 'timeline' as const, items: [{ label: 'Actualidad', text: 'El corpus describe patrimonio y vida cultural.' }] },
        { type: 'figure' as const, resolution: 'INTENT' as const, visualIntentId: ids.figure, placement: 'WIDE' as const, altHint: 'Patrimonio urbano de Granada' },
        { type: 'references' as const, items: [{ title: 'Fuente determinista de smoke local', url: 'https://fixture.invalid/factory-smoke/1' }] },
      ] }, visualIntents: [visual(ids.figure, 'STUDENT_FIGURE', 'STUDENT_BLOCK', 'Patrimonio urbano de Granada')] }
      : { document: { version: 'adventure-package-v1' as const, copy: { headline: 'Granada para mirar despacio', hook: 'Patrimonio, miradores y vida cultural en una entrada visual.', highlights: ['Patrimonio histórico', 'Paisaje urbano'], sections: [], practicalTips: [], cta: 'Explora con contexto.', evidenceRefs: source },
        hero: { asset: { status: 'INTENT' as const, visualIntentId: ids.hero }, title: 'Granada desde sus miradores', shortCopy: 'Una llegada entre paisaje y patrimonio.', presentationTone: 'LANDSCAPE' as const, textPlacement: 'OVERLAY' as const, evidenceRefs: source },
        visualStory: { items: [{ id: ids.storyItem, asset: { status: 'INTENT' as const, visualIntentId: ids.story }, order: 0, title: 'Patrimonio urbano', presentationTone: 'CULTURE' as const, textPlacement: 'CARD_OVERLAY' as const, evidenceRefs: source }] },
        placesToGo: { items: [{ id: ids.placeItem, category: 'EAT' as const, name: 'Mesa documentada', order: 0, shortDescription: 'Lugar presente en la evidencia de fixture.', reasonToGo: 'El corpus común lo respalda.', evidenceRefs: source, asset: { status: 'INTENT' as const, visualIntentId: ids.place } }], supplementalGaps: [{ type: 'MISSING_STAY_EVIDENCE' as const, description: 'El fixture no contiene evidencia de alojamiento.', evidenceRefs: source }, { type: 'MISSING_DRINK_EVIDENCE' as const, description: 'El fixture no contiene evidencia de bebidas.', evidenceRefs: source }, { type: 'MISSING_NIGHTLIFE_EVIDENCE' as const, description: 'El fixture no contiene evidencia nocturna.', evidenceRefs: source }] },
      }, visualIntents: [visual(ids.hero, 'ADVENTURE_HERO', 'HERO', 'Miradores de Granada'), visual(ids.story, 'VISUAL_STORY', 'VISUAL_STORY_ITEM', 'Patrimonio urbano de Granada'), visual(ids.place, 'PLACE_ASSET', 'PLACE', 'Mesa documentada')] }
    return { output: schema.parse(output) as T, usage: { providerId: 'fixture', model: 'structured-smoke', inputTokens: 0, outputTokens: 0, estimatedCost: 0, currency: 'EUR' } }
  }

  async review(): Promise<IntelligenceReview> {
    return { outcome: 'passed', issues: [], promptVersion: 'factory-smoke-v1', schemaVersion: 'factory-smoke-v1', usage: { providerId: 'openai', model: 'gpt-5.6-luna', inputTokens: 0, outputTokens: 0, estimatedCost: 0, currency: 'EUR' } }
  }
}

const smokeProviderCenter = async () => ({
  snapshot: () => ({
    secureStorageAvailable: true, simulationOnly: true, realClientsAvailable: true, externalCallsAllowed: false,
    pricingCatalogVersion: '2026-09-23.1',
    providers: [
      smokeProvider('tavily', 'research_tool', 'search-and-extract'),
      smokeProvider('openai', 'intelligence_engine', 'gpt-5.6-luna'),
    ],
  }),
}) as unknown as ProviderCenterService

function smokeProvider(id: 'tavily' | 'openai', category: 'research_tool' | 'intelligence_engine', model: string) {
  return { id, displayName: id, category, configured: true, credentialMask: '••••••••' as const, active: true, selectedModel: model, availableModels: [model], tariffStatus: 'current' as const, tariffSummary: 'Smoke local sin red', connectionState: 'simulated_ok' as const }
}

function smokeWikimediaFetch() {
  let index = 0
  return async () => ({ ok: true, status: 200, json: async () => ({ query: { pages: [{
    pageid: 95_000 + ++index, title: `File:Factory smoke ${index}.jpg`, imageinfo: [{
      canonicaltitle: `File:Factory smoke ${index}.jpg`, url: `https://fixture.invalid/factory-smoke-${index}.jpg`, mime: 'image/jpeg', width: 2000, height: 1200, size: 40,
      extmetadata: { Artist: { value: 'Autor de smoke' }, LicenseShortName: { value: 'CC BY 4.0' }, LicenseUrl: { value: 'https://creativecommons.org/licenses/by/4.0/' }, ImageDescription: { value: 'Vista de smoke local.' }, UsageTerms: { value: 'CC BY 4.0' } },
    }],
  }] } }) }) as never
}

function smokeImageFetch() {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x04, 0xb0, 0x07, 0xd0, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00, 0xff, 0xd9])
  return async () => ({ ok: true, status: 200, redirected: false, headers: new Headers({ 'content-type': 'image/jpeg', 'content-length': String(jpeg.byteLength) }), arrayBuffer: async () => jpeg.buffer.slice(0) }) as never
}
