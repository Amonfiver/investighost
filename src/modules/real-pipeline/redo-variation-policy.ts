import type { AdventurePackageV1, StudentDocumentV1 } from '@shared/structured-editorial-package-contracts'

export type RedoVariationLevel = 'LIGHT' | 'CLEAR' | 'VERY_DIFFERENT'
export type RedoVariationResult = 'PASS' | 'FAIL'

/** The policy is deliberately lexical/structural: it is deterministic, cheap,
 * provider-neutral, and never asks an external service to judge an edit. */
export const VERY_DIFFERENT_SIMILARITY_THRESHOLD = 0.7
export const REDO_SIMILARITY_WARNING_THRESHOLD = 0.85
export const VERY_DIFFERENT_MAX_AUTOMATIC_RETRIES = 1

export interface RedoSimilarityMetrics {
  lexicalOverlap: number
  headlineOverlap: number
  structuralOverlap: number
  repeatedPhraseOverlap: number
  score: number
}

export interface RedoVariationAttempt {
  attempt: 1 | 2
  result: RedoVariationResult
  similarity: RedoSimilarityMetrics
  threshold: number
  retryTriggered: boolean
}

export interface RedoVariationTrace {
  variation: RedoVariationLevel
  attempts: RedoVariationAttempt[]
  targetMet: boolean
  warning: 'REDO_OUTPUT_TOO_SIMILAR_TO_PREVIOUS' | 'REDO_VARIATION_TARGET_NOT_MET' | null
}

export type RedoEditorialDocument = StudentDocumentV1 | AdventurePackageV1

export function measureRedoSimilarity(previous: RedoEditorialDocument, candidate: RedoEditorialDocument): RedoSimilarityMetrics {
  const left = signature(previous)
  const right = signature(candidate)
  const lexicalOverlap = overlap(tokens(left.text), tokens(right.text))
  const headlineOverlap = overlap(tokens(left.headline), tokens(right.headline))
  const structuralOverlap = overlap(new Set(left.structure), new Set(right.structure))
  const repeatedPhraseOverlap = overlap(phrases(left.text), phrases(right.text))
  // Text expression remains the principal signal. Structure is a secondary
  // signal so two independently written documents with the same valid shape
  // are not falsely rejected.
  const score = round((lexicalOverlap * 0.55) + (headlineOverlap * 0.25) + (structuralOverlap * 0.1) + (repeatedPhraseOverlap * 0.1))
  return { lexicalOverlap: round(lexicalOverlap), headlineOverlap: round(headlineOverlap), structuralOverlap: round(structuralOverlap), repeatedPhraseOverlap: round(repeatedPhraseOverlap), score }
}

export function assessRedoVariation(
  variation: RedoVariationLevel,
  previous: RedoEditorialDocument | undefined,
  candidate: RedoEditorialDocument,
): { result: RedoVariationResult; similarity: RedoSimilarityMetrics; threshold: number; warning: RedoVariationTrace['warning'] } {
  const similarity = previous ? measureRedoSimilarity(previous, candidate) : emptyMetrics()
  const threshold = variation === 'VERY_DIFFERENT' ? VERY_DIFFERENT_SIMILARITY_THRESHOLD : REDO_SIMILARITY_WARNING_THRESHOLD
  if (variation === 'VERY_DIFFERENT' && previous && similarity.score >= threshold) {
    return { result: 'FAIL', similarity, threshold, warning: 'REDO_OUTPUT_TOO_SIMILAR_TO_PREVIOUS' }
  }
  const warning = variation !== 'VERY_DIFFERENT' && previous && similarity.score >= threshold
    ? 'REDO_OUTPUT_TOO_SIMILAR_TO_PREVIOUS'
    : null
  return { result: 'PASS', similarity, threshold, warning }
}

/** Applies the one-retry rule without knowing anything about an LLM provider.
 * The runtime supplies the retry generator only after its own budget and
 * cancellation checks have passed. */
