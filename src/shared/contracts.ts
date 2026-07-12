import { z } from 'zod'

const IdSchema = z.string().uuid()
const TimestampSchema = z.date()
const NonEmptySchema = z.string().trim().min(1)
const SlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const HttpsUrlSchema = z.string().url().refine(value => value.startsWith('https://'), {
  message: 'La URL debe usar HTTPS',
})

export const ProductionStatusSchema = z.enum([
  'pending', 'researching', 'structured', 'drafted',
  'under_review', 'approved', 'rejected', 'error',
])
export const PublicationStatusSchema = z.enum([
  'not_published', 'queued', 'scheduled', 'publishing',
  'published', 'failed', 'paused', 'archived',
])
export const ModerationStatusSchema = z.enum([
  'submitted', 'pending_review', 'approved', 'rejected', 'withdrawn', 'removed',
])
export const CampaignStatusSchema = z.enum([
  'draft', 'pending_approval', 'scheduled', 'sending',
  'sent', 'paused', 'cancelled', 'failed', 'archived',
])
export const AdvertisementStatusSchema = z.enum([
  'draft', 'pending_review', 'approved', 'scheduled', 'active',
  'paused', 'expiring', 'expired', 'rejected', 'archived',
])
export const VerificationStatusSchema = z.enum([
  'pending', 'partially_verified', 'verified', 'disputed',
])
export const RoleNameSchema = z.enum([
  'owner', 'admin', 'editor', 'reviewer', 'publisher', 'moderator', 'sales', 'analyst',
])
export const PermissionNameSchema = z.enum([
  'users.manage', 'settings.manage', 'secrets.manage',
  'research.create', 'content.edit', 'content.review', 'content.approve',
  'publication.queue', 'publication.execute', 'moderation.decide',
  'crm.manage', 'campaign.manage', 'advertisement.manage',
  'analytics.read', 'reports.read', 'audit.read',
])

export const productionTransitions = {
  pending: ['researching', 'error'],
  researching: ['structured', 'error'],
  structured: ['drafted', 'error'],
  drafted: ['under_review', 'error'],
  under_review: ['approved', 'rejected', 'drafted', 'error'],
  approved: ['under_review'],
  rejected: ['drafted'],
  error: ['pending'],
} as const satisfies Record<z.infer<typeof ProductionStatusSchema>, readonly string[]>

export const publicationTransitions = {
  not_published: ['queued', 'archived'],
  queued: ['scheduled', 'publishing', 'paused', 'archived'],
  scheduled: ['publishing', 'paused', 'queued'],
  publishing: ['published', 'failed'],
  published: ['archived'],
  failed: ['queued', 'paused', 'archived'],
  paused: ['queued', 'scheduled', 'archived'],
  archived: [],
} as const satisfies Record<z.infer<typeof PublicationStatusSchema>, readonly string[]>

export function canTransition<T extends string>(
  transitions: Record<string, readonly string[]>,
  from: T,
  to: T
): boolean {
  return transitions[from]?.includes(to) ?? false
}

export const ResearchRequestContractSchema = z.object({
  id: IdSchema,
  country: NonEmptySchema.max(100),
  region: NonEmptySchema.max(100).optional(),
  focus: NonEmptySchema.max(100).optional(),
  outputLanguage: z.string().length(2),
  userNotes: z.string().max(1000).optional(),
  status: ProductionStatusSchema,
  requestedBy: IdSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
})

export const ResearchRunContractSchema = z.object({
  id: IdSchema,
  requestId: IdSchema,
  strategy: z.enum(['auto', 'openai', 'kimi', 'fallback', 'compare']),
  searchProvider: z.enum(['mock', 'brave', 'serpapi', 'searchapi', 'tavily']),
  aiProvider: z.enum(['openai', 'kimi', 'local']),
  model: NonEmptySchema,
  status: z.enum(['pending', 'running', 'succeeded', 'failed', 'cancelled']),
  startedAt: TimestampSchema.optional(),
  completedAt: TimestampSchema.optional(),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
  estimatedCostUsd: z.number().nonnegative().optional(),
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  createdAt: TimestampSchema,
})

