import {
  RealEditorialSufficiencyDecisionSchema,
  type RealEditorialProfile,
  type RealEditorialSufficiencyDecision,
  type RealEditorialSufficiencyStatus,
  type RealFocusedQuery,
  type RealKnowledgeGap,
  type RealMasterKnowledge,
  type RealResearchDossier,
  type RealResearchMission,
} from '@shared/real-pipeline-contracts'

export interface EditorialSufficiencyInput {
  mission: RealResearchMission
  dossier: RealResearchDossier
  knowledge: RealMasterKnowledge
  coverageScore: number
  gaps: RealKnowledgeGap[]
  proposedQueries: RealFocusedQuery[]
  spentCostEur: number
  expectedMarginalCostEur: number
  remainingBudgetEur: number
}

export function assessEditorialSufficiency(
  input: EditorialSufficiencyInput,
): RealEditorialSufficiencyDecision {
  const enabledProfiles = input.mission.profiles
    .filter(item => item.enabled)
    .map(item => item.profile)
  const contradictions = input.knowledge.contradictions.map(contradiction =>
    assessContradiction(contradiction, enabledProfiles))
  const profiles = enabledProfiles.map(profile => assessProfile(profile, input, contradictions))
  const status = overallStatus(profiles.map(profile => profile.status))
  const targetedSearch = status === 'targeted_gap_only'
    ? targetedSearchFor(input, profiles)
    : undefined

  return RealEditorialSufficiencyDecisionSchema.parse({
    status,
    reason: decisionReason(status, profiles, targetedSearch),
    coverageScore: input.coverageScore,
    spentCostEur: money(input.spentCostEur),
    expectedMarginalCostEur: money(input.expectedMarginalCostEur),
    sourceAssessment: sourceAssessment(input.dossier),
    profiles,
    contradictions,
    targetedSearch,
  })
}

function assessProfile(
  profile: RealEditorialProfile,
  input: EditorialSufficiencyInput,
  contradictions: RealEditorialSufficiencyDecision['contradictions'],
) {
  const gaps = input.gaps.filter(gap => gap.requiredForProfiles.includes(profile))
  const unsafeGaps = gaps.filter(gap => isUnsafe(gap) && !canTarget(gap, input))
  const blockingContradictions = contradictions.filter(item =>
    item.impact === 'critical_unsafe' && item.affectedProfiles.includes(profile))
  if (unsafeGaps.length > 0 || blockingContradictions.length > 0) {
    return {
      profile,
      status: 'unsafe_to_write' as const,
      affectedGapIds: unsafeGaps.map(gap => gap.id),
      blockedSections: unique([
        ...unsafeGaps.map(sectionFor),
        ...blockingContradictions.map(() => 'safety_or_access'),
      ]),
      reason: 'Hay evidencia insegura o contradictoria para una afirmación que no puede redactarse como hecho.',
    }
  }

  const materialGaps = gaps.filter(gap => isMaterial(gap) && !canSafelyAvoid(gap))
  const targetedGaps = materialGaps.filter(gap => canTarget(gap, input))
  if (targetedGaps.length > 0) {
    return {
      profile,
      status: 'targeted_gap_only' as const,
      affectedGapIds: targetedGaps.map(gap => gap.id),
      blockedSections: [],
      reason: 'Una única ampliación focalizada tiene valor editorial material y coste acotado.',
    }
  }
  if (materialGaps.length > 0) {
    return {
      profile,
      status: 'insufficient' as const,
      affectedGapIds: materialGaps.map(gap => gap.id),
      blockedSections: materialGaps.map(sectionFor),
      reason: 'Falta evidencia material que no puede omitirse ni contextualizarse de forma responsable.',
    }
  }
  return {
    profile,
    status: 'enough_to_write' as const,
    affectedGapIds: gaps.map(gap => gap.id),
    blockedSections: [],
    reason: gaps.length === 0
      ? 'La evidencia disponible cubre el perfil sin gaps pendientes.'
      : 'Los gaps restantes son omitibles, contextualizables o declarables como no verificados.',
  }
}

function isUnsafe(gap: RealKnowledgeGap): boolean {
  const context = contextFor(gap)
  return ['high', 'critical'].includes(context.inventionRisk)
    && ['high', 'critical'].includes(context.centrality)
    && !canSafelyAvoid(gap)
}

function isMaterial(gap: RealKnowledgeGap): boolean {
  return ['high', 'critical'].includes(contextFor(gap).centrality)
}

function canSafelyAvoid(gap: RealKnowledgeGap): boolean {
  const context = contextFor(gap)
  return context.omittable || context.contextualizable || context.canBeDeclaredUnverified
}

function canTarget(gap: RealKnowledgeGap, input: EditorialSufficiencyInput): boolean {
  if (!gap.resolvableWithResearch) return false
  const query = input.proposedQueries.find(item => item.gapId === gap.id)
  if (!query) return false
  const context = contextFor(gap)
  const usefulProbability = context.estimatedUsefulEvidenceProbability
  const materialProbability = context.estimatedMaterialChangeProbability
  return usefulProbability >= 0.5 && materialProbability >= 0.5
}

