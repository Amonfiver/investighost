import { createHash } from 'node:crypto'
import type { ProviderCallReservationInput } from '@shared/real-cost-contracts'
import {
  RealResearchMissionSchema,
  type RealResearchMission,
} from '@shared/real-pipeline-contracts'
import {
  defaultRealProfileSettings,
  missionProfilesFromSettings,
} from '@shared/real-profile-settings'
import { pricingEntryAt } from '@shared/provider-pricing-catalog'
import type { IntelligenceEngine } from './ports'
import type { LedgeredCallMetadataFactory } from './ledgered-call-executor'
import { createProviderCallPayloadFingerprint } from './provider-call-fingerprint'
import type { IntelligenceRoutingStage, ResolvedIntelligenceRoute } from './llm-routing'

/**
 * The pilot originally embedded destination, policy and ledger ownership in a
 * single record.  These value objects are intentionally independent from that
 * record: a pilot and a destination-batch job can describe the same real
 * editorial execution without a destination enum or a second provider path.
 */
export type RealEditorialExecutionOwnerType = 'PILOT' | 'BATCH_JOB'

export interface GenericEditorialDestination {
  destinationId: string
  name: string
  countryCode: string
  region?: string
  destinationType: RealResearchMission['destination']['type']
}

export interface GenericRealEditorialPolicy {
  language: 'es'
  depth: 'deep'
  objectives: readonly string[]
  limits: RealResearchMission['limits']
  promptVersion: string
}

export interface GenericRealEditorialExecutionContext {
  owner: { type: RealEditorialExecutionOwnerType; id: string }
  executionId: string
  runId: string
  taskId: string
  batchId: string
  destination: GenericEditorialDestination
  policy: GenericRealEditorialPolicy
  budgetDate?: string
  /** Present only for a durable batch redo. Its operation id namespaces new
   * candidate artifacts while retaining the same research/analysis execution. */
  redo?: { operationId: string; scope: 'STUDENT' | 'ADVENTURE' | 'VISUALS' | 'EDITORIAL' }
  profileArtifactKeys?: { student?: string; adventure?: string }
}

export type GenericEditorialExecutionPhase =
  | 'RESEARCH'
  | 'ANALYSIS'
  | 'STUDENT'
  | 'ADVENTURE'
  | 'AUTO_REVIEW'

export interface GenericEditorialPhaseResult {
  artifactRef: string
  artifactKey?: string
  actualCost?: number
  warnings?: string[]
}

export type GenericEditorialPhaseServices = {
  [Phase in GenericEditorialExecutionPhase]: (
    context: GenericRealEditorialExecutionContext,
    signal: AbortSignal,
  ) => Promise<GenericEditorialPhaseResult>
}

/**
 * Phase-addressable application boundary.  It owns no provider, storage or
 * Library implementation; those remain the existing real services supplied by
 * the composition root.  A missing real service is an explicit configuration
 * error, never a fixture fallback.
 */
export class GenericRealEditorialExecution {
  constructor(private readonly services: GenericEditorialPhaseServices) {}

  executeResearch(context: GenericRealEditorialExecutionContext, signal: AbortSignal) {
    return this.services.RESEARCH(context, signal)
  }

  executeAnalysis(context: GenericRealEditorialExecutionContext, signal: AbortSignal) {
    return this.services.ANALYSIS(context, signal)
  }

  executeStudent(context: GenericRealEditorialExecutionContext, signal: AbortSignal) {
    return this.services.STUDENT(context, signal)
  }

  executeAdventure(context: GenericRealEditorialExecutionContext, signal: AbortSignal) {
    return this.services.ADVENTURE(context, signal)
  }

  executeReview(context: GenericRealEditorialExecutionContext, signal: AbortSignal) {
    return this.services.AUTO_REVIEW(context, signal)
  }
}

export function createGenericRealEditorialMission(
  context: GenericRealEditorialExecutionContext,
  createdAt: Date,
): RealResearchMission {
  return RealResearchMissionSchema.parse({
    requestId: context.owner.id,
    runId: context.runId,
    taskId: context.taskId,
    destination: {
      canonicalId: context.destination.destinationId,
      name: context.destination.name,
      countryCode: context.destination.countryCode,
      type: context.destination.destinationType,
    },
    language: context.policy.language,
    profiles: missionProfilesFromSettings(defaultRealProfileSettings(createdAt)),
    depth: context.policy.depth,
    round: 1,
    objectives: [...context.policy.objectives],
    focusedQueries: [],
    limits: context.policy.limits,
    createdAt: createdAt.toISOString(),
  })
}

