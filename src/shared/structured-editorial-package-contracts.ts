import { z } from 'zod'
import { LibraryVersionSha256Schema, LibraryVersionUuidSchema } from './real-editorial-library-contracts'

export const STUDENT_DOCUMENT_V1 = 'student-document-v1' as const
export const ADVENTURE_PACKAGE_V1 = 'adventure-package-v1' as const
export const STRUCTURED_EDITORIAL_PACKAGE_V1 = 'structured-editorial-package-v1' as const

const Text = z.string().trim().min(1).max(20_000)
const ShortText = z.string().trim().min(1).max(2_000)
const OptionalText = z.string().trim().min(1).max(2_000).optional()
const Url = z.string().url().refine(value => new URL(value).protocol === 'https:', 'La URL debe usar HTTPS')

export const EditorialEvidenceReferenceSchema = z.object({
  kind: z.enum(['claim', 'evidence', 'source']),
  referenceId: z.string().trim().min(1).max(200),
}).strict()

const EvidenceReferencesSchema = z.array(EditorialEvidenceReferenceSchema).min(1).max(100).superRefine((value, context) => {
  const keys = value.map(reference => `${reference.kind}:${reference.referenceId}`)
  if (new Set(keys).size !== keys.length) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Las referencias de evidencia no pueden repetirse' })
})

export const SupplementalResearchGapTypeSchema = z.enum([
  'MISSING_STAY_EVIDENCE',
  'MISSING_EAT_EVIDENCE',
  'MISSING_DRINK_EVIDENCE',
  'MISSING_NIGHTLIFE_EVIDENCE',
  'MISSING_VISUAL_ENTITY_EVIDENCE',
])

export const SupplementalResearchGapSchema = z.object({
  type: SupplementalResearchGapTypeSchema,
  description: ShortText,
  evidenceRefs: EvidenceReferencesSchema,
  targetedQueryHint: ShortText.optional(),
}).strict()

export const VisualIntentPurposeSchema = z.enum([
  'STUDENT_FIGURE', 'ADVENTURE_HERO', 'VISUAL_STORY', 'PLACE_ASSET',
])
export const VisualIntentDesiredRoleSchema = z.enum(['HERO', 'HIGHLIGHT', 'GALLERY', 'FIGURE', 'PLACE'])
export const VisualIntentPlacementSchema = z.enum(['INLINE', 'WIDE', 'OVERLAY', 'BELOW_MEDIA', 'CARD_OVERLAY'])

export const VisualIntentSchema = z.object({
  id: LibraryVersionUuidSchema,
  purpose: VisualIntentPurposeSchema,
  subject: ShortText,
  keywords: z.array(ShortText).min(1).max(20),
  context: ShortText,
  desiredRole: VisualIntentDesiredRoleSchema,
  desiredPlacement: VisualIntentPlacementSchema.optional(),
  linkedContent: z.object({
    type: z.enum(['STUDENT_BLOCK', 'HERO', 'VISUAL_STORY_ITEM', 'PLACE']),
    id: LibraryVersionUuidSchema,
  }).strict(),
  evidenceRefs: EvidenceReferencesSchema,
}).strict()

const ResolvedAssetReferenceSchema = z.object({
  status: z.literal('RESOLVED'),
  assetId: LibraryVersionUuidSchema,
}).strict()
const IntentAssetReferenceSchema = z.object({
  status: z.literal('INTENT'),
  visualIntentId: LibraryVersionUuidSchema,
}).strict()
export const EditorialAssetReferenceSchema = z.discriminatedUnion('status', [ResolvedAssetReferenceSchema, IntentAssetReferenceSchema])

