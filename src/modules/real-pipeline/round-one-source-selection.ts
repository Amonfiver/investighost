import { createHash } from 'node:crypto'
import {
  REAL_EDITORIAL_ROUND_ONE_SOURCE_SELECTION_STRATEGY,
  RealEditorialRoundOneSourceSelectionPlanSchema,
  type RealEditorialRoundOneSourceSelectionPlan,
} from '@shared/real-editorial-pilot-contracts'
import type { RealWorkflowCheckpoint } from './real-workflow'

const UNDERCOVERED_TOPIC_THRESHOLD = 0.75
const topicStopWords = new Set(['de', 'del', 'el', 'la', 'las', 'los', 'y'])

export interface RoundOneSourceSelectionPlanInput {
  pilotId: string
  runId: string
  incidentId: string
  checkpointVersion: number
  checkpointHash: string
  checkpoint: RealWorkflowCheckpoint
}

export function planRoundOneActiveSources(
  input: RoundOneSourceSelectionPlanInput,
): RealEditorialRoundOneSourceSelectionPlan {
  const checkpoint = input.checkpoint
  const sources = checkpoint.dossier?.sources ?? []
  const maximumSources = checkpoint.initialMission.limits.maxSources
  const roundTwoQueryCount = checkpoint.nextRoundQueries.length
  if (
    checkpoint.version !== 'real-workflow-v1'
    || checkpoint.state !== 'researching_round_2'
    || checkpoint.completedRound !== 1
    || !checkpoint.dossier
    || checkpoint.dossier.rounds.length !== 1
    || checkpoint.dossier.rounds[0] !== 1
    || sources.length !== maximumSources
    || sources.some(source => source.round !== 1)
    || roundTwoQueryCount === 0
    || roundTwoQueryCount > maximumSources
  ) {
    throw new Error('ROUND_ONE_SOURCE_SELECTION_CHECKPOINT_INVALID')
  }

  const requiredRoundTwoSlots = roundTwoQueryCount
  const retainedCount = maximumSources - requiredRoundTwoSlots
  if (retainedCount <= 0) throw new Error('ROUND_ONE_SOURCE_SELECTION_CAPACITY_INVALID')

  const ranked = sources.map((source, index) => {
    const claimIds = (checkpoint.masterKnowledge?.claims ?? [])
      .filter(claim => claim.evidenceIds.includes(source.id))
      .map(claim => claim.id)
      .sort()
    const evidenceTopics = (checkpoint.coverage?.topics ?? [])
      .filter(topic => topic.evidenceIds.includes(source.id))
    const coverageTopics = evidenceTopics.map(topic => topic.topic).sort()
    const undercoveredCoverageTopics = evidenceTopics
      .filter(topic => topic.coverage < UNDERCOVERED_TOPIC_THRESHOLD)
      .map(topic => topic.topic)
      .sort()
    const coveredGapIds = checkpoint.unresolvedGaps
      .filter(gap => evidenceTopics.some(topic => topicsOverlap(gap.topic, topic.topic)))
      .map(gap => gap.id)
      .sort()
    return {
      sourceId: source.id,
      title: source.title,
      normalizedUrl: source.normalizedUrl,
      contentHash: source.contentHash,
      score: source.score,
      originalOrdinal: index + 1,
      coveredGapIds,
      coverageTopics,
      undercoveredCoverageTopics,
      claimIds,
    }
  }).sort((left, right) =>
    right.undercoveredCoverageTopics.length - left.undercoveredCoverageTopics.length
    || right.claimIds.length - left.claimIds.length
    || right.coverageTopics.length - left.coverageTopics.length
    || right.score - left.score
    || left.sourceId.localeCompare(right.sourceId))

  const selectionSources = ranked.map((source, index) => {
    const decision = index < retainedCount ? 'keep_active' as const : 'deselect_active' as const
    return {
      ...source,
      rank: index + 1,
      decision,
      reason: decision === 'keep_active'
        ? 'current_gap_evidence_priority' as const
        : 'lower_incremental_gap_coverage' as const,
    }
  })
  const retainedIds = new Set(selectionSources
    .filter(source => source.decision === 'keep_active')
    .map(source => source.sourceId))
  const unsupportedClaims = (checkpoint.masterKnowledge?.claims ?? [])
    .filter(claim => !claim.evidenceIds.some(sourceId => retainedIds.has(sourceId)))
  const unsupportedCoverageTopics = (checkpoint.coverage?.topics ?? [])
    .filter(topic => !topic.evidenceIds.some(sourceId => retainedIds.has(sourceId)))
  if (unsupportedClaims.length > 0 || unsupportedCoverageTopics.length > 0) {
    throw new Error('ROUND_ONE_SOURCE_SELECTION_WOULD_ORPHAN_EVIDENCE')
  }
  const proposal = {
    strategyVersion: REAL_EDITORIAL_ROUND_ONE_SOURCE_SELECTION_STRATEGY,
    pilotId: input.pilotId,
    runId: input.runId,
    incidentId: input.incidentId,
    previousCheckpointVersion: input.checkpointVersion,
    previousCheckpointHash: input.checkpointHash,
    requiredRoundTwoSlots,
    maximumSources,
    sources: selectionSources,
  }
  return RealEditorialRoundOneSourceSelectionPlanSchema.parse({
    status: 'required',
    ...proposal,
    proposalHash: sha256(JSON.stringify(proposal)),
    selectedCheckpointVersion: input.checkpointVersion + 1,
    workflowVersion: checkpoint.version,
    roundTwoQueryCount,
    originalActiveCount: sources.length,
    retainedCount,
    deselectedCount: sources.length - retainedCount,
    activeCountAfterSelection: retainedCount,
    availableSlotsAfterSelection: maximumSources - retainedCount,
    providerCallsPerformed: 0,
    budgetChanged: false,
    historicalSourcesMutated: false,
  })
}

export function checkpointWithSelectedRoundOneSources(
  checkpoint: RealWorkflowCheckpoint,
  plan: RealEditorialRoundOneSourceSelectionPlan,
  updatedAt: string,
): RealWorkflowCheckpoint {
  if (
    plan.status !== 'required'
    || checkpoint.version !== plan.workflowVersion
    || checkpoint.state !== 'researching_round_2'
    || checkpoint.completedRound !== 1
    || !checkpoint.dossier
  ) throw new Error('ROUND_ONE_SOURCE_SELECTION_PLAN_INVALID')
  const retainedIds = new Set(plan.sources
    .filter(source => source.decision === 'keep_active')
    .map(source => source.sourceId))
  const retainedSources = checkpoint.dossier.sources.filter(source => retainedIds.has(source.id))
  if (retainedSources.length !== plan.retainedCount) {
    throw new Error('ROUND_ONE_SOURCE_SELECTION_SOURCES_CHANGED')
  }
  return {
    ...structuredClone(checkpoint),
    dossier: {
      ...structuredClone(checkpoint.dossier),
      sources: retainedSources,
    },
    updatedAt,
  }
}

function topicsOverlap(left: string, right: string): boolean {
  const rightTokens = new Set(topicTokens(right))
  return topicTokens(left).some(token => rightTokens.has(token))
}

function topicTokens(value: string): string[] {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .split(/[^a-z0-9]+/)
    .filter(token => token.length > 1 && !topicStopWords.has(token))
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
