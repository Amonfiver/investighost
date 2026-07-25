import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import {
  ProviderActivationInputSchema,
  ProviderCenterSnapshotSchema,
  ProviderConfigureInputSchema,
  ProviderDeleteInputSchema,
  ProviderTestInputSchema,
  type ProviderCenterSnapshot,
  type ProviderConnectionState,
} from '@shared/provider-center-contracts'
import type { RealProviderCategory } from '@shared/real-pipeline-contracts'
import {
  OPENAI_ALLOWED_MODELS,
  OPENAI_DEFAULT_MODEL,
  PROVIDER_PRICING_CATALOG,
  pricingEntriesFor,
  pricingSummary,
  tariffStatus,
  type ProviderPricingCatalog,
} from '@shared/provider-pricing-catalog'

export interface ProviderCatalogEntry {
  id: string
  displayName: string
  category: RealProviderCategory
  models: string[]
  defaultModel: string
}

export const INITIAL_PROVIDER_CATALOG: readonly ProviderCatalogEntry[] = [
  {
    id: 'tavily',
    displayName: 'Tavily',
    category: 'research_tool',
    models: ['search-and-extract'],
    defaultModel: 'search-and-extract',
  },
  {
    id: 'openai',
    displayName: 'OpenAI',
    category: 'intelligence_engine',
    models: [...OPENAI_ALLOWED_MODELS],
    defaultModel: OPENAI_DEFAULT_MODEL,
  },
]

export interface SecureEncryption {
  isAvailable(): boolean
  encryptString(value: string): Buffer
  decryptString(value: Buffer): string
}

export interface SimulatedConnectionTester {
  test(provider: ProviderCatalogEntry, selectedModel: string): Promise<'simulated_ok' | 'simulated_error'>
}

export class DeterministicConnectionTester implements SimulatedConnectionTester {
  async test(): Promise<'simulated_ok'> {
    return 'simulated_ok'
  }
}

export type ProviderCenterErrorCode =
  | 'SECURE_STORAGE_UNAVAILABLE'
  | 'UNSAFE_STORAGE_PATH'
  | 'PROVIDER_NOT_FOUND'
  | 'INVALID_MODEL'
  | 'NOT_CONFIGURED'
  | 'REPLACE_CONFIRMATION_REQUIRED'
  | 'INVALID_STORED_DATA'
  | 'SECURE_OPERATION_FAILED'

export class ProviderCenterError extends Error {
  constructor(readonly code: ProviderCenterErrorCode, message: string) {
    super(message)
    this.name = 'ProviderCenterError'
  }
}

const StoredProviderSchema = z.object({
  selectedModel: z.string().trim().min(1).max(160),
  active: z.boolean(),
  encryptedCredential: z.string().min(1).optional(),
  lastTestAt: z.string().datetime({ offset: true }).optional(),
  connectionState: z.enum(['not_tested', 'simulated_ok', 'simulated_error']),
})
const StoredDocumentSchema = z.object({
  version: z.literal(1),
  providers: z.record(StoredProviderSchema),
})
type StoredProvider = z.infer<typeof StoredProviderSchema>
type StoredDocument = z.infer<typeof StoredDocumentSchema>

export interface ProviderCenterDependencies {
  now?: () => Date
  catalog?: readonly ProviderCatalogEntry[]
  connectionTester?: SimulatedConnectionTester
  projectDirectory?: string
  pricingCatalog?: ProviderPricingCatalog
}

export class ProviderCenterService {
  private readonly now: () => Date
  private readonly catalog: readonly ProviderCatalogEntry[]
  private readonly connectionTester: SimulatedConnectionTester
  private readonly projectDirectory: string
  private readonly pricingCatalog: ProviderPricingCatalog
  private document: StoredDocument = { version: 1, providers: {} }
  private initialized = false

  constructor(
    private readonly storageFile: string,
    private readonly encryption: SecureEncryption,
    dependencies: ProviderCenterDependencies = {},
  ) {
    this.now = dependencies.now ?? (() => new Date())
    this.catalog = dependencies.catalog ?? INITIAL_PROVIDER_CATALOG
    this.connectionTester = dependencies.connectionTester ?? new DeterministicConnectionTester()
    this.projectDirectory = path.resolve(dependencies.projectDirectory ?? process.cwd())
    this.pricingCatalog = dependencies.pricingCatalog ?? PROVIDER_PRICING_CATALOG
  }

  async initialize(): Promise<void> {
    this.assertExternalStoragePath()
    if (!this.encryption.isAvailable()) {
      this.initialized = true
      return
    }
    try {
      const content = await readFile(this.storageFile, 'utf8')
      this.document = StoredDocumentSchema.parse(JSON.parse(content))
      this.validateStoredDocument()
    } catch (error) {
      if (isFileNotFound(error)) {
        this.document = { version: 1, providers: {} }
      } else if (error instanceof ProviderCenterError) {
        throw error
      } else {
        throw new ProviderCenterError('INVALID_STORED_DATA', 'La configuración segura de proveedores no es válida')
      }
    }
    this.initialized = true
  }

