import { assertPublicSafeLibraryDocument } from './public-safe-content'

export type EditorialDepthProfile = 'adventure' | 'student'

export interface EditorialEvidenceCapacity {
  validClaimCount: number
  thematicAreas: readonly string[]
  namedPlaces: readonly string[]
}

export interface EditorialDepthInput {
  profile: EditorialDepthProfile
  title: string
  content: string
  evidence: EditorialEvidenceCapacity
  /** A durable editorial decision. It permits brevity; it never fabricates depth. */
  sourceLimited: boolean
}

export interface EditorialDepthAssessment {
  contentTooThin: boolean
  sourceLimited: boolean
  wordCount: number
  sectionsWithContent: number
  developedThemes: number
  reasons: string[]
}

export interface EditorialReadabilityAssessment {
  readability: boolean
  scannability: boolean
  paragraphCount: number
  longParagraphCount: number
  reasons: string[]
}

export interface StudentEducationalAssessment {
  studentDepth: boolean
  studentEducationalValue: boolean
  wordCount: number
  thematicCoverage: number
  namedPlaceCoverage: number
  datesUsed: number
  questionsIncluded: number
  reasons: string[]
}

const requiredSections: Record<EditorialDepthProfile, readonly string[]> = {
  adventure: ['intro', 'overview', 'highlights', 'route', 'practical', 'risks'],
  student: ['intro', 'overview', 'budget', 'daily_life', 'study', 'practical', 'risks'],
}

const profileSignals: Record<EditorialDepthProfile, readonly string[]> = {
  adventure: ['explor', 'recorr', 'paisaje', 'naturaleza', 'actividad', 'serran', 'ruta'],
  student: ['aprender', 'observar', 'comprender', 'historia', 'concepto', 'pregunta', 'estudi'],
}

interface ParsedSection { kind: string; content: string }

/**
 * Assesses editorial use of the evidence already available.  It intentionally
 * combines coverage, block development and profile purpose: a word count alone
 * can never turn padding into a pass.
 */
export function assessEditorialDepth(input: EditorialDepthInput): EditorialDepthAssessment {
  assertPublicSafeLibraryDocument(input.title, input.content)
  const sections = parseSections(input.content)
  const words = wordCount(input.content)
  const reasons: string[] = []
  const required = requiredSections[input.profile]
  const byKind = new Map(sections.map(section => [section.kind, section.content]))
  const populated = required.filter(kind => Boolean(byKind.get(kind)?.trim()))
  const evidenceAbundant = input.evidence.validClaimCount >= 8 && input.evidence.thematicAreas.length >= 5

  for (const kind of required) {
    const content = byKind.get(kind)
    if (!content) reasons.push(`missing:${kind}`)
    else if (!input.sourceLimited && wordCount(content) < 32) reasons.push(`underdeveloped:${kind}`)
  }

  const highlights = listItems(byKind.get('highlights') ?? '')
  if (input.profile === 'adventure' && highlights.length < 4 && !input.sourceLimited) {
    reasons.push('highlights:insufficient-development')
  }
  const practical = listItems(byKind.get('practical') ?? '')
  if (practical.length < 3 && !input.sourceLimited) reasons.push('practical:insufficient-development')
  if (input.profile === 'student' && !input.sourceLimited && wordCount(byKind.get('study') ?? '') < 220) {
    reasons.push('study:insufficient-development')
  }

  const normalized = normalize(input.content)
  const developedThemes = [...new Set([...input.evidence.thematicAreas, ...input.evidence.namedPlaces]
    .filter(item => normalize(item).split(' ').some(token => token.length > 3 && normalized.includes(token))))].length
  const requiredThemes = input.profile === 'adventure' ? 5 : 6
  if (!input.sourceLimited && developedThemes < Math.min(requiredThemes, input.evidence.thematicAreas.length)) {
    reasons.push('coverage:available-themes-unused')
  }
  if (evidenceAbundant && !input.sourceLimited && words < 700) reasons.push('length:coverage-incompatible')

  return {
    contentTooThin: reasons.length > 0,
    sourceLimited: input.sourceLimited,
    wordCount: words,
    sectionsWithContent: populated.length,
    developedThemes,
    reasons,
  }
}