const ParagraphBlockSchema = z.object({ type: z.literal('paragraph'), text: Text }).strict()
const HeadingBlockSchema = z.object({ type: z.literal('heading'), level: z.union([z.literal(2), z.literal(3)]), text: ShortText, id: z.string().trim().min(1).max(160).optional() }).strict()
const FigureIntentBlockSchema = z.object({
  type: z.literal('figure'), resolution: z.literal('INTENT'), visualIntentId: LibraryVersionUuidSchema,
  placement: z.enum(['INLINE', 'WIDE']), altHint: ShortText,
}).strict()
const FigureResolvedBlockSchema = z.object({
  type: z.literal('figure'), resolution: z.literal('RESOLVED'), assetId: LibraryVersionUuidSchema,
  placement: z.enum(['INLINE', 'WIDE']), alt: ShortText, caption: OptionalText,
}).strict()
const ListBlockSchema = z.object({ type: z.literal('list'), style: z.enum(['unordered', 'ordered']), items: z.array(ShortText).min(1).max(100) }).strict()
const KeyFactsBlockSchema = z.object({ type: z.literal('key_facts'), title: OptionalText, items: z.array(z.object({ label: ShortText, value: ShortText }).strict()).min(1).max(100) }).strict()
const CalloutBlockSchema = z.object({ type: z.literal('callout'), tone: z.enum(['NOTE', 'CONTEXT', 'DEFINITION']), title: OptionalText, text: Text }).strict()
const TimelineBlockSchema = z.object({ type: z.literal('timeline'), title: OptionalText, items: z.array(z.object({ label: ShortText, text: Text }).strict()).min(1).max(100) }).strict()
const ReferencesBlockSchema = z.object({ type: z.literal('references'), items: z.array(z.object({ label: OptionalText, title: ShortText, source: OptionalText, url: Url.optional() }).strict()).min(1).max(500) }).strict()

export const StudentBlockSchema = z.union([
  ParagraphBlockSchema, HeadingBlockSchema, FigureIntentBlockSchema, FigureResolvedBlockSchema,
  ListBlockSchema, KeyFactsBlockSchema, CalloutBlockSchema, TimelineBlockSchema, ReferencesBlockSchema,
])

export const StudentDocumentV1Schema = z.object({
  version: z.literal(STUDENT_DOCUMENT_V1),
  headline: ShortText,
  lead: z.array(Text).max(20),
  blocks: z.array(StudentBlockSchema).min(1).max(500),
}).strict().superRefine((value, context) => {
  if (!value.blocks.some(block => block.type !== 'heading')) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['blocks'], message: 'Student requiere al menos un bloque informativo no heading' })
  }
  const ids = value.blocks.flatMap(block => block.type === 'heading' && block.id ? [block.id] : [])
  if (new Set(ids).size !== ids.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['blocks'], message: 'Los ids de heading deben ser únicos' })
})

export const PresentationToneSchema = z.enum(['IMPACT', 'ADVENTURE', 'CULTURE', 'LANDSCAPE', 'FOOD', 'LOCAL_LIFE', 'NIGHT', 'CALM', 'PREMIUM'])
export const TextPlacementSchema = z.enum(['OVERLAY', 'BELOW_MEDIA', 'CARD_OVERLAY', 'INLINE'])

export const AdventureCopySchema = z.object({
  headline: ShortText,
  hook: Text,
  whatMakesSpecial: OptionalText,
  highlights: z.array(ShortText).max(30),
  sections: z.array(z.object({ id: LibraryVersionUuidSchema, title: ShortText, copy: Text, evidenceRefs: EvidenceReferencesSchema }).strict()).max(30),
  practicalTips: z.array(ShortText).max(30),
  closingCopy: OptionalText,
  cta: OptionalText,
  evidenceRefs: EvidenceReferencesSchema,
}).strict()

export const HeroSchema = z.object({
  asset: EditorialAssetReferenceSchema,
  title: ShortText,
  shortCopy: ShortText,
  presentationTone: PresentationToneSchema,
  textPlacement: TextPlacementSchema,
  kicker: OptionalText,
  caption: OptionalText,
  cta: OptionalText,
  evidenceRefs: EvidenceReferencesSchema,
}).strict()

export const DestinationVisualStoryItemSchema = z.object({
  id: LibraryVersionUuidSchema,
  asset: EditorialAssetReferenceSchema,
  order: z.number().int().nonnegative(),
  title: OptionalText,
  kicker: OptionalText,
  shortCopy: OptionalText,
  caption: OptionalText,
  presentationTone: PresentationToneSchema,
  textPlacement: TextPlacementSchema,
  linkedAdventureSection: LibraryVersionUuidSchema.optional(),
  cta: OptionalText,
  evidenceRefs: EvidenceReferencesSchema,
}).strict()

export const DestinationVisualStorySchema = z.object({
  items: z.array(DestinationVisualStoryItemSchema).max(30),
}).strict().superRefine((value, context) => {
  const orders = value.items.map(item => item.order)
  if (new Set(orders).size !== orders.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['items'], message: 'Visual Story no puede repetir order' })
})

