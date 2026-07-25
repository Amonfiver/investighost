import { z } from 'zod'
import {
  RealEditorialProfileSchema,
  RealResearchDepthSchema,
  RealTargetWordCountSchema,
  type RealProfileConfiguration,
} from './real-pipeline-contracts'

export const RealProfileSettingSchema = z.object({
  profile: RealEditorialProfileSchema,
  enabled: z.boolean(),
  targetWords: RealTargetWordCountSchema,
  depth: RealResearchDepthSchema,
})

export const RealProfileSettingsSchema = z.object({
  version: z.literal('real-profile-settings-v1'),
  sharedResearch: z.literal(true),
  profiles: z.array(RealProfileSettingSchema).length(2),
  updatedAt: z.string().datetime({ offset: true }),
}).superRefine((value, context) => {
  if (new Set(value.profiles.map(profile => profile.profile)).size !== value.profiles.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['profiles'], message: 'Los perfiles no pueden repetirse' })
  }
  if (!value.profiles.some(profile => profile.enabled)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['profiles'], message: 'Debe existir al menos un perfil activo' })
  }
})

export type RealProfileSettings = z.infer<typeof RealProfileSettingsSchema>

export function defaultRealProfileSettings(now = new Date()): RealProfileSettings {
  return RealProfileSettingsSchema.parse({
    version: 'real-profile-settings-v1',
    sharedResearch: true,
    profiles: [
      { profile: 'adventure', enabled: true, targetWords: 1_000, depth: 'standard' },
      { profile: 'student', enabled: true, targetWords: 1_800, depth: 'deep' },
    ],
    updatedAt: now.toISOString(),
  })
}

export function missionProfilesFromSettings(settings: RealProfileSettings): RealProfileConfiguration[] {
  return RealProfileSettingsSchema.parse(settings).profiles.map(profile => ({ ...profile }))
}

export interface ProfileEvidenceAssessment {
  profile: 'adventure' | 'student'
  sufficient: boolean
  availableEvidenceWords: number
  targetWords: number
  warning?: string
}

export function assessProfileEvidence(
  settings: RealProfileSettings,
  availableEvidenceWords: number,
): ProfileEvidenceAssessment[] {
  const parsed = RealProfileSettingsSchema.parse(settings)
  return parsed.profiles.filter(profile => profile.enabled).map(profile => {
    const minimumEvidenceWords = Math.ceil(profile.targetWords * 0.6)
    const sufficient = availableEvidenceWords >= minimumEvidenceWords
    return {
      profile: profile.profile,
      sufficient,
      availableEvidenceWords,
      targetWords: profile.targetWords,
      warning: sufficient
        ? undefined
        : `Evidencia insuficiente para unas ${profile.targetWords} palabras sin relleno.`,
    }
  })
}
