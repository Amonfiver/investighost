import { z } from 'zod'
import { LibraryVersionSha256Schema, LibraryVersionUuidSchema } from './real-editorial-library-contracts'

/**
 * Canonical editorial media package. It is deliberately separate from the
 * Adventure/Student bodies and from Trawel's presentation runtime.
 */
export const DESTINATION_VISUAL_MEDIA_CONTRACT = 'investighost-destination-visual-media-v1' as const

export const VisualAssetCategorySchema = z.enum([
  'landmark', 'landscape', 'culture', 'food', 'people-life', 'atmosphere', 'detail',
])
export const VisualAssetModeSchema = z.enum(['adventure', 'student'])
export const VisualAssetRoleSchema = z.enum(['hero', 'highlight', 'gallery'])
export const VisualAssetLifecycleSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED'])
export const VisualRightsStatusSchema = z.enum(['UNKNOWN', 'PENDING', 'REFERENCE_ONLY', 'APPROVED_FOR_PUBLIC_USE', 'REJECTED'])
export const VisualPackageStateSchema = z.enum(['DRAFT', 'PARTIAL', 'APPROVED', 'REJECTED'])

const UrlSchema = z.string().url().refine(value => new URL(value).protocol === 'https:', 'La URL pública debe usar HTTPS')
const NullableText = z.string().trim().min(1).max(2_000).nullable()
const NullableUrl = UrlSchema.nullable()
const NullablePositiveInteger = z.number().int().positive().nullable()

export const DestinationVisualAssetSchema = z.object({
  assetId: LibraryVersionUuidSchema,
  destinationId: LibraryVersionUuidSchema,
  lifecycle: VisualAssetLifecycleSchema,
  rightsStatus: VisualRightsStatusSchema,
  usageAllowed: z.boolean().nullable(),
  rightsCheckedAt: z.string().datetime({ offset: true }).nullable(),
  publicUrl: NullableUrl,
  storageIdentity: NullableText,
  sourceUrl: NullableUrl,
  sourceName: NullableText,
  author: NullableText,
  license: NullableText,
  attributionText: NullableText,
  associatedPlace: NullableText,
  category: VisualAssetCategorySchema,
  modes: z.array(VisualAssetModeSchema).min(1).max(2).superRefine((modes, context) => {
    if (new Set(modes).size !== modes.length) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Los modos no pueden repetirse' })
  }),
  alt: NullableText,
  caption: NullableText,
  width: NullablePositiveInteger,
  height: NullablePositiveInteger,
  mimeType: NullableText,
  checksum: LibraryVersionSha256Schema.nullable(),
  rejectionReason: NullableText,
}).strict().superRefine((asset, context) => {
  const publicReady = asset.lifecycle === 'APPROVED'
  if (publicReady && (
    asset.rightsStatus !== 'APPROVED_FOR_PUBLIC_USE'
    || asset.usageAllowed !== true
    || asset.rightsCheckedAt === null
    || asset.publicUrl === null
    || asset.alt === null
    || asset.attributionText === null
  )) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Un asset APPROVED exige URL, alt, atribución y derechos públicos comprobados' })
  }
  if (asset.rightsStatus === 'APPROVED_FOR_PUBLIC_USE' && !publicReady) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Los derechos públicos aprobados exigen lifecycle APPROVED' })
  }
  if (!publicReady && asset.publicUrl !== null) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Solo un asset APPROVED puede exponer URL pública' })
  }
  if (asset.lifecycle === 'REJECTED' && asset.rejectionReason === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Un asset REJECTED exige motivo de rechazo' })
  }
})

/** A selection is editorial intent; asset metadata is not duplicated per layout role. */
export const DestinationVisualSelectionSchema = z.object({
  assetId: LibraryVersionUuidSchema,
  mode: VisualAssetModeSchema,
  role: VisualAssetRoleSchema,
  priority: z.number().int().nonnegative(),
}).strict()

export const DestinationVisualMediaPackageSchema = z.object({
  schema: z.literal(DESTINATION_VISUAL_MEDIA_CONTRACT),
  packageId: LibraryVersionUuidSchema,
  destinationId: LibraryVersionUuidSchema,
  state: VisualPackageStateSchema,
  packageHash: LibraryVersionSha256Schema.nullable(),
  assets: z.array(DestinationVisualAssetSchema).max(100),
  selections: z.array(DestinationVisualSelectionSchema).max(300),
}).strict().superRefine((value, context) => {
  const assets = new Map(value.assets.map(asset => [asset.assetId, asset]))
  const occupied = new Set<string>()
  const heroes = new Set<string>()
  for (const selection of value.selections) {
    const asset = assets.get(selection.assetId)
    if (!asset) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['selections'], message: 'Una selección debe referirse a un asset del paquete' })
      continue
    }
    if (asset.destinationId !== value.destinationId) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['assets'], message: 'Todo asset debe pertenecer al destino del paquete' })
    }
    if (!asset.modes.includes(selection.mode)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['selections'], message: 'El asset no es compatible con el modo seleccionado' })
    }
    const key = `${selection.mode}:${selection.role}:${selection.priority}`
    if (occupied.has(key)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['selections'], message: 'No puede repetirse prioridad para el mismo modo y rol' })
    occupied.add(key)
    if (selection.role === 'hero') {
      const heroKey = selection.mode
      if (heroes.has(heroKey)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['selections'], message: 'Solo puede existir un hero por modo' })
      heroes.add(heroKey)
      if (selection.priority !== 0) context.addIssue({ code: z.ZodIssueCode.custom, path: ['selections'], message: 'El hero debe tener prioridad 0' })
    }
  }
  if (value.state === 'APPROVED') {
    if (value.packageHash === null) context.addIssue({ code: z.ZodIssueCode.custom, path: ['packageHash'], message: 'Un paquete APPROVED exige hash estable' })
    for (const selection of value.selections) {
      const asset = assets.get(selection.assetId)
      if (asset?.lifecycle !== 'APPROVED') context.addIssue({ code: z.ZodIssueCode.custom, path: ['selections'], message: 'Un paquete APPROVED no puede seleccionar assets no públicos' })
    }
  }
})