export const PlaceCategorySchema = z.enum(['STAY', 'EAT', 'DRINK', 'NIGHTLIFE'])
export const PlaceToGoSchema = z.object({
  id: LibraryVersionUuidSchema,
  category: PlaceCategorySchema,
  name: ShortText,
  order: z.number().int().nonnegative(),
  area: OptionalText,
  asset: EditorialAssetReferenceSchema.optional(),
  shortDescription: Text,
  reasonToGo: Text,
  caption: OptionalText,
  presentationTone: PresentationToneSchema.optional(),
  address: OptionalText,
  url: Url.optional(),
  coordinates: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }).strict().optional(),
  evidenceRefs: EvidenceReferencesSchema,
}).strict()

export const PlacesToGoSchema = z.object({
  items: z.array(PlaceToGoSchema).max(100),
  supplementalGaps: z.array(SupplementalResearchGapSchema).max(20),
}).strict().superRefine((value, context) => {
  const keys = value.items.map(item => `${item.category}:${item.order}`)
  if (new Set(keys).size !== keys.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['items'], message: 'No puede repetirse order dentro de una categoría de Places' })
})

export const AdventurePackageV1Schema = z.object({
  version: z.literal(ADVENTURE_PACKAGE_V1),
  copy: AdventureCopySchema,
  hero: HeroSchema,
  visualStory: DestinationVisualStorySchema,
  placesToGo: PlacesToGoSchema,
}).strict()

export const LibraryRevisionReferenceSchema = z.object({
  libraryEntryId: LibraryVersionUuidSchema,
  versionId: LibraryVersionUuidSchema,
  revisionId: LibraryVersionUuidSchema,
  revisionHash: LibraryVersionSha256Schema,
}).strict()

export const StructuredEditorialPackageStateSchema = z.enum([
  'DRAFT', 'STRUCTURED_GENERATED', 'VISUALS_PENDING', 'VISUALS_RESOLVED',
  'CAPTIONS_RESOLVED', 'PACKAGE_READY_FOR_REVIEW', 'READY_FOR_REVIEW', 'APPROVED',
])

/** A resolved slot retains its original intent in visualIntents.  This makes
 * visual revisions reviewable without re-inferring editorial intent. */
export const VisualResolutionReasonSchema = z.enum([
  'NO_CANDIDATES', 'RIGHTS_NOT_APPROVED', 'DIMENSIONS_REJECTED', 'ASPECT_REJECTED',
  'DUPLICATE_CONFLICT', 'ENTITY_MATCH_TOO_WEAK',
])
export const VisualResolvedSlotSchema = z.object({
  intentId: LibraryVersionUuidSchema,
  candidateId: LibraryVersionUuidSchema,
  assetId: LibraryVersionUuidSchema,
  checksum: LibraryVersionSha256Schema,
  score: z.number().finite(),
  rightsStatus: z.literal('APPROVED_FOR_PUBLIC_USE'),
  alt: ShortText,
  caption: OptionalText,
  shortCopy: OptionalText,
  cta: OptionalText,
}).strict()
export const VisualUnresolvedSlotSchema = z.object({
  intentId: LibraryVersionUuidSchema,
  reason: VisualResolutionReasonSchema,
}).strict()
export const StructuredVisualResolutionSchema = z.object({
  visualRevisionId: LibraryVersionUuidSchema,
  sourceVisualPackageId: LibraryVersionUuidSchema.optional(),
  state: z.enum(['VISUALS_PENDING', 'VISUALS_RESOLVED', 'CAPTIONS_RESOLVED', 'PACKAGE_READY_FOR_REVIEW']),
  resolved: z.array(VisualResolvedSlotSchema).max(200),
  unresolved: z.array(VisualUnresolvedSlotSchema).max(200),
  generatedAt: z.string().datetime({ offset: true }),
}).strict().superRefine((value, context) => {
  const ids = [...value.resolved.map(slot => slot.intentId), ...value.unresolved.map(slot => slot.intentId)]
  if (new Set(ids).size !== ids.length) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Un intent visual sólo puede tener una resolución por revisión' })
  if (value.state === 'CAPTIONS_RESOLVED' && value.resolved.some(slot => !slot.alt)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Captions resueltas requieren alt contextual' })
})
export const StructuredEditorialPackageV1Schema = z.object({
  version: z.literal(STRUCTURED_EDITORIAL_PACKAGE_V1),
  packageId: LibraryVersionUuidSchema,
  executionId: LibraryVersionUuidSchema,
  destinationId: LibraryVersionUuidSchema,
  /** The single durable corpus consumed directly by both generators. */
  masterKnowledgeArtifactId: LibraryVersionUuidSchema,
  state: StructuredEditorialPackageStateSchema,
  student: z.object({ document: StudentDocumentV1Schema, libraryRevision: LibraryRevisionReferenceSchema }).strict(),
  adventure: z.object({ document: AdventurePackageV1Schema, libraryRevision: LibraryRevisionReferenceSchema }).strict(),
  visualIntents: z.array(VisualIntentSchema).max(200),
  visualPackageId: LibraryVersionUuidSchema.optional(),
  visualResolution: StructuredVisualResolutionSchema.optional(),
}).strict().superRefine((value, context) => {
  if (value.student.libraryRevision.revisionId === value.adventure.libraryRevision.revisionId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['adventure', 'libraryRevision'], message: 'Student y Adventure no pueden referenciar la misma revisión Library' })
  }
  const intentIds = new Set(value.visualIntents.map(intent => intent.id))
  const requiredIntentIds = collectIntentIds(value)
  for (const id of requiredIntentIds) if (!intentIds.has(id)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['visualIntents'], message: `Falta el visual intent ${id} referenciado por el package` })
  }
  if (value.state === 'APPROVED' && requiredIntentIds.size > 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['state'], message: 'Un package APPROVED no puede conservar referencias visuales sin resolver' })
  }
  // Resolved packages retain original intents as provenance even after the
  // live content points to an asset. Every inactive intent must be accounted
  // for by the same visual revision, never silently discarded.
  const accounted = new Set([
    ...requiredIntentIds,
    ...(value.visualResolution?.resolved.map(slot => slot.intentId) ?? []),
    ...(value.visualResolution?.unresolved.map(slot => slot.intentId) ?? []),
  ])
  for (const intent of value.visualIntents) if (value.state !== 'APPROVED' && !accounted.has(intent.id)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['visualIntents'], message: `El visual intent ${intent.id} no está enlazado a contenido editorial` })
  }
  if (value.visualResolution) {
    const known = new Set(value.visualIntents.map(intent => intent.id))
    for (const slot of [...value.visualResolution.resolved, ...value.visualResolution.unresolved]) if (!known.has(slot.intentId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['visualResolution'], message: `La resolución referencia un intent desconocido ${slot.intentId}` })
    }
  }
})