export const ResearchSourceContractSchema = z.object({
  id: IdSchema,
  researchRunId: IdSchema,
  title: NonEmptySchema,
  url: HttpsUrlSchema,
  sourceType: z.enum(['official', 'tourism', 'heritage', 'blog', 'reviews', 'news', 'other']),
  supports: z.string().optional(),
  reliabilityScore: z.number().min(0).max(1),
  verificationStatus: VerificationStatusSchema,
  capturedAt: TimestampSchema,
})

const DestinationItemSchema = z.object({
  id: IdSchema,
  slug: SlugSchema,
  titleEs: NonEmptySchema,
  summaryEs: z.string().optional(),
  adventureContentEs: z.string().optional(),
  studentContentEs: z.string().optional(),
  type: z.enum(['monument', 'museum', 'nature', 'experience', 'food', 'hiddenGem']),
  tags: z.array(NonEmptySchema),
  estimatedVisitTime: z.string().optional(),
  price: z.string().optional(),
  openingHours: z.string().optional(),
  practicalTipEs: z.string().optional(),
  verificationStatus: VerificationStatusSchema,
  pendingVerification: z.array(NonEmptySchema),
  sourceIds: z.array(IdSchema).min(1),
})

export const ResearchResultContractSchema = z.object({
  id: IdSchema,
  requestId: IdSchema,
  runId: IdSchema,
  countrySlug: SlugSchema,
  city: z.object({
    slug: SlugSchema,
    nameEs: NonEmptySchema,
    shortDescriptionEs: z.string().optional(),
    adventureContentEs: z.string().optional(),
    studentContentEs: z.string().optional(),
    recommendedDuration: z.string().optional(),
    bestSeasonEs: z.string().optional(),
    sleepingAdviceEs: z.string().optional(),
    foodAdviceEs: z.string().optional(),
    coordinates: z.object({ lat: z.number(), lng: z.number() }).optional(),
    pendingVerification: z.array(NonEmptySchema),
  }),
  destinations: z.array(DestinationItemSchema),
  globalPendingVerification: z.array(NonEmptySchema),
  confidence: z.number().min(0).max(1),
  generatedAt: TimestampSchema,
})

export const EditorialDraftContractSchema = z.object({
  id: IdSchema,
  researchResultId: IdSchema,
  version: z.number().int().positive(),
  title: NonEmptySchema,
  introduction: z.string(),
  sections: z.array(z.object({ id: IdSchema, heading: NonEmptySchema, content: NonEmptySchema, order: z.number().int().nonnegative() })),
  tone: z.enum(['friendly', 'informative', 'enthusiastic', 'relaxed']),
  language: z.string().length(2),
  status: z.enum(['draft', 'in_review', 'approved', 'rejected', 'superseded']),
  createdBy: IdSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
})

export const EditorialRevisionContractSchema = z.object({
  id: IdSchema,
  draftId: IdSchema,
  reviewerId: IdSchema,
  decision: z.enum(['changes_requested', 'approved', 'rejected']),
  notes: NonEmptySchema,
  fromVersion: z.number().int().positive(),
  createdAt: TimestampSchema,
})

export const ContentPieceContractSchema = z.object({
  id: IdSchema,
  researchRequestId: IdSchema,
  researchResultId: IdSchema,
  currentDraftId: IdSchema,
  productionStatus: ProductionStatusSchema,
  publicationStatus: PublicationStatusSchema,
  ownerId: IdSchema,
  approvedBy: IdSchema.optional(),
  approvedAt: TimestampSchema.optional(),
  version: z.number().int().positive(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
}).superRefine((value, context) => {
  if (value.productionStatus === 'approved' && (!value.approvedBy || !value.approvedAt)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'El contenido aprobado requiere actor y fecha de aprobación' })
  }
  if (value.publicationStatus !== 'not_published' && value.productionStatus !== 'approved') {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Solo el contenido aprobado puede entrar en publicación' })
  }
})

export const PublicationQueueItemContractSchema = z.object({
  id: IdSchema, contentPieceId: IdSchema, status: PublicationStatusSchema,
  priority: z.number().int().min(1).max(10), scheduledFor: TimestampSchema.optional(),
  queuedBy: IdSchema, createdAt: TimestampSchema, updatedAt: TimestampSchema,
})

export const PublicationAttemptContractSchema = z.object({
  id: IdSchema, queueItemId: IdSchema, idempotencyKey: NonEmptySchema,
  target: z.literal('trawel'), status: z.enum(['pending', 'succeeded', 'failed', 'partial']),
  payloadHash: NonEmptySchema, responseCode: z.string().optional(), errorMessage: z.string().optional(),
  attemptedBy: IdSchema, attemptedAt: TimestampSchema,
})

