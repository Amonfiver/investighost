import { createHash } from 'node:crypto'
import {
  EditorialDraftBundleSchema,
  QualityCheckSchema,
  QualityReviewSchema,
  ResearchFactSchema,
  ResearchSourceSchema,
  type EditorialDraftBundle,
  type EditorialProfile,
  type QualityCheck,
  type QualityOutcome,
  type QualityReview,
  type ResearchFact,
  type ResearchSource,
} from '@shared/editorial-contracts'
import { editorialPromptSpecs } from './editorial-generation'
import { normalizeGeographicText } from './geography'

export interface QualityReviewInput {
  destinationName: string
  language: string
  requestedProfiles: EditorialProfile[]
  sources: ResearchSource[]
  facts: ResearchFact[]
  drafts: EditorialDraftBundle[]
}

export interface QualityReviewResult {
  ruleVersion: string
  reviews: QualityReview[]
  checks: QualityCheck[]
  summary: Record<QualityOutcome, number>
  requiresHumanDecision: true
}

export type QualityReviewErrorCode = 'INVALID_INPUT' | 'DUPLICATE_PROFILE'

export class QualityReviewError extends Error {
  constructor(readonly code: QualityReviewErrorCode, message: string, readonly cause?: unknown) {
    super(message)
    this.name = 'QualityReviewError'
  }
}

export class RevisiatorService {
  readonly ruleVersion = 'revisiator-v1'

  constructor(private readonly now: () => Date = () => new Date()) {}

  review(input: QualityReviewInput): QualityReviewResult {
    const parsed = this.parseInput(input)
    const draftProfiles = parsed.drafts.map(bundle => bundle.draft.profile)
    if (new Set(draftProfiles).size !== draftProfiles.length) {
      throw new QualityReviewError('DUPLICATE_PROFILE', 'RevisIAtor recibió más de un borrador actual por perfil')
    }
    const reviews: QualityReview[] = []
    const checks: QualityCheck[] = []
    for (const bundle of parsed.drafts) {
      const reviewId = deterministicUuid(`${bundle.draft.id}:${bundle.draft.contentVersion}:${this.ruleVersion}`)
      const draftChecks = this.reviewDraft(reviewId, bundle, parsed)
      const outcome = resolveOutcome(draftChecks, parsed.requestedProfiles.includes(bundle.draft.profile))
      checks.push(...draftChecks)
      reviews.push(QualityReviewSchema.parse({
        id: reviewId,
        draftId: bundle.draft.id,
        draftVersion: bundle.draft.contentVersion,
        outcome,
        ruleVersion: this.ruleVersion,
        checkIds: draftChecks.map(check => check.id),
        reviewedAt: this.now(),
      }))
    }
    const summary: Record<QualityOutcome, number> = {
      passed: 0,
      passed_with_warnings: 0,
      changes_requested: 0,
      blocked: 0,
      rejected: 0,
    }
    for (const review of reviews) summary[review.outcome] += 1
    return { ruleVersion: this.ruleVersion, reviews, checks, summary, requiresHumanDecision: true }
  }

  private parseInput(input: QualityReviewInput): QualityReviewInput {
    try {
      if (!input.destinationName.trim() || !/^[a-z]{2}$/.test(input.language)) throw new Error('Destino o idioma inválido')
      return {
        ...input,
        sources: input.sources.map(source => ResearchSourceSchema.parse(source)),
        facts: input.facts.map(fact => ResearchFactSchema.parse(fact)),
        drafts: input.drafts.map(bundle => EditorialDraftBundleSchema.parse(bundle)),
      }
    } catch (error) {
      throw new QualityReviewError('INVALID_INPUT', 'RevisIAtor requiere contratos canónicos válidos', error)
    }
  }