/** Throws an explicit gate error suitable for an approval workflow. */
export function assertContentNotTooThin(input: EditorialDepthInput): EditorialDepthAssessment {
  const assessment = assessEditorialDepth(input)
  if (assessment.contentTooThin) {
    throw new EditorialDepthPolicyError('CONTENT_TOO_THIN', assessment.reasons.join(', '))
  }
  return assessment
}

export function assertProfilesDifferentiated(
  adventure: Pick<EditorialDepthInput, 'title' | 'content'>,
  student: Pick<EditorialDepthInput, 'title' | 'content'>,
): void {
  assertPublicSafeLibraryDocument(adventure.title, adventure.content)
  assertPublicSafeLibraryDocument(student.title, student.content)
  const adventureSections = new Set(parseSections(adventure.content).map(section => section.kind))
  const studentSections = new Set(parseSections(student.content).map(section => section.kind))
  const adventureWords = significantTokens(adventure.content)
  const studentWords = significantTokens(student.content)
  const overlap = [...adventureWords].filter(token => studentWords.has(token)).length
  const union = new Set([...adventureWords, ...studentWords]).size
  const similarity = union === 0 ? 1 : overlap / union
  const adventureFocused = profileSignals.adventure.some(signal => normalize(adventure.content).includes(signal))
  const studentFocused = profileSignals.student.some(signal => normalize(student.content).includes(signal))
  const structuralDifference = adventureSections.has('highlights') && adventureSections.has('route')
    && studentSections.has('study') && studentSections.has('daily_life') && studentSections.has('budget')
  if (!structuralDifference || !adventureFocused || !studentFocused || similarity >= 0.68) {
    throw new EditorialDepthPolicyError('PROFILE_DIFFERENTIATION', `similarity:${similarity.toFixed(2)}`)
  }
}

/**
 * Consumer-facing quality gate. It protects useful depth from becoming a wall
 * of prose: it evaluates hierarchy and early utility in addition to density.
 */
export function assessEditorialReadability(input: Pick<EditorialDepthInput, 'profile' | 'title' | 'content'>): EditorialReadabilityAssessment {
  assertPublicSafeLibraryDocument(input.title, input.content)
  const sections = parseSections(input.content)
  const byKind = new Map(sections.map(section => [section.kind, section.content]))
  const paragraphs = sections.flatMap(section => proseParagraphs(section.content))
  const longParagraphCount = paragraphs.filter(paragraph => wordCount(paragraph) > 130).length
  const reasons: string[] = []
  const introWords = wordCount(byKind.get('intro') ?? '')
  const operationalPrompts = (normalize(input.content).match(/\b(?:confirma|comprueba|verifica|consulta)\b/g)?.length ?? 0)

  if (introWords > 165) reasons.push('intro:too-long')
  if (longParagraphCount > 0) reasons.push('paragraphs:too-long')
  if (operationalPrompts > 6) reasons.push('practical:repetitive')

  if (input.profile === 'adventure') {
    if (listItems(byKind.get('highlights') ?? '').length < 5) reasons.push('highlights:not-scannable')
    if (!byKind.get('route') || !byKind.get('practical')) reasons.push('plan:missing')
  } else {
    if (!byKind.get('overview') || !byKind.get('study') || !byKind.get('daily_life')) reasons.push('learning:missing')
    if ((byKind.get('study')?.match(/¿/g)?.length ?? 0) < 2) reasons.push('study:questions-missing')
    if (listItems(byKind.get('practical') ?? '').length < 3) reasons.push('practical:not-scannable')
  }

  const scannability = !reasons.some(reason => /(?:not-scannable|missing|questions)/.test(reason))
  const readability = !reasons.some(reason => /(?:too-long|repetitive)/.test(reason))
  return { readability, scannability, paragraphCount: paragraphs.length, longParagraphCount, reasons }
}

export function assertReadableAndScannable(input: Pick<EditorialDepthInput, 'profile' | 'title' | 'content'>): EditorialReadabilityAssessment {
  const assessment = assessEditorialReadability(input)
  if (!assessment.readability) throw new EditorialDepthPolicyError('READABILITY', assessment.reasons.join(', '))
  if (!assessment.scannability) throw new EditorialDepthPolicyError('SCANNABILITY', assessment.reasons.join(', '))
  return assessment
}

