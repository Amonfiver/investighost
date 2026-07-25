import { app } from 'electron'
import path from 'node:path'
import { RealProfileSettingsStore } from '@modules/real-pipeline/profile-settings'

let runtime: RealProfileSettingsStore | undefined

export function getRealProfileSettingsRuntime(): RealProfileSettingsStore {
  runtime ??= new RealProfileSettingsStore(
    path.join(app.getPath('userData'), 'settings', 'real-editorial-profiles.v1.json'),
  )
  return runtime
}
