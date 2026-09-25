import { z, type ZodTypeAny } from 'zod'
import type { RedoGenerationGuidance } from '@shared/redo-guidance-contracts'
import {
  AdventurePackageV1Schema,
  StudentDocumentV1Schema,
  VisualIntentSchema,
  type AdventurePackageV1,
  type StudentDocumentV1,
  type VisualIntent,
} from '@shared/structured-editorial-package-contracts'
import type { RealMasterKnowledge, RealResearchDossier } from '@shared/real-pipeline-contracts'

/**
 * Provider-neutral structured-output transport.  An adapter may implement it
 * with Responses JSON Schema, another compatible API, or a deterministic test
 * double.  It deliberately receives/returns objects, never Markdown.
 */
export interface StructuredGenerationTransport {
  generateStructured<T>(
    operation: 'generate_student_document_v1' | 'generate_adventure_package_v1',
    payload: Record<string, unknown>,
    schema: ZodTypeAny,
    signal: AbortSignal,
  ): Promise<{ output: T; usage: StructuredGenerationUsage }>
}

export interface StructuredGenerationUsage {
  providerId: string
  model: string
  inputTokens: number
  cachedInputTokens?: number
  outputTokens: number
  estimatedCost: number
  currency: 'EUR' | 'USD'
  providerRequestIds?: string[]
}

export interface StructuredGenerationInput {
  destination: { id: string; name: string; countryCode: string; region?: string }
  masterKnowledge: RealMasterKnowledge
  dossier: RealResearchDossier
  guidance?: RedoGenerationGuidance
  previousRevision?: { revisionId: string; document: StudentDocumentV1 | AdventurePackageV1 }
}

export const GeneratedStudentDocumentV1Schema = z.object({
  document: StudentDocumentV1Schema,
  visualIntents: z.array(VisualIntentSchema).max(100),
}).strict()

export const GeneratedAdventurePackageV1Schema = z.object({
  document: AdventurePackageV1Schema,
  visualIntents: z.array(VisualIntentSchema).max(100),
}).strict()

export type GeneratedStudentDocumentV1 = z.infer<typeof GeneratedStudentDocumentV1Schema>
export type GeneratedAdventurePackageV1 = z.infer<typeof GeneratedAdventurePackageV1Schema>

export async function generateStudentDocumentV1(
  transport: StructuredGenerationTransport,
  input: StructuredGenerationInput,
  signal: AbortSignal,
): Promise<GeneratedStudentDocumentV1 & { usage: StructuredGenerationUsage }> {
  const result = await transport.generateStructured<GeneratedStudentDocumentV1>(
    'generate_student_document_v1',
    studentPayload(input),
    GeneratedStudentDocumentV1Schema,
    signal,
  )
  const output = GeneratedStudentDocumentV1Schema.parse(result.output)
  assertEvidenceReferences(output.visualIntents, input)
  const figures = new Set(output.document.blocks
    .filter((block): block is Extract<StudentDocumentV1['blocks'][number], { type: 'figure'; resolution: 'INTENT' }> => block.type === 'figure' && block.resolution === 'INTENT')
    .map(block => block.visualIntentId))
  assertExactIntents(output.visualIntents, figures, 'STUDENT_FIGURE', 'STUDENT_BLOCK')
  return { ...output, usage: result.usage }
}

export async function generateAdventurePackageV1(
  transport: StructuredGenerationTransport,
  input: StructuredGenerationInput,
  signal: AbortSignal,
): Promise<GeneratedAdventurePackageV1 & { usage: StructuredGenerationUsage }> {
  const result = await transport.generateStructured<GeneratedAdventurePackageV1>(
    'generate_adventure_package_v1',
    adventurePayload(input),
    GeneratedAdventurePackageV1Schema,
    signal,
  )
  const output = GeneratedAdventurePackageV1Schema.parse(result.output)
  assertEvidenceReferences(output.visualIntents, input)
  assertEvidenceReferences([output.document.copy, output.document.hero, ...output.document.visualStory.items, ...output.document.placesToGo.items, ...output.document.placesToGo.supplementalGaps], input)
  const assets = [
    { asset: output.document.hero.asset, purpose: 'ADVENTURE_HERO' as const, linked: 'HERO' as const },
    ...output.document.visualStory.items.map(item => ({ asset: item.asset, purpose: 'VISUAL_STORY' as const, linked: 'VISUAL_STORY_ITEM' as const })),
    ...output.document.placesToGo.items.map(item => ({ asset: item.asset, purpose: 'PLACE_ASSET' as const, linked: 'PLACE' as const })),
  ]
  for (const item of assets) {
    const asset = item.asset
    if (!asset || asset.status !== 'INTENT') continue
    const intent = output.visualIntents.find(candidate => candidate.id === asset.visualIntentId)
    if (!intent || intent.purpose !== item.purpose || intent.linkedContent.type !== item.linked) {
      throw new StructuredGenerationError('ORPHAN_VISUAL_INTENT', `El intent ${asset.visualIntentId} no corresponde al contenido Adventure`)
    }
  }
  const referenced = new Set(assets.flatMap(item => item.asset?.status === 'INTENT' ? [item.asset.visualIntentId] : []))
  for (const intent of output.visualIntents) if (!referenced.has(intent.id)) {
    throw new StructuredGenerationError('ORPHAN_VISUAL_INTENT', `El intent ${intent.id} no está referido por Adventure`)
  }
  return { ...output, usage: result.usage }
}

