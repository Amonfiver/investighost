import type {
  EditorialDraftProposal,
  EditorialGenerationContext,
  EditorialGenerationProvider,
  EditorialPromptSpec,
  ProposedEditorialSection,
} from './editorial-generation'
import type { EditorialDraftBundle, EditorialProfile, EditorialSection, ResearchFact } from '@shared/editorial-contracts'

const profileCategories: Record<EditorialProfile, ResearchFact['category'][]> = {
  adventure: ['nature', 'geography', 'history', 'logistics', 'safety', 'accessibility'],
  student: ['cost', 'service', 'logistics', 'safety', 'accessibility', 'history'],
}

export class MockEditorialGenerationProvider implements EditorialGenerationProvider {
  readonly id = 'mock-editorial-provider'
  readonly model = 'deterministic-editorial-fixture-v1'
  readonly simulation = true

  async generate(input: {
    profile: EditorialProfile
    prompt: EditorialPromptSpec
    context: EditorialGenerationContext
    signal: AbortSignal
  }): Promise<EditorialDraftProposal> {
    assertNotAborted(input.signal)
    const facts = selectFacts(input.context.facts, profileCategories[input.profile])
    const introduction = input.profile === 'adventure'
      ? `${input.context.destinationName} se plantea aquí como una exploración activa basada en evidencias: recorrido, preparación, condiciones y riesgos se distinguen antes de decidir cada tramo.`
      : `${input.context.destinationName} se evalúa como lugar de estancia estudiantil desde decisiones comprobables: presupuesto, movilidad, servicios, estudio, seguridad y vida diaria.`
    return {
      title: input.profile === 'adventure'
        ? `${input.context.destinationName}: rutas, preparación y riesgos`
        : `${input.context.destinationName}: guía práctica para estudiantes`,
      introduction,
      sections: input.prompt.requiredSections.map(kind => buildSection(input.profile, kind, input.context, facts)),
    }
  }

  async regenerateSection(input: {
    profile: EditorialProfile
    prompt: EditorialPromptSpec
    context: EditorialGenerationContext
    current: EditorialDraftBundle
    section: EditorialSection
    reason: string
    signal: AbortSignal
  }): Promise<ProposedEditorialSection> {
    assertNotAborted(input.signal)
    const facts = selectFacts(input.context.facts, profileCategories[input.profile])
    const generated = buildSection(input.profile, input.section.kind, input.context, facts)
    return {
      ...generated,
      heading: `${generated.heading} — versión revisada`,
      content: `${generated.content} La revisión parcial incorpora el criterio editorial solicitado sin alterar las demás secciones.`,
    }
  }
}

function buildSection(
  profile: EditorialProfile,
  kind: EditorialSection['kind'],
  context: EditorialGenerationContext,
  preferredFacts: ResearchFact[],
): ProposedEditorialSection {
  const facts = factsForKind(kind, preferredFacts, context.facts)
  const evidence = facts.map(fact => fact.statement).join(' ')
  const places = context.places.map(place => place.name).join(', ') || 'los lugares respaldados por las fuentes'
  const activities = context.activities.map(activity => activity.name).join(', ') || 'las actividades respaldadas por los hechos'
  const profileLead = profile === 'adventure'
    ? 'La utilidad aventurera depende de preparar el recorrido y contrastar condiciones.'
    : 'La utilidad estudiantil depende de separar datos estables de costes y servicios que requieren comprobación.'
  const templates: Record<EditorialSection['kind'], { heading: string; detail: string }> = {
    overview: { heading: 'Contexto verificable', detail: `Punto de partida factual: ${evidence}` },
    highlights: { heading: 'Lugares y motivos para explorar', detail: `La selección prioriza ${places}. ${evidence}` },
    route: { heading: 'Recorrido, esfuerzo y preparación', detail: `Las opciones estructuradas incluyen ${activities}. ${evidence}` },
    practical: { heading: 'Logística antes de decidir', detail: `Conviene verificar horarios, acceso y condiciones cambiantes. ${evidence}` },
    risks: { heading: 'Riesgos y datos por confirmar', detail: `Las contradicciones o datos volátiles requieren revisión humana. ${evidence}` },
    budget: { heading: 'Presupuesto y costes variables', detail: `Los costes se presentan solo cuando tienen evidencia y vigencia. ${evidence}` },
    daily_life: { heading: 'Movilidad, servicios y vida diaria', detail: `La estancia cotidiana se valora con servicios y accesos verificables. ${evidence}` },
    study: { heading: 'Estudio y trámites por comprobar', detail: `Antes de planificar estudios deben confirmarse centros, calendario y trámites. ${evidence}` },
    sources: { heading: 'Evidencias utilizadas', detail: `Las afirmaciones de esta sección proceden de hechos enlazados: ${evidence}` },
    other: { heading: 'Información complementaria', detail: evidence },
  }
  const template = templates[kind]
  return {
    kind,
    heading: template.heading,
    content: `${profileLead} ${template.detail}`,
    factIds: facts.map(fact => fact.id),
    sourceIds: unique(facts.flatMap(fact => fact.sourceIds)),
  }
}

function factsForKind(kind: EditorialSection['kind'], preferred: ResearchFact[], all: ResearchFact[]): ResearchFact[] {
  const categories: Partial<Record<EditorialSection['kind'], ResearchFact['category'][]>> = {
    route: ['geography', 'nature', 'logistics', 'accessibility'],
    practical: ['logistics', 'service', 'accessibility'],
    risks: ['safety', 'accessibility', 'cost'],
    budget: ['cost', 'service'],
    daily_life: ['service', 'logistics', 'cost', 'safety'],
    study: ['service', 'logistics', 'cost'],
  }
  const selected = categories[kind]
    ? all.filter(fact => categories[kind]?.includes(fact.category))
    : preferred
  return (selected.length > 0 ? selected : all).slice(0, 4)
}

function selectFacts(facts: ResearchFact[], categories: ResearchFact['category'][]): ResearchFact[] {
  const selected = facts.filter(fact => categories.includes(fact.category))
  return selected.length > 0 ? selected : facts
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort()
}

function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new Error('Mock editorial generation cancelled')
}