export const UserContributionContractSchema = z.object({
  id: IdSchema, kind: z.enum(['message', 'suggestion', 'recommendation', 'report', 'claim', 'place']),
  body: NonEmptySchema, submittedByExternalId: z.string().optional(), status: ModerationStatusSchema,
  assignedTo: IdSchema.optional(), createdAt: TimestampSchema, updatedAt: TimestampSchema,
})

export const UserPhotoContractSchema = z.object({
  id: IdSchema, contributionId: IdSchema.optional(), storagePath: NonEmptySchema,
  alt: NonEmptySchema, caption: z.string().optional(), authorName: NonEmptySchema,
  license: NonEmptySchema, consentRecordId: IdSchema, status: ModerationStatusSchema,
  width: z.number().int().positive(), height: z.number().int().positive(), createdAt: TimestampSchema,
})

export const ModerationDecisionContractSchema = z.object({
  id: IdSchema, subjectType: z.enum(['contribution', 'photo']), subjectId: IdSchema,
  moderatorId: IdSchema, decision: z.enum(['approved', 'rejected', 'removed']),
  reason: NonEmptySchema, createdAt: TimestampSchema,
})

export const ContactContractSchema = z.object({
  id: IdSchema, organizationId: IdSchema.optional(), displayName: NonEmptySchema,
  email: z.string().email().optional(), phone: z.string().optional(), countryCode: z.string().length(2).optional(),
  status: z.enum(['active', 'inactive', 'suppressed', 'deleted']), ownerId: IdSchema.optional(), createdAt: TimestampSchema, updatedAt: TimestampSchema,
})

export const OrganizationContractSchema = z.object({
  id: IdSchema, name: NonEmptySchema,
  type: z.enum(['hotel', 'apartment', 'restaurant', 'rent_a_car', 'activity', 'spa', 'museum', 'commerce', 'tourism_office', 'agency', 'advertiser', 'partner', 'other']),
  website: HttpsUrlSchema.optional(), status: z.enum(['lead', 'prospect', 'client', 'inactive', 'do_not_contact']),
  ownerId: IdSchema.optional(), createdAt: TimestampSchema, updatedAt: TimestampSchema,
})

export const ConsentRecordContractSchema = z.object({
  id: IdSchema, contactId: IdSchema, purpose: z.enum(['transactional', 'operational', 'marketing', 'b2b_prospecting']),
  legalBasis: z.enum(['consent', 'contract', 'legal_obligation', 'legitimate_interest']),
  status: z.enum(['granted', 'withdrawn', 'expired', 'not_required']), source: NonEmptySchema,
  evidence: z.string().optional(), grantedAt: TimestampSchema.optional(), withdrawnAt: TimestampSchema.optional(), createdAt: TimestampSchema,
})

export const CommunicationContractSchema = z.object({
  id: IdSchema, contactId: IdSchema, campaignId: IdSchema.optional(), kind: z.enum(['transactional', 'operational', 'marketing', 'b2b_prospecting']),
  channel: z.enum(['email', 'phone', 'note']), status: z.enum(['draft', 'queued', 'sent', 'delivered', 'bounced', 'replied', 'failed', 'cancelled']),
  subject: z.string().optional(), consentRecordId: IdSchema.optional(), createdBy: IdSchema, createdAt: TimestampSchema,
})

export const CampaignContractSchema = z.object({
  id: IdSchema, name: NonEmptySchema, purpose: z.enum(['informational', 'promotion', 'event', 'b2b']),
  status: CampaignStatusSchema, audienceId: IdSchema.optional(), senderIdentity: z.string().optional(),
  legalBasisApprovedBy: IdSchema.optional(), unsubscribeEnabled: z.boolean(), scheduledFor: TimestampSchema.optional(),
  createdBy: IdSchema, createdAt: TimestampSchema, updatedAt: TimestampSchema,
}).superRefine((value, context) => {
  if (!['draft', 'archived'].includes(value.status) && (!value.legalBasisApprovedBy || !value.unsubscribeEnabled)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Una campaña activa requiere aprobación legal y baja habilitada' })
  }
})

