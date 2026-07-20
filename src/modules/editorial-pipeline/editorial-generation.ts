import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import {
  EditorialDraftBundleSchema,
  EditorialSectionSchema,
  ProviderUsageSchema,
  ResearchActivitySchema,
  ResearchFactSchema,
  ResearchPlaceSchema,
  type EditorialDraftBundle,
  type EditorialProfile,
  type EditorialSection,
  type ProviderUsage,
  type ResearchActivity,
  type ResearchFact,
  type ResearchPlace,
} from '@shared/editorial-contracts'

export interface EditorialPromptSpec {
  profile: EditorialProfile
  version: string
  purpose: string
  tone: string
  priorities: string[]
  requiredSections: EditorialSection['kind'][]
  forbiddenExpressions: string[]
  minIntroductionCharacters: number
  minSectionCharacters: number
  maxSectionCharacters: number
}

export const editorialPromptSpecs: Record<EditorialProfile, EditorialPromptSpec> = {
  adventure: {
    profile: 'adventure',
    version: 'adventure-v1',
    purpose: 'Preparar una exploración activa, segura y logística del destino.',
    tone: 'Directo, concreto y prudente; sin épica inventada.',
    priorities: ['exploración', 'naturaleza', 'rutas', 'dificultad', 'temporada', 'preparación', 'riesgos', 'logística'],
    requiredSections: ['overview', 'highlights', 'route', 'practical', 'risks', 'sources'],
    forbiddenExpressions: ['como modelo de ia', 'para todos los gustos', 'destino único e inolvidable'],
    minIntroductionCharacters: 80,
    minSectionCharacters: 60,
    maxSectionCharacters: 3_000,
  },
  student: {
    profile: 'student',
    version: 'student-v1',
    purpose: 'Evaluar una estancia de estudiante con decisiones cotidianas verificables.',
    tone: 'Práctico, claro y sobrio; distinguir datos de cuestiones por confirmar.',
    priorities: ['presupuesto', 'transporte', 'alojamiento', 'zonas', 'ambiente', 'estudio', 'servicios', 'seguridad', 'vida diaria', 'trámites'],
    requiredSections: ['overview', 'budget', 'daily_life', 'study', 'practical', 'risks', 'sources'],
    forbiddenExpressions: ['como modelo de ia', 'para todos los gustos', 'destino único e inolvidable'],
    minIntroductionCharacters: 80,
    minSectionCharacters: 60,
    maxSectionCharacters: 3_000,
  },
}

const ProposedSectionSchema = z.object({
  kind: z.enum(['overview', 'highlights', 'route', 'practical', 'risks', 'budget', 'daily_life', 'study', 'sources', 'other']),
  heading: z.string().trim().min(1).max(300),
  content: z.string().trim().min(1).max(20_000),
  factIds: z.array(z.string().uuid()).min(1),
  sourceIds: z.array(z.string().uuid()).min(1),
})

export const EditorialDraftProposalSchema = z.object({
  title: z.string().trim().min(1).max(300),
  introduction: z.string().trim().min(1).max(5000),
  sections: z.array(ProposedSectionSchema).min(1),
})

export type ProposedEditorialSection = z.infer<typeof ProposedSectionSchema>
export type EditorialDraftProposal = z.infer<typeof EditorialDraftProposalSchema>

export interface EditorialGenerationContext {
  destinationName: string
  language: string
  facts: ResearchFact[]
  places: ResearchPlace[]
  activities: ResearchActivity[]
}

export interface EditorialGenerationProvider {
  readonly id: string
  readonly model: string
  readonly simulation: boolean
  generate(input: {
    profile: EditorialProfile
    prompt: EditorialPromptSpec
    context: EditorialGenerationContext
    signal: AbortSignal
  }): Promise<EditorialDraftProposal>
  regenerateSection(input: {
    profile: EditorialProfile
    prompt: EditorialPromptSpec
    context: EditorialGenerationContext
    current: EditorialDraftBundle
    section: EditorialSection
    reason: string
    signal: AbortSignal
  }): Promise<ProposedEditorialSection>
}

export interface EditorialGenerationInput extends EditorialGenerationContext {
  requestId: string
  runId: string
  actorId: string
  profiles: EditorialProfile[]
  signal?: AbortSignal
}

export interface EditorialRegenerationInput extends EditorialGenerationContext {
  requestId: string
  runId: string
  actorId: string
  current: EditorialDraftBundle
  sectionId: string
  reason: string
  signal?: AbortSignal
}

export interface EditorialGenerationResult {
  drafts: EditorialDraftBundle[]
  history: EditorialDraftBundle[]
  usage: ProviderUsage[]
  estimatedCost: number
  actualCost: number
  currency: string
  simulation: boolean
}