  private reviewDraft(reviewId: string, bundle: EditorialDraftBundle, input: QualityReviewInput): QualityCheck[] {
    const checks: QualityCheck[] = []
    const facts = new Map(input.facts.map(fact => [fact.id, fact]))
    const sources = new Map(input.sources.map(source => [source.id, source]))
    const profile = bundle.draft.profile
    const prompt = editorialPromptSpecs[profile]
    const sections = bundle.sections
    const allText = `${bundle.draft.title} ${bundle.draft.introduction} ${sections.map(section => `${section.heading} ${section.content}`).join(' ')}`
    const referencedFactIds = new Set(sections.flatMap(section => section.factIds))
    const referencedSourceIds = new Set(sections.flatMap(section => section.sourceIds))

    addCheck(checks, reviewId, 'schema.valid', 'blocker', true,
      'Borrador y secciones cumplen los schemas canónicos.', 'Corregir el contrato antes de revisar.', this.ruleVersion, this.now())

    const requested = input.requestedProfiles.includes(profile)
    addCheck(checks, reviewId, 'profile.requested', 'error', requested,
      requested ? `El perfil ${profile} fue solicitado.` : `El perfil ${profile} no pertenece a la solicitud.`,
      'Eliminar el perfil ajeno o crear una solicitud que lo incluya.', this.ruleVersion, this.now())

    const kinds = sections.map(section => section.kind)
    const coverage = sameArray(kinds, prompt.requiredSections)
    addCheck(checks, reviewId, 'coverage.sections', 'error', coverage,
      coverage ? `Cobertura completa de ${prompt.version}.` : `Esperadas ${prompt.requiredSections.join(', ')}; recibidas ${kinds.join(', ')}.`,
      'Regenerar únicamente las secciones ausentes o fuera de orden.', this.ruleVersion, this.now())

    const traceability = sections.every(section => {
      const sectionFacts = section.factIds.map(factId => facts.get(factId))
      if (sectionFacts.some(fact => !fact)) return false
      const allowedSources = new Set(sectionFacts.flatMap(fact => fact?.sourceIds ?? []))
      return section.sourceIds.every(sourceId => sources.has(sourceId) && allowedSources.has(sourceId))
    })
    addCheck(checks, reviewId, 'traceability.source_fact_text', 'blocker', traceability,
      traceability ? 'Todas las secciones mantienen fuente→hecho→texto.' : 'Hay hechos/fuentes inexistentes o ajenos en una sección.',
      'Restaurar las relaciones de evidencia antes de cualquier decisión.', this.ruleVersion, this.now())

    const referencedSources = [...referencedSourceIds].map(sourceId => sources.get(sourceId)).filter(Boolean) as ResearchSource[]
    const weakSources = referencedSources.filter(source => source.reliability < 0.6)
    addCheck(checks, reviewId, 'sources.reliability', 'warning', weakSources.length === 0,
      weakSources.length === 0 ? 'No hay fuentes débiles en el texto.' : `${weakSources.length} fuente(s) tienen fiabilidad inferior a 0.6.`,
      'Sustituir o corroborar las fuentes débiles.', this.ruleVersion, this.now())

    const datedSources = referencedSources.filter(source => source.freshness !== 'current')
    addCheck(checks, reviewId, 'sources.freshness', 'warning', datedSources.length === 0,
      datedSources.length === 0 ? 'Las fuentes referenciadas están marcadas como actuales.' : `${datedSources.length} fuente(s) son antiguas o de actualidad desconocida.`,
      'Confirmar vigencia o expresar fecha y limitación.', this.ruleVersion, this.now())

    const contradictoryFacts = [...referencedFactIds].map(factId => facts.get(factId)).filter(fact => fact?.contradiction !== 'none')
    addCheck(checks, reviewId, 'facts.contradictions', 'warning', contradictoryFacts.length === 0,
      contradictoryFacts.length === 0 ? 'No hay contradicciones referenciadas.' : `${contradictoryFacts.length} hecho(s) tienen contradicción pendiente.`,
      'Presentar la discrepancia o resolverla con otra fuente.', this.ruleVersion, this.now())

    const normalizedContents = sections.map(section => normalizeForComparison(section.content))
    const duplicateContent = new Set(normalizedContents).size !== normalizedContents.length
    const duplicateHeadings = new Set(sections.map(section => normalizeForComparison(section.heading))).size !== sections.length
    addCheck(checks, reviewId, 'editorial.duplicates', 'error', !duplicateContent && !duplicateHeadings,
      !duplicateContent && !duplicateHeadings ? 'No hay secciones o encabezados duplicados.' : 'Se detectó contenido o encabezado duplicado.',
      'Consolidar duplicados y asignar una función única a cada sección.', this.ruleVersion, this.now())

    const cliches = ['para todos los gustos', 'destino único e inolvidable', 'joya escondida', 'no te dejará indiferente']
      .filter(cliche => normalizeForComparison(allText).includes(normalizeForComparison(cliche)))
    addCheck(checks, reviewId, 'editorial.cliches', 'warning', cliches.length === 0,
      cliches.length === 0 ? 'No se detectaron clichés bloqueados.' : `Clichés detectados: ${cliches.join(', ')}.`,
      'Sustituir clichés por información concreta y trazable.', this.ruleVersion, this.now())

    const fillerSections = sections.filter(section => section.content.length / Math.max(section.factIds.length, 1) > 1_500)
    addCheck(checks, reviewId, 'editorial.filler', 'warning', fillerSections.length === 0,
      fillerSections.length === 0 ? 'La densidad texto/evidencia está dentro del límite.' : `${fillerSections.length} sección(es) tienen baja densidad factual.`,
      'Reducir relleno o añadir evidencia real.', this.ruleVersion, this.now())

    const destinationToken = normalizeGeographicText(input.destinationName)
    const geographyCoherent = normalizeGeographicText(`${bundle.draft.title} ${bundle.draft.introduction}`).includes(destinationToken)
    addCheck(checks, reviewId, 'geography.identity', 'error', geographyCoherent,
      geographyCoherent ? `Título/introducción identifican ${input.destinationName}.` : `Título/introducción no identifican ${input.destinationName}.`,
      'Restaurar el destino canónico sin introducir otro lugar.', this.ruleVersion, this.now())

    const languageCoherent = input.language !== 'es' || looksSpanish(allText)
    addCheck(checks, reviewId, 'language.consistency', 'error', languageCoherent,
      languageCoherent ? `El texto es coherente con idioma ${input.language}.` : 'El texto no presenta suficientes indicadores del español solicitado.',
      'Revisar idioma sin traducir nombres propios ni alterar hechos.', this.ruleVersion, this.now())

    const positionsCoherent = sections.every((section, index) => section.position === index)
    addCheck(checks, reviewId, 'editorial.coherence', 'error', positionsCoherent,
      positionsCoherent ? 'Orden y posiciones de sección son coherentes.' : 'Las posiciones no son contiguas o no coinciden con el orden.',
      'Reordenar secciones y persistir posiciones contiguas.', this.ruleVersion, this.now())

    const otherDraft = input.drafts.find(candidate => candidate.draft.profile !== profile)
    const differentiated = !otherDraft || profilesDiffer(bundle, otherDraft)
    addCheck(checks, reviewId, 'profiles.differentiation', 'error', differentiated,
      differentiated ? 'El perfil se diferencia por estructura y vocabulario útil.' : 'Los perfiles son demasiado similares.',
      'Regenerar selección, estructura y decisiones específicas del perfil.', this.ruleVersion, this.now())

    const volatileFacts = [...referencedFactIds].map(factId => facts.get(factId)).filter(fact => fact?.volatility === 'volatile') as ResearchFact[]
    const volatileHandled = volatileFacts.every(fact => sections
      .filter(section => section.factIds.includes(fact.id))
      .every(section => /(confirm|verific|consult|revis|puede variar|vigencia)/i.test(section.content)))
    addCheck(checks, reviewId, 'facts.volatility', 'error', volatileHandled,
      volatileHandled ? 'Los hechos volátiles incluyen cautela o confirmación.' : 'Algún dato volátil se presenta sin aviso de comprobación.',
      'Añadir vigencia y necesidad de confirmar el dato.', this.ruleVersion, this.now())

    const safetyFacts = input.facts.filter(fact => fact.category === 'safety' && referencedFactIds.has(fact.id))
    const riskSection = sections.find(section => section.kind === 'risks')
    const safetyCovered = safetyFacts.length === 0 || Boolean(riskSection && safetyFacts.every(fact => riskSection.factIds.includes(fact.id)))
    addCheck(checks, reviewId, 'safety.coverage', 'blocker', safetyCovered,
      safetyCovered ? 'Los hechos de seguridad están cubiertos en riesgos.' : 'Hay hechos de seguridad fuera de la sección de riesgos.',
      'Incluir todos los riesgos trazables antes de revisión humana.', this.ruleVersion, this.now())

    addCheck(checks, reviewId, 'human.decision_required', 'info', true,
      'RevisIAtor solo recomienda; la aprobación sigue pendiente de una persona.',
      'Presentar checks y borrador al operador.', this.ruleVersion, this.now())
    return checks
  }
}