export const CampaignAudienceContractSchema = z.object({ id: IdSchema, campaignId: IdSchema, name: NonEmptySchema, filterDefinition: z.record(z.unknown()), snapshotAt: TimestampSchema.optional(), createdAt: TimestampSchema })
export const CampaignDeliveryContractSchema = z.object({ id: IdSchema, campaignId: IdSchema, contactId: IdSchema, communicationId: IdSchema, status: z.enum(['queued', 'sent', 'delivered', 'bounced', 'replied', 'unsubscribed', 'failed']), createdAt: TimestampSchema, updatedAt: TimestampSchema })

export const AdvertiserContractSchema = z.object({ id: IdSchema, organizationId: IdSchema, billingEmail: z.string().email().optional(), status: z.enum(['lead', 'active', 'paused', 'closed']), createdAt: TimestampSchema, updatedAt: TimestampSchema })
export const AdPlacementContractSchema = z.object({ id: IdSchema, key: SlugSchema, page: NonEmptySchema, format: NonEmptySchema, width: z.number().int().positive().optional(), height: z.number().int().positive().optional(), status: z.enum(['draft', 'available', 'unavailable', 'archived']), createdAt: TimestampSchema })

export const AdvertisementContractSchema = z.object({
  id: IdSchema, advertiserId: IdSchema, placementId: IdSchema, name: NonEmptySchema,
  status: AdvertisementStatusSchema, creativeUrl: HttpsUrlSchema, targetUrl: HttpsUrlSchema,
  cta: NonEmptySchema, startsAt: TimestampSchema.optional(), endsAt: TimestampSchema.optional(),
  approvedBy: IdSchema.optional(), createdAt: TimestampSchema, updatedAt: TimestampSchema,
}).superRefine((value, context) => {
  if (value.startsAt && value.endsAt && value.endsAt <= value.startsAt) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'La fecha final debe ser posterior a la inicial' })
  }
  if (['approved', 'scheduled', 'active', 'paused', 'expiring', 'expired'].includes(value.status) && !value.approvedBy) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'El anuncio requiere aprobación' })
  }
})

export const AdBookingContractSchema = z.object({ id: IdSchema, advertisementId: IdSchema, placementId: IdSchema, startsAt: TimestampSchema, endsAt: TimestampSchema, priceAmount: z.number().nonnegative(), currency: z.string().length(3), status: z.enum(['draft', 'confirmed', 'active', 'completed', 'cancelled']), createdAt: TimestampSchema })
export const RenewalReminderContractSchema = z.object({ id: IdSchema, advertisementId: IdSchema, daysBeforeExpiry: z.union([z.literal(30), z.literal(15), z.literal(7), z.literal(3), z.literal(1)]), scheduledFor: TimestampSchema, status: z.enum(['pending', 'sent', 'cancelled', 'failed']), createdAt: TimestampSchema })

export const AnalyticsEventContractSchema = z.object({ id: IdSchema, eventName: NonEmptySchema, occurredAt: TimestampSchema, anonymousSessionId: z.string().optional(), appUserId: IdSchema.optional(), entityType: z.string().optional(), entityId: z.string().optional(), properties: z.record(z.unknown()) })
export const AnalyticsAggregateContractSchema = z.object({ id: IdSchema, metric: NonEmptySchema, periodStart: TimestampSchema, periodEnd: TimestampSchema, dimensions: z.record(z.string()), value: z.number(), sampleSize: z.number().int().nonnegative(), quality: z.enum(['real', 'estimated', 'insufficient_sample', 'unavailable']), computedAt: TimestampSchema })
export const CommercialReportContractSchema = z.object({ id: IdSchema, organizationId: IdSchema.optional(), periodStart: TimestampSchema, periodEnd: TimestampSchema, status: z.enum(['draft', 'ready', 'delivered', 'archived']), aggregateIds: z.array(IdSchema), generatedBy: IdSchema, generatedAt: TimestampSchema })

