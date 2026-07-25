import { mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { RealProfileSettingsStore } from '@modules/real-pipeline/profile-settings'
import {
  RealProfileSettingsSchema,
  assessProfileEvidence,
  defaultRealProfileSettings,
  missionProfilesFromSettings,
} from '@shared/real-profile-settings'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function store() {
  const directory = await mkdtemp(path.join(tmpdir(), 'investighost-real-profiles-'))
  directories.push(directory)
  const file = path.join(directory, 'settings', 'profiles.json')
  return {
    file,
    settings: new RealProfileSettingsStore(
      file,
      process.cwd(),
      () => new Date('2026-07-25T12:30:00.000Z'),
    ),
  }
}

describe('roles y extensión del pipeline real', () => {
  it('expone defaults Aventura 1000 y Estudiante 1800', () => {
    const settings = defaultRealProfileSettings(new Date('2026-07-25T12:00:00.000Z'))
    expect(settings.profiles).toEqual([
      { profile: 'adventure', enabled: true, targetWords: 1_000, depth: 'standard' },
      { profile: 'student', enabled: true, targetWords: 1_800, depth: 'deep' },
    ])
    expect(settings.sharedResearch).toBe(true)
  })

  it('valida mínimo, máximo e incrementos de 100', () => {
    const defaults = defaultRealProfileSettings()
    expect(RealProfileSettingsSchema.safeParse({
      ...defaults,
      profiles: defaults.profiles.map(profile =>
        profile.profile === 'adventure' ? { ...profile, targetWords: 800 } : profile,
      ),
    }).success).toBe(true)
    for (const invalid of [700, 850, 4_100]) {
      expect(RealProfileSettingsSchema.safeParse({
        ...defaults,
        profiles: defaults.profiles.map(profile =>
          profile.profile === 'adventure' ? { ...profile, targetWords: invalid } : profile,
        ),
      }).success).toBe(false)
    }
  })

  it('requiere perfiles independientes, únicos y al menos uno activo', () => {
    const defaults = defaultRealProfileSettings()
    expect(RealProfileSettingsSchema.safeParse({
      ...defaults,
      profiles: defaults.profiles.map(profile => ({ ...profile, enabled: false })),
    }).success).toBe(false)
    expect(RealProfileSettingsSchema.safeParse({
      ...defaults,
      profiles: [defaults.profiles[0], { ...defaults.profiles[1], profile: 'adventure' }],
    }).success).toBe(false)
  })

  it('persiste controles y los recupera tras un reinicio simulado', async () => {
    const { file, settings } = await store()
    const defaults = await settings.load()
    const saved = await settings.save({
      ...defaults,
      profiles: [
        { profile: 'adventure', enabled: false, targetWords: 1_200, depth: 'deep' },
        { profile: 'student', enabled: true, targetWords: 2_000, depth: 'standard' },
      ],
    })
    const restarted = new RealProfileSettingsStore(file, process.cwd())

    expect(await restarted.load()).toEqual(saved)
    expect(saved.updatedAt).toBe('2026-07-25T12:30:00.000Z')
  })

  it('mantiene configuración independiente por perfil al construir la misión', () => {
    const profiles = missionProfilesFromSettings(RealProfileSettingsSchema.parse({
      ...defaultRealProfileSettings(),
      profiles: [
        { profile: 'adventure', enabled: true, targetWords: 900, depth: 'deep' },
        { profile: 'student', enabled: false, targetWords: 2_100, depth: 'standard' },
      ],
    }))

    expect(profiles).toEqual([
      { profile: 'adventure', enabled: true, targetWords: 900, depth: 'deep' },
      { profile: 'student', enabled: false, targetWords: 2_100, depth: 'standard' },
    ])
  })

  it('avisa si la evidencia no cubre la extensión sin relleno', () => {
    const settings = defaultRealProfileSettings()
    const insufficient = assessProfileEvidence(settings, 500)
    const sufficient = assessProfileEvidence(settings, 2_000)

    expect(insufficient.every(result => !result.sufficient && result.warning?.includes('sin relleno'))).toBe(true)
    expect(sufficient.every(result => result.sufficient && result.warning === undefined)).toBe(true)
  })

  it('preserva una única investigación compartida para ambos perfiles', () => {
    const settings = defaultRealProfileSettings()
    expect(settings.sharedResearch).toBe(true)
    expect(missionProfilesFromSettings(settings).filter(profile => profile.enabled)).toHaveLength(2)
  })

  it('rechaza guardar preferencias dentro del proyecto', async () => {
    const settings = new RealProfileSettingsStore(
      path.join(process.cwd(), 'forbidden-profile-settings.json'),
      process.cwd(),
    )
    await expect(settings.load()).rejects.toMatchObject({ code: 'UNSAFE_SETTINGS_PATH' })
  })
})