/** Student needs a real learning journey, not a renamed short tourist profile. */
export function assessStudentEducationalValue(input: Omit<EditorialDepthInput, 'profile'>): StudentEducationalAssessment {
  assertPublicSafeLibraryDocument(input.title, input.content)
  const normalized = normalize(input.content)
  const sections = new Set(parseSections(input.content).map(section => section.kind))
  const words = wordCount(input.content)
  const themeCoverage = input.evidence.thematicAreas.filter(theme => normalized.includes(normalize(theme))).length
  const namedPlaceCoverage = input.evidence.namedPlaces.filter(place => normalize(place).split(' ')
    .some(token => token.length > 3 && normalized.includes(token))).length
  const datesUsed = ['1177', '1966', '1996'].filter(date => input.content.includes(date)).length
  const questionsIncluded = input.content.match(/¿/g)?.length ?? 0
  const reasons: string[] = []
  const requiredLearningBlocks = ['history', 'heritage', 'art_culture', 'nature_science', 'observation', 'study']

  if (input.evidence.validClaimCount >= 8 && input.evidence.thematicAreas.length >= 5 && words < 850) {
    reasons.push('student:insufficient-usable-depth')
  }
  if (themeCoverage < Math.min(6, input.evidence.thematicAreas.length)) reasons.push('student:themes-underused')
  if (namedPlaceCoverage < Math.min(9, input.evidence.namedPlaces.length)) reasons.push('student:places-underdeveloped')
  if (datesUsed < 3) reasons.push('student:dates-underused')
  if (questionsIncluded < 4) reasons.push('student:questions-underdeveloped')
  if (requiredLearningBlocks.some(kind => !sections.has(kind))) reasons.push('student:learning-structure-missing')

  const studentDepth = !reasons.some(reason => /(?:usable-depth|themes|places|dates|structure)/.test(reason))
  const studentEducationalValue = studentDepth && questionsIncluded >= 4
  return { studentDepth, studentEducationalValue, wordCount: words, thematicCoverage: themeCoverage, namedPlaceCoverage, datesUsed, questionsIncluded, reasons }
}

export function assertStudentEducationalValue(input: Omit<EditorialDepthInput, 'profile'>): StudentEducationalAssessment {
  const assessment = assessStudentEducationalValue(input)
  if (!assessment.studentDepth) throw new EditorialDepthPolicyError('STUDENT_DEPTH', assessment.reasons.join(', '))
  if (!assessment.studentEducationalValue) throw new EditorialDepthPolicyError('STUDENT_EDUCATIONAL_VALUE', assessment.reasons.join(', '))
  return assessment
}

export class EditorialDepthPolicyError extends Error {
  constructor(readonly code: 'CONTENT_TOO_THIN' | 'PROFILE_DIFFERENTIATION' | 'READABILITY' | 'SCANNABILITY' | 'STUDENT_DEPTH' | 'STUDENT_EDUCATIONAL_VALUE', detail: string) {
    super(`${code}:${detail}`)
    this.name = 'EditorialDepthPolicyError'
  }
}

function parseSections(content: string): ParsedSection[] {
  const normalized = content.replace(/\r\n/g, '\n').trim()
  const headings = [...normalized.matchAll(/^## \[([a-z_]+)](?: [^\n]+)?\n/gm)]
  return headings.map((match, index) => ({
    kind: match[1] ?? '',
    content: normalized.slice(
      (match.index ?? 0) + match[0].length,
      index + 1 < headings.length ? headings[index + 1]?.index ?? normalized.length : normalized.length,
    ).trim(),
  }))
}

function listItems(content: string): string[] {
  return content.split('\n').filter(line => /^(?:[-*]|\d+\.)\s+\S/.test(line.trim()))
}

function proseParagraphs(content: string): string[] {
  return content.split(/\n\s*\n/u)
    .map(block => block.trim())
    .filter(block => block.length > 0 && !block.split('\n').every(line => /^(?:[-*]|\d+\.)\s+/.test(line.trim())))
}

function wordCount(content: string): number {
  return content.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)?.length ?? 0
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es')
}

function significantTokens(value: string): Set<string> {
  const stop = new Set(['para', 'como', 'desde', 'entre', 'sobre', 'esta', 'este', 'cuenca', 'espana', 'con', 'por', 'una', 'unos', 'unas', 'del', 'las', 'los', 'que', 'sus', 'sin', 'antes'])
  return new Set((normalize(value).match(/[a-z]{4,}/g) ?? []).filter(token => !stop.has(token)))
}