/** Shared, owner-neutral ledger metadata factory used by pilot adapters now
 * and by the batch persistence adapter once its durable owner is provisioned. */
export function createGenericLedgerMetadataFactory(
  context: GenericRealEditorialExecutionContext,
  intelligenceEngine: IntelligenceEngine,
): LedgeredCallMetadataFactory {
  return {
    create(operationId, attempt, estimatedCost, retryOfCallId, inheritedReservation) {
      const costAdjustment = operationId.endsWith(':cost-adjustment')
      const baseOperationId = costAdjustment
        ? operationId.slice(0, -':cost-adjustment'.length)
        : operationId
      const research = baseOperationId.endsWith(':research')
      const inherited = costAdjustment ? inheritedReservation?.input : undefined
      const route = research ? undefined : intelligenceRouteForOperation(intelligenceEngine, baseOperationId)
      const providerId = inherited?.providerId ?? (research ? 'tavily' : route!.providerId)
      const model = inherited?.model ?? (research ? 'search-and-extract' : route!.model)
      const tariffId = inherited?.tariffId ?? (research
        ? 'morella-v1-tavily-search'
        : pricingEntryAt(providerId, model, new Date())?.id ?? 'configured-responses-tariff')
      const operation = costAdjustment ? 'cost-adjustment' : baseOperationId.split(':').at(-1) ?? 'unknown'
      const stage = `${baseOperationId.split(':').slice(-2).join('_')}${
        costAdjustment ? '_cost-adjustment' : ''
      }`
      const payloadHash = createHash('sha256').update(JSON.stringify({
        operationId,
        owner: context.owner,
        runId: context.runId,
        promptVersion: context.policy.promptVersion,
      })).digest('hex')
      const input: ProviderCallReservationInput = {
        idempotencyKey: `${operationId}:attempt:${attempt}`,
        executionId: context.executionId,
        requestId: context.owner.id,
        runId: context.runId,
        taskId: context.taskId,
        batchId: context.batchId,
        stage,
        operation,
        providerId,
        model,
        attempt,
        retryOfCallId,
        estimatedCost,
        currency: inherited?.currency ?? 'EUR',
        tariffId,
        promptVersion: inherited?.promptVersion ?? context.policy.promptVersion,
        schemaVersion: inherited?.schemaVersion ?? 'real-editorial-snapshot-v1',
        inputHash: createProviderCallPayloadFingerprint({
          executionId: context.executionId,
          requestId: context.owner.id,
          runId: context.runId,
          taskId: context.taskId,
          batchId: context.batchId,
          budgetDate: context.budgetDate,
          stage,
          operation,
          providerId,
          model,
          attempt,
          retryOfCallId,
          estimatedCost,
          reservedCost: estimatedCost,
          currency: inherited?.currency ?? 'EUR',
          tariffId,
          promptVersion: inherited?.promptVersion ?? context.policy.promptVersion,
          schemaVersion: inherited?.schemaVersion ?? 'real-editorial-snapshot-v1',
          payloadHash,
          maxInputTokens: 200_000,
          maxOutputTokens: 50_000,
          maxToolCalls: research ? 5 : 2,
          maxCredits: research ? 4 : 0,
          tools: research ? ['search', 'extract'] : ['structured-output'],
        }),
      }
      return input
    },
  }
}

function intelligenceRouteForOperation(
  engine: IntelligenceEngine,
  operationId: string,
): ResolvedIntelligenceRoute {
  const stage: IntelligenceRoutingStage = operationId.endsWith(':draft_adventure')
    ? 'draft_adventure'
    : operationId.endsWith(':draft_student')
      ? 'draft_student'
      : operationId.endsWith(':final-review')
        ? 'review'
        : 'analysis'
  if ('routeFor' in engine && typeof engine.routeFor === 'function') {
    return engine.routeFor(stage) as ResolvedIntelligenceRoute
  }
  return {
    providerId: engine.id === 'deepseek' || engine.model === 'deepseek-flash' ? 'deepseek' : 'openai',
    model: engine.model,
    apiModel: engine.model,
  }
}