export const AuditLogContractSchema = z.object({ id: IdSchema, actorId: IdSchema.optional(), action: NonEmptySchema, entityType: NonEmptySchema, entityId: z.string().optional(), outcome: z.enum(['success', 'failure', 'denied']), correlationId: NonEmptySchema, metadata: z.record(z.unknown()), occurredAt: TimestampSchema })
export const PermissionContractSchema = z.object({ id: IdSchema, name: PermissionNameSchema, description: NonEmptySchema })
export const RoleContractSchema = z.object({ id: IdSchema, name: RoleNameSchema, permissionNames: z.array(PermissionNameSchema) })
export const AppUserContractSchema = z.object({ id: IdSchema, authUserId: IdSchema, email: z.string().email(), displayName: NonEmptySchema, roleNames: z.array(RoleNameSchema).min(1), status: z.enum(['invited', 'active', 'suspended', 'disabled']), createdAt: TimestampSchema, updatedAt: TimestampSchema })

export const ContributionImportStatusSchema = z.enum([
  'pending', 'downloading', 'verifying', 'imported',
  'deleting_remote', 'completed', 'retry_pending', 'failed',
])

export const ContributionSourceTypeSchema = z.enum([
  'message', 'suggestion', 'recommendation', 'report', 'claim', 'photo', 'place',
])

export const RemoteContributionFileSchema = z.object({
  remoteFileId: NonEmptySchema.max(200),
  originalName: NonEmptySchema.max(255),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  size: z.number().int().positive().max(20 * 1024 * 1024),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
})

export const RemoteContributionSchema = z.object({
  remoteId: NonEmptySchema.max(200),
  sourceType: ContributionSourceTypeSchema,
  remoteCreatedAt: TimestampSchema,
  content: NonEmptySchema.max(100_000),
  metadata: z.record(z.unknown()).default({}),
  payloadSize: z.number().int().positive().max(2 * 1024 * 1024),
  payloadSha256: z.string().regex(/^[a-f0-9]{64}$/),
  files: z.array(RemoteContributionFileSchema).max(20),
  version: z.number().int().positive(),
})