export interface EditorialGenerationPricing {
  fullDraftCost: number
  sectionRegenerationCost: number
  budgetLimit: number
  currency: string
}

export type EditorialGenerationErrorCode =
  | 'CANCELLED'
  | 'BUDGET_EXCEEDED'
  | 'INVALID_PROPOSAL'
  | 'MISSING_TRACEABILITY'
  | 'PROFILE_NOT_DIFFERENTIATED'
  | 'SECTION_NOT_FOUND'

export class EditorialGenerationError extends Error {
  constructor(readonly code: EditorialGenerationErrorCode, message: string, readonly cause?: unknown) {
    super(message)
    this.name = 'EditorialGenerationError'
  }
}

const defaultPricing: EditorialGenerationPricing = {
  fullDraftCost: 0,
  sectionRegenerationCost: 0,
  budgetLimit: 0,
  currency: 'EUR',
}

export class EditorialGenerationService {
  private readonly pricing: EditorialGenerationPricing
  private readonly now: () => Date
  private readonly id: () => string

  constructor(
    private readonly provider: EditorialGenerationProvider,
    pricing: Partial<EditorialGenerationPricing> = {},
    dependencies: { now?: () => Date; id?: () => string } = {},
  ) {
    this.pricing = { ...defaultPricing, ...pricing }
    this.now = dependencies.now ?? (() => new Date())
    this.id = dependencies.id ?? randomUUID
  }

  async generate(input: EditorialGenerationInput): Promise<EditorialGenerationResult> {
    this.validateContext(input)
    if (new Set(input.profiles).size !== input.profiles.length || input.profiles.length === 0) {
      throw new EditorialGenerationError('INVALID_PROPOSAL', 'Debe solicitarse al menos un perfil sin duplicados')
    }
    const totalCost = input.profiles.length * this.pricing.fullDraftCost
    this.assertBudget(totalCost)
    const signal = input.signal ?? new AbortController().signal
    const drafts: EditorialDraftBundle[] = []
    const usage: ProviderUsage[] = []
    for (const profile of input.profiles) {
      this.assertNotCancelled(signal)
      const prompt = editorialPromptSpecs[profile]
      const proposal = await this.callProvider(() => this.provider.generate({ profile, prompt, context: input, signal }), signal)
      const bundle = this.buildBundle(input, profile, proposal, 1)
      drafts.push(bundle)
      usage.push(this.buildUsage(input.runId, profile, 'full', proposal, this.pricing.fullDraftCost))
    }
    this.assertDifferentiated(drafts)
    return {
      drafts,
      history: [],
      usage,
      estimatedCost: totalCost,
      actualCost: totalCost,
      currency: this.pricing.currency,
      simulation: this.provider.simulation,
    }
  }

  async regenerateSection(input: EditorialRegenerationInput): Promise<EditorialGenerationResult> {
    this.validateContext(input)
    const current = EditorialDraftBundleSchema.parse(input.current)
    const section = current.sections.find(item => item.id === input.sectionId)
    if (!section) throw new EditorialGenerationError('SECTION_NOT_FOUND', 'La sección solicitada no pertenece al borrador actual')
    const reason = input.reason.trim()
    if (!reason) throw new EditorialGenerationError('INVALID_PROPOSAL', 'La regeneración parcial exige un motivo')
    this.assertBudget(this.pricing.sectionRegenerationCost)
    const signal = input.signal ?? new AbortController().signal
    this.assertNotCancelled(signal)
    const profile = current.draft.profile
    const prompt = editorialPromptSpecs[profile]
    const proposedSection = await this.callSectionProvider(() => this.provider.regenerateSection({
      profile,
      prompt,
      context: input,
      current,
      section,
      reason,
      signal,
    }), signal)
    if (proposedSection.kind !== section.kind) {
      throw new EditorialGenerationError('INVALID_PROPOSAL', 'La regeneración parcial no puede cambiar el tipo de sección')
    }
    this.validateSection(proposedSection, prompt, input.facts)

    const nextContentVersion = current.draft.contentVersion + 1
    const draftId = deterministicUuid(`${input.requestId}:draft:${profile}:${nextContentVersion}`)
    const createdAt = this.now()
    const nextSections = current.sections.map((existing, position) => {
      const proposal: ProposedEditorialSection = existing.id === section.id ? proposedSection : {
        kind: existing.kind,
        heading: existing.heading,
        content: existing.content,
        factIds: existing.factIds,
        sourceIds: existing.sourceIds,
      }
      return EditorialSectionSchema.parse({
        id: deterministicUuid(`${draftId}:section:${proposal.kind}:${position}`),
        draftId,
        kind: proposal.kind,
        heading: proposal.heading,
        content: proposal.content,
        position,
        factIds: proposal.factIds,
        sourceIds: proposal.sourceIds,
        promptVersion: prompt.version,
        humanEdited: false,
        regenerationReason: existing.id === section.id ? reason : undefined,
        version: existing.id === section.id ? existing.version + 1 : existing.version,
        createdAt,
        updatedAt: createdAt,
      })
    })
    const next = EditorialDraftBundleSchema.parse({
      draft: {
        id: draftId,
        requestId: input.requestId,
        runId: input.runId,
        profile,
        title: current.draft.title,
        introduction: current.draft.introduction,
        promptVersion: prompt.version,
        contentVersion: nextContentVersion,
        state: 'ready',
        previousDraftId: current.draft.id,
        regenerationReason: reason,
        humanEdited: false,
        createdBy: input.actorId,
        updatedBy: input.actorId,
        version: current.draft.version + 1,
        createdAt,
        updatedAt: createdAt,
      },
      sections: nextSections,
    })
    return {
      drafts: [next],
      history: [current],
      usage: [this.buildUsage(input.runId, profile, `section:${section.kind}`, proposedSection, this.pricing.sectionRegenerationCost)],
      estimatedCost: this.pricing.sectionRegenerationCost,
      actualCost: this.pricing.sectionRegenerationCost,
      currency: this.pricing.currency,
      simulation: this.provider.simulation,
    }
  }

