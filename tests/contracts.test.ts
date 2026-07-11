import { describe, expect, it } from 'vitest'
import {
  AdvertisementContractSchema,
  AdvertisementStatusSchema,
  CampaignContractSchema,
  CampaignStatusSchema,
  ContentPieceContractSchema,
  ModerationStatusSchema,
  ProductionStatusSchema,
  PublicationStatusSchema,
  ResearchRequestContractSchema,
  ResearchResultContractSchema,
  ResearchSourceContractSchema,
  TrawelHandoffContractSchema,
  VerificationStatusSchema,
  canTransition,
  productionTransitions,
  publicationTransitions,
} from '@shared/contracts'

const ids = {
  user: '00000000-0000-4000-8000-000000000001',
  request: '00000000-0000-4000-8000-000000000002',
  run: '00000000-0000-4000-8000-000000000003',
  result: '00000000-0000-4000-8000-000000000004',
  source: '00000000-0000-4000-8000-000000000005',
  draft: '00000000-0000-4000-8000-000000000006',
  content: '00000000-0000-4000-8000-000000000007',
  advertiser: '00000000-0000-4000-8000-000000000008',
  placement: '00000000-0000-4000-8000-000000000009',
  campaign: '00000000-0000-4000-8000-000000000010',
}
const now = new Date('2026-07-11T12:00:00.000Z')

const request = {
  id: ids.request, country: 'España', region: 'Albarracín', outputLanguage: 'es',
  status: 'pending', requestedBy: ids.user, createdAt: now, updatedAt: now,
}

const result = {
  id: ids.result, requestId: ids.request, runId: ids.run, countrySlug: 'espana',
  city: { slug: 'albarracin', nameEs: 'Albarracín', pendingVerification: ['horarios'] },
  destinations: [{
    id: ids.source, slug: 'murallas-de-albarracin', titleEs: 'Murallas de Albarracín',
    type: 'monument', tags: ['historia'], verificationStatus: 'verified',
    pendingVerification: [], sourceIds: [ids.source],
  }],
  globalPendingVerification: [], confidence: 0.8, generatedAt: now,
}

describe('canonical enums', () => {
  it.each([
    ProductionStatusSchema, PublicationStatusSchema, ModerationStatusSchema,
    CampaignStatusSchema, AdvertisementStatusSchema, VerificationStatusSchema,
  ])('rejects an unknown enum value', schema => {
    expect(schema.safeParse('unknown_state').success).toBe(false)
  })
})

describe('state transitions', () => {
  it('allows defined production and publication transitions', () => {
    expect(canTransition(productionTransitions, 'pending', 'researching')).toBe(true)
    expect(canTransition(publicationTransitions, 'queued', 'scheduled')).toBe(true)
  })

  it('rejects skipping review and publishing from an archived item', () => {
    expect(canTransition(productionTransitions, 'drafted', 'approved')).toBe(false)
    expect(canTransition(publicationTransitions, 'archived', 'published')).toBe(false)
  })
})

describe('research contracts', () => {
  it('accepts a valid ResearchRequest and ResearchResult', () => {
    expect(ResearchRequestContractSchema.parse(request).id).toBe(ids.request)
    expect(ResearchResultContractSchema.parse(result).destinations).toHaveLength(1)
  })

  it('accepts a real HTTPS source and rejects malformed or non-HTTPS URLs', () => {
    const source = {
      id: ids.source, researchRunId: ids.run, title: 'Turismo de Aragón',
      url: 'https://www.turismodearagon.com/', sourceType: 'official', supports: 'patrimonio',
      reliabilityScore: 0.9, verificationStatus: 'verified', capturedAt: now,
    }
    expect(ResearchSourceContractSchema.safeParse(source).success).toBe(true)
    expect(ResearchSourceContractSchema.safeParse({ ...source, url: 'not-a-url' }).success).toBe(false)
    expect(ResearchSourceContractSchema.safeParse({ ...source, url: 'http://example.com' }).success).toBe(false)
  })
})

describe('workflow invariants', () => {
  it('accepts an approved ContentPiece with approval evidence', () => {
    const content = {
      id: ids.content, researchRequestId: ids.request, researchResultId: ids.result,
      currentDraftId: ids.draft, productionStatus: 'approved', publicationStatus: 'queued',
      ownerId: ids.user, approvedBy: ids.user, approvedAt: now, version: 1,
      createdAt: now, updatedAt: now,
    }
    expect(ContentPieceContractSchema.safeParse(content).success).toBe(true)
  })

  it('rejects publication of content that is not approved', () => {
    const invalid = {
      id: ids.content, researchRequestId: ids.request, researchResultId: ids.result,
      currentDraftId: ids.draft, productionStatus: 'drafted', publicationStatus: 'queued',
      ownerId: ids.user, version: 1, createdAt: now, updatedAt: now,
    }
    expect(ContentPieceContractSchema.safeParse(invalid).success).toBe(false)
  })

  it('requires legal approval and unsubscribe for non-draft campaigns', () => {
    const campaign = {
      id: ids.campaign, name: 'Novedades', purpose: 'informational', status: 'scheduled',
      unsubscribeEnabled: true, legalBasisApprovedBy: ids.user, createdBy: ids.user,
      createdAt: now, updatedAt: now,
    }
    expect(CampaignContractSchema.safeParse(campaign).success).toBe(true)
    expect(CampaignContractSchema.safeParse({ ...campaign, legalBasisApprovedBy: undefined }).success).toBe(false)
  })

  it('validates approved advertisements and their date range', () => {
    const advertisement = {
      id: ids.content, advertiserId: ids.advertiser, placementId: ids.placement,
      name: 'Campaña verano', status: 'approved', creativeUrl: 'https://cdn.example.com/ad.png',
      targetUrl: 'https://example.com/', cta: 'Más información', startsAt: now,
      endsAt: new Date('2026-08-11T12:00:00.000Z'), approvedBy: ids.user,
      createdAt: now, updatedAt: now,
    }
    expect(AdvertisementContractSchema.safeParse(advertisement).success).toBe(true)
    expect(AdvertisementContractSchema.safeParse({ ...advertisement, endsAt: new Date('2026-06-01') }).success).toBe(false)
  })
})

describe('Trawel handoff', () => {
  const handoff = {
    contractVersion: '1.0', idempotencyKey: 'content:7:version:1', contentPieceId: ids.content,
    approvedBy: ids.user, approvedAt: now, country: { slug: 'espana' },
    city: { slug: 'albarracin', name_es: 'Albarracín', pending_verification: [], status: 'comingSoon', featured: false },
    destinations: [{
      slug: 'murallas-de-albarracin', title_es: 'Murallas de Albarracín', type: 'monument',
      tags: ['historia'], verification_status: 'verified', status: 'draft', featured: false,
      pending_verification: [], sources: [{ title: 'Turismo de Aragón', url: 'https://www.turismodearagon.com/', type: 'official' }],
    }],
    editorialContents: [],
  }

  it('accepts a reviewed draft handoff', () => {
    expect(TrawelHandoffContractSchema.safeParse(handoff).success).toBe(true)
  })

  it('rejects direct published state and malformed source URLs', () => {
    expect(TrawelHandoffContractSchema.safeParse({
      ...handoff,
      destinations: [{ ...handoff.destinations[0], status: 'published' }],
    }).success).toBe(false)
    expect(TrawelHandoffContractSchema.safeParse({
      ...handoff,
      destinations: [{ ...handoff.destinations[0], sources: [{ title: 'Falsa', url: 'fake' }] }],
    }).success).toBe(false)
  })
})