export const ContributionImportJobSchema = z.object({
  id: IdSchema,
  batchId: IdSchema,
  remoteId: NonEmptySchema.max(200),
  sourceType: ContributionSourceTypeSchema,
  status: ContributionImportStatusSchema,
  attemptCount: z.number().int().nonnegative(),
  lastError: z.string().max(2000).optional(),
  nextRetryAt: TimestampSchema.optional(),
  remoteChecksum: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  localChecksum: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  remotePayloadSize: z.number().int().nonnegative().optional(),
  localPayloadSize: z.number().int().nonnegative().optional(),
  downloadedAt: TimestampSchema.optional(),
  verifiedAt: TimestampSchema.optional(),
  deletedRemoteAt: TimestampSchema.optional(),
  completedAt: TimestampSchema.optional(),
  idempotencyKey: NonEmptySchema.max(300),
  version: z.number().int().positive(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
})

export const ContributionSyncSummarySchema = z.object({
  batchId: IdSchema,
  found: z.number().int().nonnegative(),
  downloaded: z.number().int().nonnegative(),
  verified: z.number().int().nonnegative(),
  deletedRemote: z.number().int().nonnegative(),
  retrying: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
  jobs: z.array(ContributionImportJobSchema),
})

const TrawelSourcePayloadSchema = z.object({ title: NonEmptySchema, url: HttpsUrlSchema.optional(), type: z.enum(['official', 'tourism', 'heritage', 'blog', 'reviews', 'restaurant', 'accommodation', 'other']).optional(), supports: z.string().optional() })
const TrawelDestinationPayloadSchema = z.object({
  slug: SlugSchema, title_es: NonEmptySchema, summary_es: z.string().optional(),
  adventure_content_es: z.string().optional(), student_content_es: z.string().optional(),
  type: z.enum(['monument', 'museum', 'nature', 'experience', 'food', 'hiddenGem']), tags: z.array(z.string()),
  estimated_visit_time: z.string().optional(), price: z.string().optional(), opening_hours: z.string().optional(), practical_tip_es: z.string().optional(),
  verification_status: z.enum(['pending', 'verified', 'disputed']), status: z.literal('draft'), featured: z.boolean(),
  pending_verification: z.array(z.string()), sources: z.array(TrawelSourcePayloadSchema).min(1),
})

export const TrawelHandoffContractSchema = z.object({
  contractVersion: z.literal('1.0'), idempotencyKey: NonEmptySchema, contentPieceId: IdSchema,
  approvedBy: IdSchema, approvedAt: TimestampSchema,
  country: z.object({ slug: SlugSchema }),
  city: z.object({
    slug: SlugSchema, name_es: NonEmptySchema, short_description_es: z.string().optional(),
    adventure_content_es: z.string().optional(), student_content_es: z.string().optional(),
    lat: z.number().optional(), lng: z.number().optional(), recommended_duration: z.string().optional(),
    best_season_es: z.string().optional(), sleeping_advice_es: z.string().optional(), food_advice_es: z.string().optional(),
    pending_verification: z.array(z.string()), status: z.enum(['comingSoon', 'disabled']), featured: z.boolean(),
  }),
  destinations: z.array(TrawelDestinationPayloadSchema),
  editorialContents: z.array(z.object({
    entity_type: z.enum(['country', 'zone', 'place', 'route', 'plan', 'static_page', 'generic']),
    entity_slug: SlugSchema.optional(), country_slug: SlugSchema.optional(), zone_slug: SlugSchema.optional(),
    mode: z.enum(['adventure', 'student']).nullable(), headline: NonEmptySchema, intro: z.string().optional(),
    highlights: z.array(z.string()), practical_tips: z.array(z.string()), sections: z.array(z.record(z.unknown())),
    sources: z.array(TrawelSourcePayloadSchema), metadata: z.record(z.unknown()), status: z.enum(['draft', 'review']),
  })).default([]),
})

export type ResearchRequestContract = z.infer<typeof ResearchRequestContractSchema>
export type ResearchRunContract = z.infer<typeof ResearchRunContractSchema>
export type ResearchSourceContract = z.infer<typeof ResearchSourceContractSchema>
export type ResearchResultContract = z.infer<typeof ResearchResultContractSchema>
export type EditorialDraftContract = z.infer<typeof EditorialDraftContractSchema>
export type EditorialRevisionContract = z.infer<typeof EditorialRevisionContractSchema>
export type ContentPieceContract = z.infer<typeof ContentPieceContractSchema>
export type PublicationQueueItemContract = z.infer<typeof PublicationQueueItemContractSchema>
export type PublicationAttemptContract = z.infer<typeof PublicationAttemptContractSchema>
export type UserContributionContract = z.infer<typeof UserContributionContractSchema>
export type UserPhotoContract = z.infer<typeof UserPhotoContractSchema>
export type ModerationDecisionContract = z.infer<typeof ModerationDecisionContractSchema>
export type ContactContract = z.infer<typeof ContactContractSchema>
export type OrganizationContract = z.infer<typeof OrganizationContractSchema>
export type ConsentRecordContract = z.infer<typeof ConsentRecordContractSchema>
export type CommunicationContract = z.infer<typeof CommunicationContractSchema>
export type CampaignContract = z.infer<typeof CampaignContractSchema>
export type CampaignAudienceContract = z.infer<typeof CampaignAudienceContractSchema>
export type CampaignDeliveryContract = z.infer<typeof CampaignDeliveryContractSchema>
export type AdvertiserContract = z.infer<typeof AdvertiserContractSchema>
export type AdvertisementContract = z.infer<typeof AdvertisementContractSchema>
export type AdPlacementContract = z.infer<typeof AdPlacementContractSchema>
export type AdBookingContract = z.infer<typeof AdBookingContractSchema>
export type RenewalReminderContract = z.infer<typeof RenewalReminderContractSchema>
export type AnalyticsEventContract = z.infer<typeof AnalyticsEventContractSchema>
export type AnalyticsAggregateContract = z.infer<typeof AnalyticsAggregateContractSchema>
export type CommercialReportContract = z.infer<typeof CommercialReportContractSchema>
export type AuditLogContract = z.infer<typeof AuditLogContractSchema>
export type AppUserContract = z.infer<typeof AppUserContractSchema>
export type RoleContract = z.infer<typeof RoleContractSchema>
export type PermissionContract = z.infer<typeof PermissionContractSchema>
export type TrawelHandoffContract = z.infer<typeof TrawelHandoffContractSchema>
export type ContributionImportStatus = z.infer<typeof ContributionImportStatusSchema>
export type ContributionSourceType = z.infer<typeof ContributionSourceTypeSchema>
export type RemoteContributionFile = z.infer<typeof RemoteContributionFileSchema>
export type RemoteContribution = z.infer<typeof RemoteContributionSchema>
export type ContributionImportJob = z.infer<typeof ContributionImportJobSchema>
export type ContributionSyncSummary = z.infer<typeof ContributionSyncSummarySchema>
