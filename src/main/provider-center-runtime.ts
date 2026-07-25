import { app, safeStorage } from 'electron'
import path from 'node:path'
import {
  ProviderCenterService,
  type SecureEncryption,
} from '@modules/real-pipeline/provider-center'

class ElectronSafeEncryption implements SecureEncryption {
  isAvailable(): boolean {
    if (!safeStorage.isEncryptionAvailable()) return false
    if (process.platform !== 'linux') return true
    const backend = safeStorage.getSelectedStorageBackend()
    return backend !== 'basic_text' && backend !== 'unknown'
  }

  encryptString(value: string): Buffer {
    return safeStorage.encryptString(value)
  }

  decryptString(value: Buffer): string {
    return safeStorage.decryptString(value)
  }
}

let runtime: Promise<ProviderCenterService> | undefined

export function getProviderCenterRuntime(): Promise<ProviderCenterService> {
  if (!runtime) {
    runtime = createRuntime().catch(error => {
      runtime = undefined
      throw error
    })
  }
  return runtime
}

async function createRuntime(): Promise<ProviderCenterService> {
  const service = new ProviderCenterService(
    path.join(app.getPath('userData'), 'secure', 'provider-center.v1.json'),
    new ElectronSafeEncryption(),
  )
  await service.initialize()
  return service
}
