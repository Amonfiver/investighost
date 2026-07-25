import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  RealProfileSettingsSchema,
  defaultRealProfileSettings,
  type RealProfileSettings,
} from '@shared/real-profile-settings'

export type RealProfileSettingsErrorCode =
  | 'UNSAFE_SETTINGS_PATH'
  | 'INVALID_SETTINGS'
  | 'SETTINGS_WRITE_FAILED'

export class RealProfileSettingsError extends Error {
  constructor(readonly code: RealProfileSettingsErrorCode, message: string) {
    super(message)
    this.name = 'RealProfileSettingsError'
  }
}

export class RealProfileSettingsStore {
  constructor(
    private readonly storageFile: string,
    private readonly projectDirectory = process.cwd(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  async load(): Promise<RealProfileSettings> {
    this.assertExternalPath()
    try {
      return RealProfileSettingsSchema.parse(JSON.parse(await readFile(this.storageFile, 'utf8')))
    } catch (error) {
      if (isFileNotFound(error)) return defaultRealProfileSettings(this.now())
      if (error instanceof RealProfileSettingsError) throw error
      throw new RealProfileSettingsError('INVALID_SETTINGS', 'La configuración editorial guardada no es válida')
    }
  }

  async save(candidate: unknown): Promise<RealProfileSettings> {
    this.assertExternalPath()
    const parsed = RealProfileSettingsSchema.parse({
      ...(candidate as Record<string, unknown>),
      version: 'real-profile-settings-v1',
      sharedResearch: true,
      updatedAt: this.now().toISOString(),
    })
    const directory = path.dirname(this.storageFile)
    const temporary = `${this.storageFile}.tmp`
    try {
      await mkdir(directory, { recursive: true })
      await writeFile(temporary, JSON.stringify(parsed), { encoding: 'utf8', mode: 0o600 })
      await rename(temporary, this.storageFile)
      return parsed
    } catch {
      throw new RealProfileSettingsError('SETTINGS_WRITE_FAILED', 'No se pudo guardar la configuración editorial')
    }
  }

  private assertExternalPath(): void {
    const project = path.resolve(this.projectDirectory)
    const target = path.resolve(this.storageFile)
    if (target === project || target.startsWith(`${project}${path.sep}`)) {
      throw new RealProfileSettingsError(
        'UNSAFE_SETTINGS_PATH',
        'La configuración de usuario debe guardarse fuera del proyecto',
      )
    }
  }
}

function isFileNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
}