export const TrawelVisualMediaAssetSchema = z.object({
  assetId: LibraryVersionUuidSchema,
  url: UrlSchema,
  category: VisualAssetCategorySchema,
  modes: z.array(VisualAssetModeSchema).min(1).max(2),
  alt: z.string().trim().min(1).max(2_000),
  caption: z.string().trim().min(1).max(2_000).nullable(),
  credit: z.string().trim().min(1).max(2_000),
  source: z.string().trim().min(1).max(2_000).nullable(),
  rightsStatus: z.literal('APPROVED_FOR_PUBLIC_USE'),
  associatedPlace: z.string().trim().min(1).max(2_000).nullable(),
  width: NullablePositiveInteger,
  height: NullablePositiveInteger,
  mimeType: NullableText,
  checksum: LibraryVersionSha256Schema.nullable(),
}).strict()

export const TrawelVisualMediaSelectionSchema = DestinationVisualSelectionSchema

export const TrawelDestinationVisualMediaSchema = z.object({
  schema: z.literal(DESTINATION_VISUAL_MEDIA_CONTRACT),
  packageId: LibraryVersionUuidSchema,
  destinationId: LibraryVersionUuidSchema,
  packageHash: LibraryVersionSha256Schema,
  completeness: z.enum(['EMPTY', 'PARTIAL', 'COMPLETE']),
  assets: z.array(TrawelVisualMediaAssetSchema).max(100),
  selections: z.array(TrawelVisualMediaSelectionSchema).max(300),
}).strict()

export function projectDestinationVisualMediaForTrawel(
  candidate: z.infer<typeof DestinationVisualMediaPackageSchema>,
): z.infer<typeof TrawelDestinationVisualMediaSchema> {
  const value = DestinationVisualMediaPackageSchema.parse(candidate)
  if (value.state !== 'APPROVED' || value.packageHash === null) {
    throw new Error('Solo un paquete visual APPROVED puede proyectarse a Trawel')
  }
  const selectedIds = new Set(value.selections.map(selection => selection.assetId))
  const publicAssets = new Map(value.assets.filter(asset => asset.lifecycle === 'APPROVED' && selectedIds.has(asset.assetId)).map(asset => [asset.assetId, asset]))
  const selections = value.selections.filter(selection => publicAssets.has(selection.assetId))
  if (selections.length !== value.selections.length) throw new Error('Un asset no público no puede entrar en la proyección visual')
  return TrawelDestinationVisualMediaSchema.parse({
    schema: value.schema,
    packageId: value.packageId,
    destinationId: value.destinationId,
    packageHash: value.packageHash,
    completeness: visualPackageCompleteness(selections),
    assets: [...publicAssets.values()].map(asset => ({
      assetId: asset.assetId, url: required(asset.publicUrl), category: asset.category, modes: asset.modes,
      alt: required(asset.alt), caption: asset.caption, credit: required(asset.attributionText), source: asset.sourceName,
      rightsStatus: 'APPROVED_FOR_PUBLIC_USE', associatedPlace: asset.associatedPlace,
      width: asset.width, height: asset.height, mimeType: asset.mimeType, checksum: asset.checksum,
    })),
    selections: selections.sort(selectionOrder),
  })
}

export function visualPackageCompleteness(selections: readonly z.infer<typeof DestinationVisualSelectionSchema>[]): 'EMPTY' | 'PARTIAL' | 'COMPLETE' {
  if (selections.length === 0) return 'EMPTY'
  const adventure = selections.filter(selection => selection.mode === 'adventure')
  const hasHero = adventure.some(selection => selection.role === 'hero')
  const highlights = adventure.filter(selection => selection.role === 'highlight').length
  const gallery = adventure.filter(selection => selection.role === 'gallery').length
  return hasHero && highlights >= 2 && gallery >= 1 ? 'COMPLETE' : 'PARTIAL'
}

function selectionOrder(left: z.infer<typeof DestinationVisualSelectionSchema>, right: z.infer<typeof DestinationVisualSelectionSchema>): number {
  return left.mode.localeCompare(right.mode) || left.role.localeCompare(right.role) || left.priority - right.priority || left.assetId.localeCompare(right.assetId)
}
function required(value: string | null): string {
  if (value === null) throw new Error('La proyección pública requiere un valor aprobado')
  return value
}