  private buildBundle(
    input: EditorialGenerationInput,
    profile: EditorialProfile,
    candidate: EditorialDraftProposal,
    contentVersion: number,
  ): EditorialDraftBundle {
    const proposal = EditorialDraftProposalSchema.parse(candidate)
    const prompt = editorialPromptSpecs[profile]
    this.validateProposal(proposal, prompt, input.facts)
    const draftId = deterministicUuid(`${input.requestId}:draft:${profile}:${contentVersion}`)
    const createdAt = this.now()
    return EditorialDraftBundleSchema.parse({
      draft: {
        id: draftId,
        requestId: input.requestId,
        runId: input.runId,
        profile,
        title: proposal.title,
        introduction: proposal.introduction,
        promptVersion: prompt.version,
        contentVersion,
        state: 'ready',
        humanEdited: false,
        createdBy: input.actorId,
        updatedBy: input.actorId,
        version: 1,
        createdAt,
        updatedAt: createdAt,
      },
      sections: proposal.sections.map((section, position) => EditorialSectionSchema.parse({
        id: deterministicUuid(`${draftId}:section:${section.kind}:${position}`),
        draftId,
        kind: section.kind,
        heading: section.heading,
        content: section.content,
        position,
        factIds: section.factIds,
        sourceIds: section.sourceIds,
        promptVersion: prompt.version,
        humanEdited: false,
        version: 1,
        createdAt,
        updatedAt: createdAt,
      })),
    })
  }

  private validateContext(context: EditorialGenerationContext): void {
    z.string().trim().min(1).max(160).parse(context.destinationName)
    z.string().length(2).parse(context.language)
    z.array(ResearchFactSchema).min(1).parse(context.facts)
    z.array(ResearchPlaceSchema).parse(context.places)
    z.array(ResearchActivitySchema).parse(context.activities)
  }

  private validateProposal(proposal: EditorialDraftProposal, prompt: EditorialPromptSpec, facts: ResearchFact[]): void {
    if (proposal.introduction.length < prompt.minIntroductionCharacters) {
      throw new EditorialGenerationError('INVALID_PROPOSAL', `La introducción ${prompt.profile} es demasiado breve`)
    }
    const kinds = proposal.sections.map(section => section.kind)
    if (new Set(kinds).size !== kinds.length || !sameArray(kinds, prompt.requiredSections)) {
      throw new EditorialGenerationError('INVALID_PROPOSAL', `Las secciones ${prompt.profile} no cumplen la plantilla ${prompt.version}`)
    }
    for (const section of proposal.sections) this.validateSection(section, prompt, facts)
    this.assertNoForbiddenText(`${proposal.title} ${proposal.introduction} ${proposal.sections.map(section => section.content).join(' ')}`, prompt)
  }

