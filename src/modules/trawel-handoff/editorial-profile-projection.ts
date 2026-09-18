import type { LibraryTrawelApprovedSource } from '@shared/trawel-editorial-handoff-contracts'
import {
  TrawelEditorialProfileSchema,
  type TrawelEditorialDeliveryTarget,
  type TrawelEditorialProfile,
} from '@shared/trawel-editorial-delivery-contracts'
import {
  assertPublicSafeLibraryDocument,
  assertPublicSafeTrawelProfile,
} from '@modules/library-versioning/public-safe-content'

const REQUIRED_KINDS = {
  adventure: ['intro', 'overview', 'highlights', 'route', 'practical', 'risks'],
  student: ['intro', 'overview', 'budget', 'daily_life', 'study', 'practical', 'risks'],
} as const

type SectionKind = (typeof REQUIRED_KINDS)[keyof typeof REQUIRED_KINDS][number]
type EditorialProfile = keyof typeof REQUIRED_KINDS
interface ParsedSection { kind: string; heading: string; content: string; position: number }

export class TrawelEditorialProjectionError extends Error {
  constructor(readonly code: 'MISSING_SECTION' | 'MISSING_SOURCES' | 'AMBIGUOUS_SECTION' | 'INVALID_MARKDOWN', message: string) {
    super(message); this.name = 'TrawelEditorialProjectionError'
  }
}

/**
 * The durable text is eligible only when it declares canonical, machine-readable
 * headings: `## [intro]`, `## [overview]`, etc. Free-form Markdown is rejected.
 */
export function projectLibraryEntryToTrawelEditorialProfile(
  source: LibraryTrawelApprovedSource,
  target: TrawelEditorialDeliveryTarget,
): TrawelEditorialProfile {
  const sections = parseCanonicalMarkdown(source.currentApproved.content, source.entry.profile)
  const required = REQUIRED_KINDS[source.entry.profile]
  for (const kind of required) requireOne(sections, kind)
  assertPublicSafeLibraryDocument(source.currentApproved.title, source.currentApproved.content)

  const intro = requireOne(sections, 'intro').content
  const overview = requireOne(sections, 'overview').content
  const highlightsSection = sections.find(section => section.kind === 'highlights')
  const routeSection = sections.find(section => section.kind === 'route')
  const practicalTips = splitList(requireOne(sections, 'practical').content, 'practical')
  const excluded = new Set(['intro', 'overview', 'highlights', 'route', 'practical', 'sources'])
  const publicSources = projectDurablePublicSources(source)

  const profile = {
    headline: source.currentApproved.title,
    intro,
    whatMakesSpecial: overview,
    ...(highlightsSection ? { highlights: splitList(highlightsSection.content, 'highlights') } : {}),
    ...(routeSection ? { suggestedRoute: routeSection.content } : {}),
    practicalTips,
    sections: sections.filter(section => !excluded.has(section.kind)).map(section => ({ ...section })),
    sources: publicSources,
    metadata: {
      investighost: {
        profile: source.entry.profile,
        libraryEntryId: source.entry.entryId,
        transferId: source.entry.transferId,
        pilotId: source.entry.pilotId,
        runId: source.entry.runId,
        terminalDecisionId: source.entry.terminalDecisionId,
        target: {
          entityType: target.entityType,
          entitySlug: target.entitySlug,
          countrySlug: target.countrySlug,
          zoneSlug: target.zoneSlug,
        },
        currentApproved: {
          source: source.currentApproved.source,
          versionId: source.currentApproved.versionId,
          versionNumber: source.currentApproved.versionNumber,
          revisionId: source.currentApproved.revisionId,
          contentHash: source.currentApproved.contentHash,
          versionHash: source.currentApproved.versionHash,
          revisionHash: source.currentApproved.revisionHash,
          originVersionHash: source.currentApproved.originV1.originVersionHash,
          approvalDecisionId: source.currentApproved.approvalDecisionId ?? source.currentApproved.originV1.terminalDecisionId,
          approvedAt: source.currentApproved.approvedAt,
        },
      },
    },
  }
  const parsed = TrawelEditorialProfileSchema.parse(profile)
  assertPublicSafeTrawelProfile(parsed)
  return parsed
}

function parseCanonicalMarkdown(content: string, profile: EditorialProfile): ParsedSection[] {
  const normalized = content.replace(/\r\n/g, '\n').trim()
  const headings = [...normalized.matchAll(/^## ([^\n]+)\n/gm)]
  if (headings.length === 0 || headings[0]?.index !== 0) {
    throw new TrawelEditorialProjectionError('INVALID_MARKDOWN', 'El contenido no usa encabezados canónicos ## [kind]')
  }
  const seen = new Set<string>()
  return headings.map((match, position) => {
    const parsed = parseHeading(match[1] ?? '', profile)
    if (parsed === null) {
      throw new TrawelEditorialProjectionError('INVALID_MARKDOWN', 'El contenido contiene un encabezado no canónico')
    }
    const { kind, heading } = parsed
    if (seen.has(kind)) throw new TrawelEditorialProjectionError('AMBIGUOUS_SECTION', `La sección ${kind} está repetida`)
    seen.add(kind)
    const bodyStart = (match.index ?? 0) + match[0].length
    const bodyEnd = position + 1 < headings.length ? headings[position + 1]?.index ?? normalized.length : normalized.length
    const body = normalized.slice(bodyStart, bodyEnd).trim()
    if (!body) throw new TrawelEditorialProjectionError('INVALID_MARKDOWN', `La sección ${kind} está vacía`)
    return { kind, heading, content: body, position }
  })
}

function parseHeading(value: string, profile: EditorialProfile): Pick<ParsedSection, 'kind' | 'heading'> | null {
  const canonical = /^\[([a-z_]+)]\s*(.*)$/.exec(value)
  if (canonical !== null) {
    const kind = canonical[1] ?? ''
    return { kind, heading: (canonical[2] || kind).trim() }
  }
  if (profile === 'student' && value === 'Introducción') {
    return { kind: 'intro', heading: value }
  }
  return null
}

function projectDurablePublicSources(source: LibraryTrawelApprovedSource) {
  if (source.entry.sources.length === 0) {
    throw new TrawelEditorialProjectionError('MISSING_SOURCES', 'Faltan fuentes durables para la proyección pública')
  }
  return source.entry.sources.map(item => ({
    sourceId: item.id,
    title: item.title,
    url: item.url,
    publisher: item.publisher ?? null,
    publishedAt: item.publishedAt ?? null,
    contentHash: item.contentHash,
  })).sort((left, right) => left.sourceId.localeCompare(right.sourceId))
}

function requireOne(sections: ParsedSection[], kind: SectionKind): ParsedSection {
  const result = sections.filter(section => section.kind === kind)
  if (result.length !== 1) throw new TrawelEditorialProjectionError(
    result.length === 0 ? 'MISSING_SECTION' : 'AMBIGUOUS_SECTION',
    `Falta una sección ${kind} única`,
  )
  return result[0]!
}

function splitList(content: string, kind: string): string[] {
  const values = content.split('\n').map(line => line.trim().replace(/^(?:[-*]|\d+\.)\s+/, '').trim()).filter(Boolean)
  if (values.length === 0 || values.some(value => value === content.trim() && !/^[-*]|^\d+\./.test(content.trim()))) {
    throw new TrawelEditorialProjectionError('INVALID_MARKDOWN', `La sección ${kind} requiere una lista explícita`)
  }
  return values
}
