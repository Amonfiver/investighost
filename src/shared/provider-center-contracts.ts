import { z } from 'zod'
import { RealProviderCategorySchema } from './real-pipeline-contracts'

const ProviderIdSchema = z.string().trim().regex(/^[a-z0-9][a-z0-9-]{1,79}$/)
const ModelIdSchema = z.string().trim().min(1).max(160)

export const ProviderConnectionStateSchema = z.enum([
  'not_tested',
  'simulated_ok',
  'simulated_error',
])

export const ProviderPublicStatusSchema = z.object({
  id: ProviderIdSchema,
  displayName: z.string().trim().min(1).max(120),
  category: RealProviderCategorySchema,
  configured: z.boolean(),
  credentialMask: z.literal('••••••••').optional(),
  active: z.boolean(),
  selectedModel: ModelIdSchema,
  availableModels: z.array(ModelIdSchema).min(1),
  lastTestAt: z.string().datetime({ offset: true }).optional(),
  connectionState: ProviderConnectionStateSchema,
})

export const ProviderCenterSnapshotSchema = z.object({
  secureStorageAvailable: z.boolean(),
  simulationOnly: z.literal(true),
  providers: z.array(ProviderPublicStatusSchema),
})

export const ProviderConfigureInputSchema = z.object({
  providerId: ProviderIdSchema,
  credential: z.string().min(8).max(4_096),
  selectedModel: ModelIdSchema,
  confirmReplace: z.boolean().default(false),
})

export const ProviderActivationInputSchema = z.object({
  providerId: ProviderIdSchema,
  active: z.boolean(),
})

export const ProviderDeleteInputSchema = z.object({
  providerId: ProviderIdSchema,
  confirmation: z.literal('ELIMINAR'),
})

export const ProviderTestInputSchema = z.object({
  providerId: ProviderIdSchema,
})

export type ProviderConnectionState = z.infer<typeof ProviderConnectionStateSchema>
export type ProviderPublicStatus = z.infer<typeof ProviderPublicStatusSchema>
export type ProviderCenterSnapshot = z.infer<typeof ProviderCenterSnapshotSchema>
export type ProviderConfigureInput = z.infer<typeof ProviderConfigureInputSchema>
export type ProviderActivationInput = z.infer<typeof ProviderActivationInputSchema>
export type ProviderDeleteInput = z.infer<typeof ProviderDeleteInputSchema>
export type ProviderTestInput = z.infer<typeof ProviderTestInputSchema>