  private validateSection(section: ProposedEditorialSection, prompt: EditorialPromptSpec, facts: ResearchFact[]): void {
    if (section.content.length < prompt.minSectionCharacters || section.content.length > prompt.maxSectionCharacters) {
      throw new EditorialGenerationError('INVALID_PROPOSAL', `La sección ${section.kind} incumple la longitud de ${prompt.version}`)
    }
    const knownFacts = new Map(facts.map(fact => [fact.id, fact]))
    if (section.factIds.some(factId => !knownFacts.has(factId))) {
      throw new EditorialGenerationError('MISSING_TRACEABILITY', `La sección ${section.kind} referencia un hecho inexistente`)
    }
    const allowedSources = new Set(section.factIds.flatMap(factId => knownFacts.get(factId)?.sourceIds ?? []))
    if (section.sourceIds.some(sourceId => !allowedSources.has(sourceId))) {
      throw new EditorialGenerationError('MISSING_TRACEABILITY', `La sección ${section.kind} referencia una fuente ajena a sus hechos`)
    }
    this.assertNoForbiddenText(`${section.heading} ${section.content}`, prompt)
  }

  private assertNoForbiddenText(value: string, prompt: EditorialPromptSpec): void {
    const normalized = value.toLocaleLowerCase('es')
    if (prompt.forbiddenExpressions.some(expression => normalized.includes(expression))) {
      throw new EditorialGenerationError('INVALID_PROPOSAL', `El texto contiene una expresión prohibida por ${prompt.version}`)
    }
  }

  private assertDifferentiated(drafts: EditorialDraftBundle[]): void {
    const adventure = drafts.find(bundle => bundle.draft.profile === 'adventure')
    const student = drafts.find(bundle => bundle.draft.profile === 'student')
    if (!adventure || !student) return
    const adventureKinds = new Set(adventure.sections.map(section => section.kind))
    const studentKinds = new Set(student.sections.map(section => section.kind))
    const uniqueAdventure = [...adventureKinds].filter(kind => !studentKinds.has(kind))
    const uniqueStudent = [...studentKinds].filter(kind => !adventureKinds.has(kind))
    const adventureText = adventure.sections.map(section => section.content).join(' ').toLocaleLowerCase('es')
    const studentText = student.sections.map(section => section.content).join(' ').toLocaleLowerCase('es')
    if (uniqueAdventure.length < 2 || uniqueStudent.length < 3 || adventureText === studentText) {
      throw new EditorialGenerationError('PROFILE_NOT_DIFFERENTIATED', 'Aventura y Estudiante no se diferencian por estructura y utilidad')
    }
  }

  private async callProvider(call: () => Promise<EditorialDraftProposal>, signal: AbortSignal): Promise<EditorialDraftProposal> {
    try {
      const result = await call()
      this.assertNotCancelled(signal)
      return EditorialDraftProposalSchema.parse(result)
    } catch (error) {
      if (signal.aborted) throw new EditorialGenerationError('CANCELLED', 'La generación editorial fue cancelada', error)
      if (error instanceof EditorialGenerationError) throw error
      throw new EditorialGenerationError('INVALID_PROPOSAL', 'El proveedor editorial devolvió un borrador inválido', error)
    }
  }

  private async callSectionProvider(call: () => Promise<ProposedEditorialSection>, signal: AbortSignal): Promise<ProposedEditorialSection> {
    try {
      const result = await call()
      this.assertNotCancelled(signal)
      return ProposedSectionSchema.parse(result)
    } catch (error) {
      if (signal.aborted) throw new EditorialGenerationError('CANCELLED', 'La regeneración editorial fue cancelada', error)
      if (error instanceof EditorialGenerationError) throw error
      throw new EditorialGenerationError('INVALID_PROPOSAL', 'El proveedor editorial devolvió una sección inválida', error)
    }
  }

  private buildUsage(runId: string, profile: EditorialProfile, cause: string, value: unknown, cost: number): ProviderUsage {
    const output = JSON.stringify(value)
    return ProviderUsageSchema.parse({
      id: this.id(),
      runId,
      stage: 'profile_generation',
      providerId: this.provider.id,
      model: this.provider.model,
      inputUnits: 0,
      outputUnits: Math.ceil(output.length / 4),
      estimatedCost: cost,
      actualCost: cost,
      currency: this.pricing.currency,
      budgetLimit: this.pricing.budgetLimit,
      cause: `${profile}:${cause}`,
      createdAt: this.now(),
    })
  }

  private assertBudget(cost: number): void {
    if (cost > this.pricing.budgetLimit) {
      throw new EditorialGenerationError('BUDGET_EXCEEDED', `La generación supera el presupuesto ${this.pricing.currency}`)
    }
  }

  private assertNotCancelled(signal: AbortSignal): void {
    if (signal.aborted) throw new EditorialGenerationError('CANCELLED', 'La generación editorial fue cancelada')
  }
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