export const CaptionGenerationContextSchema = z.object({
  assetId: LibraryVersionUuidSchema,
  assetMetadata: z.object({ sourceName: ShortText, author: OptionalText, license: ShortText, alt: ShortText }).strict(),
  slot: z.enum(['STUDENT_FIGURE', 'ADVENTURE_HERO', 'VISUAL_STORY', 'PLACE_ASSET']),
  editorialContext: ShortText,
  evidenceRefs: EvidenceReferencesSchema,
}).strict()

export interface CaptionComposer {
  compose(input: z.infer<typeof CaptionGenerationContextSchema>): Promise<{ caption: string; alt: string; shortCopy?: string; cta?: string }>
}

export function assertStudentDocumentReadyForTrawel(document: z.infer<typeof StudentDocumentV1Schema>): void {
  const parsed = StudentDocumentV1Schema.parse(document)
  if (parsed.blocks.some(block => block.type === 'figure' && block.resolution !== 'RESOLVED')) {
    throw new Error('STUDENT_FIGURE_INTENT_UNRESOLVED')
  }
}

export function buildCaptionGenerationContext(input: z.infer<typeof CaptionGenerationContextSchema>): z.infer<typeof CaptionGenerationContextSchema> {
  return CaptionGenerationContextSchema.parse(input)
}

function collectIntentIds(value: z.infer<typeof StructuredEditorialPackageV1Schema>): Set<string> {
  const ids = new Set<string>()
  const collect = (asset: z.infer<typeof EditorialAssetReferenceSchema> | undefined) => {
    if (asset?.status === 'INTENT') ids.add(asset.visualIntentId)
  }
  for (const block of value.student.document.blocks) if (block.type === 'figure' && block.resolution === 'INTENT') ids.add(block.visualIntentId)
  collect(value.adventure.document.hero.asset)
  for (const item of value.adventure.document.visualStory.items) collect(item.asset)
  for (const place of value.adventure.document.placesToGo.items) collect(place.asset)
  return ids
}

export type StudentDocumentV1 = z.infer<typeof StudentDocumentV1Schema>
export type AdventurePackageV1 = z.infer<typeof AdventurePackageV1Schema>
export type StructuredEditorialPackageV1 = z.infer<typeof StructuredEditorialPackageV1Schema>
export type VisualIntent = z.infer<typeof VisualIntentSchema>