  snapshot(): ProviderCenterSnapshot {
    this.assertInitialized()
    const secureStorageAvailable = this.encryption.isAvailable()
    return ProviderCenterSnapshotSchema.parse({
      secureStorageAvailable,
      simulationOnly: true,
      realClientsAvailable: true,
      externalCallsAllowed: false,
      pricingCatalogVersion: this.pricingCatalog.version,
      providers: this.catalog.map(provider => {
        const stored = secureStorageAvailable ? this.document.providers[provider.id] : undefined
        const configured = Boolean(stored?.encryptedCredential)
        const selectedModel = stored?.selectedModel ?? provider.defaultModel
        const pricing = pricingEntriesFor(provider.id, selectedModel, this.pricingCatalog)
        const statuses = pricing.map(entry => tariffStatus(entry, this.now()))
        const currentTariff = pricing.length > 0 && statuses.every(status => status === 'current')
        const firstTariff = pricing[0]
        return {
          id: provider.id,
          displayName: provider.displayName,
          category: provider.category,
          configured,
          credentialMask: configured ? '••••••••' : undefined,
          active: configured && Boolean(stored?.active),
          selectedModel,
          availableModels: provider.models,
          tariffStatus: currentTariff
            ? 'current'
            : statuses.includes('stale') ? 'stale' : 'unverified',
          tariffEffectiveFrom: firstTariff?.effectiveFrom,
          tariffVerifiedAt: firstTariff?.verifiedAt,
          tariffReviewAfter: firstTariff?.reviewAfter,
          tariffCurrency: firstTariff?.currency,
          tariffSummary: pricingSummary(pricing),
          tariffSource: firstTariff?.sourceUrl,
          lastTestAt: stored?.lastTestAt,
          connectionState: stored?.connectionState ?? 'not_tested',
        }
      }),
    })
  }

  async configure(candidate: unknown): Promise<ProviderCenterSnapshot> {
    this.assertSecure()
    const input = ProviderConfigureInputSchema.parse(candidate)
    const provider = this.provider(input.providerId)
    if (!provider.models.includes(input.selectedModel)) {
      throw new ProviderCenterError('INVALID_MODEL', 'El modelo seleccionado no pertenece al proveedor')
    }
    const current = this.document.providers[provider.id]
    if (current?.encryptedCredential && !input.confirmReplace) {
      throw new ProviderCenterError(
        'REPLACE_CONFIRMATION_REQUIRED',
        'Sustituir una credencial requiere confirmación explícita',
      )
    }
    let encryptedCredential: string
    try {
      encryptedCredential = this.encryption.encryptString(input.credential).toString('base64')
    } catch {
      throw new ProviderCenterError('SECURE_OPERATION_FAILED', 'No se pudo cifrar la credencial de forma segura')
    }
    this.document.providers[provider.id] = {
      selectedModel: input.selectedModel,
      active: current?.active ?? false,
      encryptedCredential,
      connectionState: 'not_tested',
    }
    await this.persist()
    return this.snapshot()
  }

  async setActive(candidate: unknown): Promise<ProviderCenterSnapshot> {
    this.assertSecure()
    const input = ProviderActivationInputSchema.parse(candidate)
    const provider = this.provider(input.providerId)
    const current = this.document.providers[provider.id]
    if (input.active && !current?.encryptedCredential) {
      throw new ProviderCenterError('NOT_CONFIGURED', 'El proveedor debe configurarse antes de activarlo')
    }
    for (const catalogEntry of this.catalog) {
      if (catalogEntry.category !== provider.category) continue
      const stored = this.document.providers[catalogEntry.id]
      if (stored) stored.active = catalogEntry.id === provider.id ? input.active : false
    }
    await this.persist()
    return this.snapshot()
  }

  async remove(candidate: unknown): Promise<ProviderCenterSnapshot> {
    this.assertSecure()
    const input = ProviderDeleteInputSchema.parse(candidate)
    this.provider(input.providerId)
    delete this.document.providers[input.providerId]
    await this.persist()
    return this.snapshot()
  }

  async testConnection(candidate: unknown): Promise<ProviderCenterSnapshot> {
    this.assertSecure()
    const input = ProviderTestInputSchema.parse(candidate)
    const provider = this.provider(input.providerId)
    const current = this.document.providers[provider.id]
    if (!current?.encryptedCredential) {
      throw new ProviderCenterError('NOT_CONFIGURED', 'El proveedor debe configurarse antes de probarlo')
    }
    this.assertCredentialDecrypts(current)
    let connectionState: ProviderConnectionState
    try {
      connectionState = await this.connectionTester.test(provider, current.selectedModel)
    } catch {
      connectionState = 'simulated_error'
    }
    current.connectionState = connectionState
    current.lastTestAt = this.now().toISOString()
    await this.persist()
    return this.snapshot()
  }

