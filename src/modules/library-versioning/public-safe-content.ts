import type { TrawelEditorialProfile } from '@shared/trawel-editorial-delivery-contracts'

/**
 * Library retains the full editorial ledger.  This gate protects only the
 * consumer-facing body that can become currentApproved and cross the V2 edge.
 */
export const PUBLIC_SAFE_CONTENT_CONTRACT = 'investighost-public-safe-content-v1' as const

export type PublicSafeViolationCode =
  | 'CLAIM_ID'
  | 'EVIDENCE_ID'
  | 'GAP_ID'
  | 'INTERNAL_EDITORIAL_LANGUAGE'
  | 'INTERNAL_METADATA_KEY'
  | 'INTERNAL_STATE'
  | 'TECHNICAL_HEADING'
  | 'VISIBLE_MARKDOWN_ESCAPE'

export class PublicSafeContentError extends Error {
  constructor(readonly code: PublicSafeViolationCode, readonly marker: string) {
    super(`PUBLIC_SAFE_${code}:${marker}`)
    this.name = 'PublicSafeContentError'
  }
}

const forbidden: ReadonlyArray<readonly [PublicSafeViolationCode, RegExp]> = [
  ['CLAIM_ID', /\(\s*c\d+(?:\s*,\s*c\d+)*\s*\)/iu],
  ['CLAIM_ID', /\bc\d+\b/iu],
  ['EVIDENCE_ID', /\be\d+\b/iu],
  ['GAP_ID', /\bg\d+\b/iu],
  ['INTERNAL_EDITORIAL_LANGUAGE', /\b(?:el|este|this) (?:expediente|dossier)\b/iu],
  ['INTERNAL_EDITORIAL_LANGUAGE', /\b(?:evidence ledger|audit trail|review notes|provenance|claim conflict|this dossier)\b/iu],
  ['INTERNAL_EDITORIAL_LANGUAGE', /\b(?:contradicciones declaradas|lenguaje de auditor[ií]a|instrucciones de revisi[oó]n)\b/iu],
  ['INTERNAL_METADATA_KEY', /\b(?:claimId|evidenceId|gapId|libraryEntryId|versionId|revisionId|approvalDecisionId|handoffKey|payloadFingerprint|schemaVersion)\b/iu],
  ['INTERNAL_STATE', /\b(?:resolved_editorially|accepted_risk|draft_only|pending_trawel_review|currentApproved|ready_for_review|approved_unpublished|review_required|changes_requested)\b/iu],
  ['VISIBLE_MARKDOWN_ESCAPE', /\\(?:\*|_|`|\[|\]|#)/u],
]

/** Allows V2 structural delimiters in Library while rejecting a visual Markdown heading. */
function consumerBody(content: string): string {
  return content.replace(/^## (?:\[[a-z_]+\](?:\s+[^\n]+)?|Introducción)\s*$/gmu, '')
}

export function assertPublicSafeLibraryContent(content: string): void {
  const invalidHeading = content.match(/^## (?!\[[a-z_]+\](?:\s|$)|Introducción$).+$/gmu)?.[0]
  if (invalidHeading) throw new PublicSafeContentError('TECHNICAL_HEADING', invalidHeading)
  assertPublicSafeText(consumerBody(content))
}

/** Validates every user-visible field before a revision can become currentApproved. */
export function assertPublicSafeLibraryDocument(title: string, content: string): void {
  assertPublicSafeText(title)
  assertPublicSafeLibraryContent(content)
}

export function assertPublicSafeTrawelProfile(profile: TrawelEditorialProfile): void {
  const strings = [
    profile.headline, profile.intro, profile.whatMakesSpecial, profile.suggestedRoute ?? '',
    ...(profile.highlights ?? []), ...profile.practicalTips,
    ...profile.sections.flatMap(section => [section.heading, section.content]),
    ...profile.sources.flatMap(source => [source.title, source.publisher ?? '']),
  ]
  assertPublicSafeText(strings.join('\n'))
}

export function assertPublicSafeText(value: string): void {
  for (const [code, pattern] of forbidden) {
    const match = value.match(pattern)?.[0]
    if (match) throw new PublicSafeContentError(code, match)
  }
}