/** The textual Library projection is derived from the already validated
 * structure for backwards-compatible history/review; it is not a parser. */
export function projectStudentDocumentToLegacyText(document: StudentDocumentV1): string {
  return document.blocks.flatMap(block => {
    if (block.type === 'heading') return [block.text]
    if (block.type === 'paragraph' || block.type === 'callout') return [block.text]
    if (block.type === 'list') return block.items.map(item => `• ${item}`)
    if (block.type === 'key_facts') return block.items.map(item => `${item.label}: ${item.value}`)
    if (block.type === 'timeline') return block.items.map(item => `${item.label}: ${item.text}`)
    if (block.type === 'references') return block.items.map(item => item.url ? `${item.title} — ${item.url}` : item.title)
    return []
  }).join('\n\n')
}

export function projectAdventurePackageToLegacyText(document: AdventurePackageV1): string {
  return [
    document.copy.hook,
    document.copy.whatMakesSpecial,
    ...document.copy.highlights,
    ...document.copy.sections.map(section => `${section.title}\n${section.copy}`),
    ...document.copy.practicalTips,
    document.copy.closingCopy,
    document.copy.cta,
  ].filter((value): value is string => Boolean(value)).join('\n\n')
}

function studentPayload(input: StructuredGenerationInput): Record<string, unknown> {
  return {
    destination: input.destination,
    masterKnowledge: input.masterKnowledge,
    evidence: evidencePayload(input.dossier),
    humanRedoGuidance: input.guidance ?? null,
    previousRevision: input.previousRevision ?? null,
    instruction: [
      'Devuelve StudentDocumentV1 nativo: headline, lead y blocks ordenados; no devuelvas Markdown ni texto para parsear.',
      'La composición es variable: omite secciones sin evidencia, exige un bloque informativo y no dejes bloques vacíos.',
      'Usa sólo masterKnowledge y evidence. Las figuras son intents con subject concreto, keywords y evidenceRefs; no inventes assetId.',
      'Incluye referencias públicas sólo cuando sean editorialmente pertinentes.',
    ].join(' '),
  }
}

function adventurePayload(input: StructuredGenerationInput): Record<string, unknown> {
  return {
    destination: input.destination,
    masterKnowledge: input.masterKnowledge,
    evidence: evidencePayload(input.dossier),
    humanRedoGuidance: input.guidance ?? null,
    previousRevision: input.previousRevision ?? null,
    instruction: [
      'Devuelve AdventurePackageV1 nativo, breve y visual-first; no derives copy del Student ni devuelvas Markdown.',
      'Usa sólo masterKnowledge y evidence. Hero y visualStory usan intents concretos, nunca assetId inventados ni búsquedas genéricas del destino.',
      'Places sólo si existe evidenceRefs; omite categorías sin evidencia y emite su supplemental gap tipado si es útil.',
      'visualStory es una única lista ordenada y sus sujetos son entidades concretas documentadas.',
    ].join(' '),
  }
}

function evidencePayload(dossier: RealResearchDossier) {
  return {
    sources: dossier.sources.map(source => ({ id: source.id, title: source.title, url: source.url, publisher: source.publisher ?? null })),
    evidence: dossier.evidence.map(item => ({ id: item.id, statement: item.statement, sourceIds: item.sourceIds })),
  }
}

function assertEvidenceReferences(values: Array<{ evidenceRefs: Array<{ kind: string; referenceId: string }> }>, input: StructuredGenerationInput): void {
  const references = new Set([
    ...input.masterKnowledge.claims.map(claim => `claim:${claim.id}`),
    ...input.dossier.evidence.map(evidence => `evidence:${evidence.id}`),
    ...input.dossier.sources.map(source => `source:${source.id}`),
  ])
  for (const value of values) for (const evidence of value.evidenceRefs) if (!references.has(`${evidence.kind}:${evidence.referenceId}`)) {
    throw new StructuredGenerationError('EVIDENCE_REFERENCE_UNKNOWN', `La referencia ${evidence.kind}:${evidence.referenceId} no existe en el corpus común`)
  }
}

function assertExactIntents(
  intents: VisualIntent[],
  referenced: Set<string>,
  purpose: VisualIntent['purpose'],
  linkedType: VisualIntent['linkedContent']['type'],
): void {
  for (const intent of intents) {
    if (!referenced.has(intent.id) || intent.purpose !== purpose || intent.linkedContent.type !== linkedType) {
      throw new StructuredGenerationError('ORPHAN_VISUAL_INTENT', `El intent ${intent.id} no corresponde a una figura Student`)
    }
  }
  for (const id of referenced) if (!intents.some(intent => intent.id === id)) {
    throw new StructuredGenerationError('ORPHAN_VISUAL_INTENT', `Falta el intent de figura ${id}`)
  }
}

export class StructuredGenerationError extends Error {
  constructor(readonly code: 'EVIDENCE_REFERENCE_UNKNOWN' | 'ORPHAN_VISUAL_INTENT', message: string) {
    super(message)
    this.name = 'StructuredGenerationError'
  }
}