export async function enforceRedoVariation<T extends RedoEditorialDocument>(input: {
  variation: RedoVariationLevel
  previous?: RedoEditorialDocument
  first: T
  canRetry: boolean
  generateRetry?: () => Promise<T>
  onTrace?: (trace: RedoVariationTrace) => Promise<void> | void
}): Promise<{ candidate: T; trace: RedoVariationTrace }> {
  const first = assessRedoVariation(input.variation, input.previous, input.first)
  const firstAttempt: RedoVariationAttempt = {
    attempt: 1, result: first.result, similarity: first.similarity, threshold: first.threshold,
    retryTriggered: input.variation === 'VERY_DIFFERENT' && first.result === 'FAIL' && input.canRetry && Boolean(input.generateRetry),
  }
  if (input.variation !== 'VERY_DIFFERENT' || first.result === 'PASS') {
    const trace = { variation: input.variation, attempts: [firstAttempt], targetMet: true, warning: first.warning } satisfies RedoVariationTrace
    await input.onTrace?.(trace)
    return { candidate: input.first, trace }
  }
  if (!input.canRetry || !input.generateRetry) {
    const trace = { variation: input.variation, attempts: [firstAttempt], targetMet: false, warning: 'REDO_VARIATION_TARGET_NOT_MET' } satisfies RedoVariationTrace
    await input.onTrace?.(trace)
    return { candidate: input.first, trace }
  }
  await input.onTrace?.({ variation: input.variation, attempts: [firstAttempt], targetMet: false, warning: first.warning })
  const retry = await input.generateRetry()
  const second = assessRedoVariation(input.variation, input.previous, retry)
  const secondAttempt: RedoVariationAttempt = {
    attempt: 2, result: second.result, similarity: second.similarity, threshold: second.threshold, retryTriggered: false,
  }
  const trace = second.result === 'PASS'
    ? { variation: input.variation, attempts: [firstAttempt, secondAttempt], targetMet: true, warning: null }
    : { variation: input.variation, attempts: [firstAttempt, secondAttempt], targetMet: false, warning: 'REDO_VARIATION_TARGET_NOT_MET' } satisfies RedoVariationTrace
  await input.onTrace?.(trace)
  return { candidate: retry, trace }
}

export function veryDifferentConstraint(attempt: 1 | 2): string {
  const retry = attempt === 2 ? ' El primer intento no alcanzó el objetivo: cambia de nuevo la organización y la apertura.' : ''
  return `Restricción VERY_DIFFERENT: no reutilices el headline/título anterior ni la misma apertura; cambia el enfoque narrativo, el orden y selección de secciones cuando la evidencia lo permita, y evita frases o estructuras demasiado similares. Conserva estrictamente hechos y evidencia verificados.${retry}`
}

function signature(document: RedoEditorialDocument): { headline: string; text: string; structure: string[] } {
  if (document.version === 'student-document-v1') {
    const blocks = document.blocks.map(block => {
      if (block.type === 'heading' || block.type === 'paragraph' || block.type === 'callout') return `${block.type}:${block.text}`
      if (block.type === 'list') return `${block.type}:${block.items.join(' ')}`
      if (block.type === 'key_facts') return `${block.type}:${block.items.map(item => `${item.label} ${item.value}`).join(' ')}`
      if (block.type === 'timeline') return `${block.type}:${block.items.map(item => `${item.label} ${item.text}`).join(' ')}`
      if (block.type === 'references') return `${block.type}:${block.items.map(item => item.title).join(' ')}`
      return `${block.type}:${block.resolution === 'RESOLVED' ? `${block.alt} ${block.caption ?? ''}` : block.altHint}`
    })
    return { headline: document.headline, text: [document.headline, ...document.lead, ...blocks].join(' '), structure: document.blocks.map(block => block.type) }
  }
  const copy = document.copy
  const story = [...document.visualStory.items].sort((a, b) => a.order - b.order)
    .map(item => [item.title, item.kicker, item.shortCopy, item.caption, item.cta].filter(Boolean).join(' '))
  const places = [...document.placesToGo.items].sort((a, b) => a.category.localeCompare(b.category) || a.order - b.order)
    .map(item => `${item.category} ${item.name} ${item.shortDescription} ${item.reasonToGo} ${item.caption ?? ''}`)
  return {
    headline: copy.headline,
    text: [copy.headline, copy.hook, copy.whatMakesSpecial, ...copy.highlights, ...copy.sections.flatMap(section => [section.title, section.copy]), ...copy.practicalTips, copy.closingCopy, copy.cta, document.hero.title, document.hero.shortCopy, document.hero.kicker, document.hero.caption, document.hero.cta, ...story, ...places].filter(Boolean).join(' '),
    structure: ['copy', ...copy.sections.map(() => 'section'), 'hero', ...story.map(() => 'visual-story'), ...places.map(place => `place:${place.split(' ', 1)[0]}`)],
  }
}

function tokens(value: string): Set<string> { return new Set(value.toLocaleLowerCase('es').match(/[\p{L}\p{N}]{4,}/gu) ?? []) }
function phrases(value: string): Set<string> {
  const values = [...tokens(value)]
  return new Set(values.slice(0, -2).map((token, index) => `${token} ${values[index + 1]} ${values[index + 2]}`))
}
function overlap(left: Set<string>, right: Set<string>): number { return [...left].filter(value => right.has(value)).length / Math.max(1, Math.min(left.size, right.size)) }
function round(value: number): number { return Math.round(value * 10_000) / 10_000 }
function emptyMetrics(): RedoSimilarityMetrics { return { lexicalOverlap: 0, headlineOverlap: 0, structuralOverlap: 0, repeatedPhraseOverlap: 0, score: 0 } }