function addCheck(
  target: QualityCheck[],
  reviewId: string,
  code: string,
  severity: QualityCheck['severity'],
  passed: boolean,
  evidence: string,
  correction: string,
  ruleVersion: string,
  createdAt: Date,
): void {
  target.push(QualityCheckSchema.parse({
    id: deterministicUuid(`${reviewId}:${code}`),
    reviewId,
    code,
    severity,
    result: passed ? 'passed' : severity === 'warning' ? 'warning' : 'failed',
    evidence,
    correction: passed ? undefined : correction,
    responsible: passed ? 'system' : severity === 'info' ? 'system' : 'editor',
    ruleVersion,
    createdAt,
  }))
}

function resolveOutcome(checks: QualityCheck[], requested: boolean): QualityOutcome {
  if (!requested) return 'rejected'
  if (checks.some(check => check.severity === 'blocker' && check.result === 'failed')) return 'blocked'
  if (checks.some(check => check.severity === 'error' && check.result === 'failed')) return 'changes_requested'
  if (checks.some(check => check.result === 'warning')) return 'passed_with_warnings'
  return 'passed'
}

function profilesDiffer(left: EditorialDraftBundle, right: EditorialDraftBundle): boolean {
  const leftKinds = new Set(left.sections.map(section => section.kind))
  const rightKinds = new Set(right.sections.map(section => section.kind))
  const uniqueLeft = [...leftKinds].filter(kind => !rightKinds.has(kind)).length
  const uniqueRight = [...rightKinds].filter(kind => !leftKinds.has(kind)).length
  const leftTokens = tokenSet(left.sections.map(section => section.content).join(' '))
  const rightTokens = tokenSet(right.sections.map(section => section.content).join(' '))
  const intersection = [...leftTokens].filter(token => rightTokens.has(token)).length
  const union = new Set([...leftTokens, ...rightTokens]).size
  const similarity = union === 0 ? 1 : intersection / union
  return uniqueLeft >= 2 && uniqueRight >= 2 && similarity < 0.8
}

function looksSpanish(value: string): boolean {
  const tokens = tokenSet(value)
  const indicators = ['de', 'la', 'el', 'y', 'para', 'con', 'los', 'las', 'una', 'antes', 'fuentes', 'riesgos']
  return indicators.filter(indicator => tokens.has(indicator)).length >= 4
}

function tokenSet(value: string): Set<string> {
  return new Set(normalizeForComparison(value).split(' ').filter(token => token.length > 1))
}

function normalizeForComparison(value: string): string {
  return normalizeGeographicText(value)
}

function deterministicUuid(value: string): string {
  const hex = createHash('sha256').update(value).digest('hex').slice(0, 32).split('')
  hex[12] = '4'
  hex[16] = ['8', '9', 'a', 'b'][Number.parseInt(hex[16], 16) % 4]
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20).join('')}`
}

function sameArray<T>(left: T[], right: T[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}
