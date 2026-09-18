import { z } from 'zod'
import { LibraryVersionUuidSchema } from './real-editorial-library-contracts'

export const DESTINATION_VISUAL_CONTRACT = 'investighost-destination-visual-contract-v1' as const
export const DestinationVisualSlotStateSchema = z.enum(['EMPTY', 'PENDING', 'APPROVED', 'REJECTED'])

const NullableText = z.string().trim().min(1).max(2_000).nullable()
const NullableUrl = z.string().url().nullable()
const NullableBoolean = z.boolean().nullable()
const NullablePositiveInteger = z.number().int().positive().nullable()

/**
 * Internal, destination-level visual ledger. It deliberately stays independent
 * from Adventure/Student prose and may retain rejected research references.
 */
export const DestinationVisualSlotSchema = z.object({
  state: DestinationVisualSlotStateSchema,
  assetId: NullableText,
  imageUrl: NullableUrl,
  sourceUrl: NullableUrl,
  author: NullableText,
  sourceName: NullableText,
  license: NullableText,
  attributionText: NullableText,
  usageAllowed: z.boolean().nullable(),
  rightsCheckedAt: z.string().datetime({ offset: true }).nullable(),
  associatedPlace: NullableText,
  rejectionReason: NullableText,
  referenceOnly: NullableBoolean,
  approvedForPublicUse: NullableBoolean,
  width: NullablePositiveInteger,
  height: NullablePositiveInteger,
  mimeType: NullableText,
  checksum: NullableText,
}).strict().superRefine((slot, context) => {
  const hasAsset = slot.assetId !== null || slot.imageUrl !== null
  const hasMetadata = Object.entries(slot).some(([key, value]) => key !== 'state' && value !== null)
  if (slot.state === 'EMPTY' && hasMetadata) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'EMPTY no admite asset ni metadata visual' })
  }
  if (slot.state === 'APPROVED' && (
    !hasAsset || slot.usageAllowed !== true || slot.rightsCheckedAt === null
    || slot.approvedForPublicUse !== true || slot.referenceOnly === true
  )) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'APPROVED exige asset, uso permitido y derechos comprobados' })
  }
  if (slot.usageAllowed === false && slot.state === 'APPROVED') {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Un asset sin permiso de uso no puede ser consumible' })
  }
  if (slot.state === 'REJECTED' && slot.rejectionReason === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'REJECTED exige motivo de rechazo' })
  }
  if (slot.state !== 'APPROVED' && slot.approvedForPublicUse === true) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Solo un slot APPROVED puede autorizar uso público' })
  }
})

export const DestinationVisualContractSchema = z.object({
  schema: z.literal(DESTINATION_VISUAL_CONTRACT),
  destinationId: LibraryVersionUuidSchema,
  imageSlot1: DestinationVisualSlotSchema,
  imageSlot2: DestinationVisualSlotSchema,
}).strict()

/**
 * Consumer projection: only rights-cleared assets can cross the V2 boundary.
 * PENDING/REJECTED references remain in Investighost's internal visual ledger.
 */
export const TrawelDestinationVisualSlotSchema = z.object({
  state: DestinationVisualSlotStateSchema,
  assetId: NullableText,
  imageUrl: NullableUrl,
  author: NullableText,
  sourceName: NullableText,
  license: NullableText,
  attributionText: NullableText,
  associatedPlace: NullableText,
  width: NullablePositiveInteger,
  height: NullablePositiveInteger,
  mimeType: NullableText,
  checksum: NullableText,
}).strict().superRefine((slot, context) => {
  const hasPublicAsset = slot.assetId !== null || slot.imageUrl !== null
  const hasPublicMetadata = Object.entries(slot).some(([key, value]) => key !== 'state' && value !== null)
  if (slot.state !== 'APPROVED' && hasPublicMetadata) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Solo un asset APPROVED puede cruzar como imagen pública' })
  }
  if (slot.state === 'APPROVED' && !hasPublicAsset) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Un slot público APPROVED exige asset' })
  }
})

export const TrawelDestinationVisualContractSchema = z.object({
  schema: z.literal(DESTINATION_VISUAL_CONTRACT),
  destinationId: LibraryVersionUuidSchema,
  imageSlot1: TrawelDestinationVisualSlotSchema,
  imageSlot2: TrawelDestinationVisualSlotSchema,
}).strict()

export function emptyDestinationVisualSlot(): z.infer<typeof DestinationVisualSlotSchema> {
  return {
    state: 'EMPTY', assetId: null, imageUrl: null, sourceUrl: null, author: null,
    sourceName: null, license: null, attributionText: null, usageAllowed: null,
    rightsCheckedAt: null, associatedPlace: null, rejectionReason: null,
    referenceOnly: null, approvedForPublicUse: null,
    width: null, height: null, mimeType: null, checksum: null,
  }
}

export function projectDestinationVisualsForTrawel(
  candidate: z.infer<typeof DestinationVisualContractSchema>,
): z.infer<typeof TrawelDestinationVisualContractSchema> {
  const visuals = DestinationVisualContractSchema.parse(candidate)
  const projectSlot = (slot: z.infer<typeof DestinationVisualSlotSchema>) => slot.state === 'APPROVED'
    ? {
        state: slot.state, assetId: slot.assetId, imageUrl: slot.imageUrl, author: slot.author,
        sourceName: slot.sourceName, license: slot.license, attributionText: slot.attributionText,
        associatedPlace: slot.associatedPlace, width: slot.width, height: slot.height,
        mimeType: slot.mimeType, checksum: slot.checksum,
      }
    : {
        state: slot.state, assetId: null, imageUrl: null, author: null, sourceName: null,
        license: null, attributionText: null, associatedPlace: null, width: null, height: null,
        mimeType: null, checksum: null,
      }
  return TrawelDestinationVisualContractSchema.parse({
    schema: visuals.schema, destinationId: visuals.destinationId,
    imageSlot1: projectSlot(visuals.imageSlot1), imageSlot2: projectSlot(visuals.imageSlot2),
  })
}

export function emptyDestinationVisualContract(destinationId: string): z.infer<typeof DestinationVisualContractSchema> {
  return DestinationVisualContractSchema.parse({
    schema: DESTINATION_VISUAL_CONTRACT, destinationId,
    imageSlot1: emptyDestinationVisualSlot(), imageSlot2: emptyDestinationVisualSlot(),
  })
}