  async withCredential<T>(
    providerId: string,
    operation: (credential: string, selectedModel: string) => Promise<T>,
  ): Promise<T> {
    this.assertSecure()
    const provider = this.provider(providerId)
    const stored = this.document.providers[provider.id]
    if (!stored?.encryptedCredential) {
      throw new ProviderCenterError('NOT_CONFIGURED', 'El proveedor debe configurarse antes de usarse')
    }
    if (!stored.active) {
      throw new ProviderCenterError('NOT_CONFIGURED', 'El proveedor debe estar activo antes de usarse')
    }
    const credential = this.decryptCredential(stored)
    try {
      const result = await operation(credential, stored.selectedModel)
      if (containsCredential(result, credential)) {
        throw new ProviderCenterError(
          'SECURE_OPERATION_FAILED',
          'La operación intentó devolver material de credencial',
        )
      }
      return result
    } catch (error) {
      if (error instanceof ProviderCenterError) throw error
      if (containsCredential(error, credential)) {
        throw new ProviderCenterError('SECURE_OPERATION_FAILED', 'La operación segura del proveedor falló')
      }
      throw error
    }
  }

  private assertCredentialDecrypts(provider: StoredProvider): void {
    this.decryptCredential(provider)
  }

  private decryptCredential(provider: StoredProvider): string {
    try {
      const decrypted = this.encryption.decryptString(Buffer.from(provider.encryptedCredential ?? '', 'base64'))
      if (decrypted.length < 8) throw new Error('invalid')
      return decrypted
    } catch {
      throw new ProviderCenterError('SECURE_OPERATION_FAILED', 'La credencial cifrada no se puede validar')
    }
  }

  private provider(providerId: string): ProviderCatalogEntry {
    const provider = this.catalog.find(entry => entry.id === providerId)
    if (!provider) throw new ProviderCenterError('PROVIDER_NOT_FOUND', 'El proveedor solicitado no existe')
    return provider
  }

  private validateStoredDocument(): void {
    for (const [providerId, stored] of Object.entries(this.document.providers)) {
      const provider = this.catalog.find(entry => entry.id === providerId)
      if (!provider || !provider.models.includes(stored.selectedModel)) {
        throw new ProviderCenterError('INVALID_STORED_DATA', 'La configuración segura de proveedores no es válida')
      }
    }
    for (const category of ['research_tool', 'intelligence_engine'] as const) {
      const active = this.catalog.filter(entry =>
        entry.category === category && this.document.providers[entry.id]?.active,
      )
      if (active.length > 1) {
        throw new ProviderCenterError('INVALID_STORED_DATA', 'La configuración activa de proveedores no es válida')
      }
    }
  }

  private assertExternalStoragePath(): void {
    const resolved = path.resolve(this.storageFile)
    if (resolved === this.projectDirectory || resolved.startsWith(`${this.projectDirectory}${path.sep}`)) {
      throw new ProviderCenterError(
        'UNSAFE_STORAGE_PATH',
        'Las credenciales no pueden almacenarse dentro del proyecto',
      )
    }
  }

  private assertInitialized(): void {
    if (!this.initialized) throw new ProviderCenterError('SECURE_OPERATION_FAILED', 'El centro de proveedores no está preparado')
  }

  private assertSecure(): void {
    this.assertInitialized()
    if (!this.encryption.isAvailable()) {
      throw new ProviderCenterError(
        'SECURE_STORAGE_UNAVAILABLE',
        'El almacenamiento seguro del sistema no está disponible',
      )
    }
  }

  private async persist(): Promise<void> {
    const directory = path.dirname(this.storageFile)
    const temporaryFile = `${this.storageFile}.tmp`
    try {
      await mkdir(directory, { recursive: true })
      await writeFile(temporaryFile, JSON.stringify(this.document), { encoding: 'utf8', mode: 0o600 })
      await rename(temporaryFile, this.storageFile)
    } catch {
      throw new ProviderCenterError('SECURE_OPERATION_FAILED', 'No se pudo guardar la configuración segura')
    }
  }
}

function isFileNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
}

function containsCredential(value: unknown, credential: string): boolean {
  if (typeof value === 'string') return value.includes(credential)
  if (value instanceof Error) {
    return value.message.includes(credential)
      || Boolean(value.stack?.includes(credential))
      || containsCredential(value.cause, credential)
  }
  try {
    return JSON.stringify(value).includes(credential)
  } catch {
    return false
  }
}
