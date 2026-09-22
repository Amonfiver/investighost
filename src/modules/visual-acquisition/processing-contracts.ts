import { z } from 'zod'
import type { DestinationVisualAssetSchema } from '@shared/destination-visual-media-contract'
import type { SelectedVisualCandidate } from './candidate-selection'
import type { StagedVisualObject } from './media-storage'

export const VisualCandidateStageStateSchema = z.enum(['STAGED', 'REJECTED'])
export const VisualCandidateStageSchema = z.object({
  candidateId: z.string().uuid(),
  state: VisualCandidateStageStateSchema,
  stagingBucket: z.literal('visual-staging-private').nullable(),
  stagingStorageIdentity: z.string().trim().min(1).nullable(),
  checksum: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  detectedMimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']).nullable(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  byteSize: z.number().int().positive().nullable(),
  downloadedAt: z.string().datetime({ offset: true }).nullable(),
  failureCode: z.string().trim().min(1).nullable(),
}).strict().superRefine((stage, context) => {
  if (stage.state === 'STAGED' && (stage.stagingBucket === null || stage.stagingStorageIdentity === null || stage.checksum === null || stage.detectedMimeType === null || stage.width === null || stage.height === null || stage.byteSize === null || stage.downloadedAt === null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'STAGED exige metadata de bytes y objeto privado' })
  }
  if (stage.state === 'REJECTED' && stage.failureCode === null) context.addIssue({ code: z.ZodIssueCode.custom, message: 'REJECTED exige failureCode' })
})

export const VisualStoredBlobSchema = z.object({
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  bucket: z.literal('images-approved'),
  storageIdentity: z.string().trim().min(1),
  publicUrl: z.string().url().refine(value => new URL(value).protocol === 'https:'),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  byteSize: z.number().int().positive(),
}).strict()

export type VisualCandidateStage = z.infer<typeof VisualCandidateStageSchema>
export type VisualStoredBlob = z.infer<typeof VisualStoredBlobSchema>
export type VisualAsset = typeof DestinationVisualAssetSchema._output
export type VisualPromotion = { selection: SelectedVisualCandidate; asset: VisualAsset }
export type PrivateStage = Pick<StagedVisualObject, 'bucket' | 'storageIdentity'>