function targetedSearchFor(
  input: EditorialSufficiencyInput,
  profiles: RealEditorialSufficiencyDecision['profiles'],
) {
  const target = profiles
    .filter(profile => profile.status === 'targeted_gap_only')
    .flatMap(profile => profile.affectedGapIds)
    .map(gapId => ({
      gap: input.gaps.find(gap => gap.id === gapId),
      query: input.proposedQueries.find(query => query.gapId === gapId),
    }))
    .find((candidate): candidate is { gap: RealKnowledgeGap, query: RealFocusedQuery } => Boolean(candidate.gap && candidate.query))
  if (!target) return undefined
  return {
    gapId: target.gap.id,
    affectedProfiles: target.gap.requiredForProfiles,
    affectedSection: sectionFor(target.gap),
    rationale: target.query.rationale,
    expectedEvidence: target.query.expectedEvidence
      ?? `Evidencia verificable suficiente para ${target.gap.description}`,
    query: target.query.query,
    costLimitEur: money(input.expectedMarginalCostEur),
    roundLimit: 2 as const,
    stopCondition: target.query.stopCondition
      ?? 'Detener tras esta ronda: si no se obtiene evidencia suficiente, escalar a revisión sin ampliar la búsqueda.',
  }
}

function assessContradiction(
  contradiction: string,
  enabledProfiles: RealEditorialProfile[],
) {
  const normalized = contradiction.toLocaleLowerCase('es')
  const timeSensitive = /(horario|precio|tarifa|coste|apertura|cierre)/.test(normalized)
  const safetySensitive = /(seguridad|riesgo|peligro|acceso|restricci[oó]n|ruta)/.test(normalized)
  if (safetySensitive) {
    return {
      contradiction,
      impact: 'material_for_section' as const,
      affectedProfiles: enabledProfiles.includes('adventure')
        ? ['adventure'] as RealEditorialProfile[]
        : enabledProfiles,
      reason: 'Afecta a acceso, ruta o seguridad y exige bloquear o contextualizar la sección afectada.',
    }
  }
  if (timeSensitive) {
    return {
      contradiction,
      impact: 'tolerable_contextualizable' as const,
      affectedProfiles: enabledProfiles,
      reason: 'Es un dato sensible al tiempo que puede advertirse y no exige nueva búsqueda por sí solo.',
    }
  }
  return {
    contradiction,
    impact: 'relevant_non_blocking' as const,
    affectedProfiles: enabledProfiles,
    reason: 'La discrepancia debe conservarse en trazabilidad y evitar afirmaciones categóricas.',
  }
}

function overallStatus(statuses: RealEditorialSufficiencyStatus[]): RealEditorialSufficiencyStatus {
  if (statuses.includes('unsafe_to_write')) return 'unsafe_to_write'
  if (statuses.includes('insufficient')) return 'insufficient'
  if (statuses.includes('targeted_gap_only')) return 'targeted_gap_only'
  return 'enough_to_write'
}

function decisionReason(
  status: RealEditorialSufficiencyStatus,
  profiles: RealEditorialSufficiencyDecision['profiles'],
  targetedSearch: RealEditorialSufficiencyDecision['targetedSearch'],
): string {
  if (status === 'enough_to_write') return 'TENEMOS NOTICIA: la cobertura no se usa como umbral único y los riesgos residuales son editorialmente manejables.'
  if (status === 'targeted_gap_only') return `Solo se autoriza una ronda 2 focalizada para ${targetedSearch?.gapId ?? 'el gap material'}; no procede ampliar cobertura general.`
  if (status === 'unsafe_to_write') return `No se puede redactar como hecho la sección afectada de ${profiles.filter(profile => profile.status === 'unsafe_to_write').map(profile => profile.profile).join(', ')}.`
  return 'La evidencia material pendiente no puede omitirse ni contextualizarse sin degradar la utilidad, seguridad o precisión esencial.'
}

function sectionFor(gap: RealKnowledgeGap): string {
  return contextFor(gap).affectedSection
}

function contextFor(gap: RealKnowledgeGap): NonNullable<RealKnowledgeGap['editorialContext']> {
  if (gap.editorialContext) return gap.editorialContext
  const detail = `${gap.topic} ${gap.description}`
  const timeSensitive = /(horario|precio|tarifa|coste|apertura|cierre)/i.test(detail)
  const safetySensitive = /(seguridad|riesgo|peligro|acceso|restricci[oó]n|ruta|desnivel|dificultad)/i.test(detail)
  return {
    affectedSection: gap.topic,
    centrality: gap.importance,
    omittable: ['low', 'medium'].includes(gap.importance),
    contextualizable: timeSensitive,
    canBeDeclaredUnverified: timeSensitive,
    temporalSensitivity: timeSensitive ? 'time_sensitive' : 'variable',
    inventionRisk: safetySensitive && ['high', 'critical'].includes(gap.importance)
      ? gap.importance
      : gap.importance === 'critical' ? 'high' : gap.importance,
    evidenceThreshold: safetySensitive ? 'primary_required' : 'secondary_sufficient',
    estimatedUsefulEvidenceProbability: 0.5,
    estimatedMaterialChangeProbability: 0.5,
  }
}

function sourceAssessment(dossier: RealResearchDossier) {
  const publishers = new Set(dossier.sources.map(source => source.publisher ?? host(source.normalizedUrl)))
  const averageSourceScore = dossier.sources.length === 0
    ? 0
    : dossier.sources.reduce((total, source) => total + source.score, 0) / dossier.sources.length
  return {
    sourceCount: dossier.sources.length,
    distinctPublishers: publishers.size,
    averageSourceScore: Number(averageSourceScore.toFixed(6)),
    evidenceCount: dossier.evidence.length,
  }
}

function host(value: string): string {
  try {
    return new URL(value).host
  } catch {
    return value
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

function money(value: number): number {
  return Number(value.toFixed(6))
}
