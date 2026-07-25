import { mkdtemp, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ProviderCenterService,
  ProviderCenterError,
  type ProviderCatalogEntry,
  type SecureEncryption,
  type SimulatedConnectionTester,
} from '@modules/real-pipeline/provider-center'
import {
  ProviderConfigureInputSchema,
  ProviderDeleteInputSchema,
} from '@shared/provider-center-contracts'

const syntheticCredential = 'synthetic-provider-key'
const directories: string[] = []

class SyntheticEncryption implements SecureEncryption {
  constructor(private readonly available = true) {}
  isAvailable(): boolean { return this.available }
  encryptString(value: string): Buffer {
    return Buffer.from([...value].reverse().join(''), 'utf8')
  }
  decryptString(value: Buffer): string {
    return [...value.toString('utf8')].reverse().join('')
  }
}

class ThrowingEncryption extends SyntheticEncryption {
  encryptString(value: string): Buffer {
    throw new Error(value)
  }
}

const catalog: ProviderCatalogEntry[] = [
  {
    id: 'tavily',
    displayName: 'Tavily',
    category: 'research_tool',
    models: ['search-and-extract'],
    defaultModel: 'search-and-extract',
  },
  {
    id: 'research-alternative',
    displayName: 'Alternativa sintética',
    category: 'research_tool',
    models: ['fixture'],
    defaultModel: 'fixture',
  },
  {
    id: 'openai',
    displayName: 'OpenAI',
    category: 'intelligence_engine',
    models: ['gpt-5.6-luna'],
    defaultModel: 'gpt-5.6-luna',
  },
]

afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function service(
  encryption: SecureEncryption = new SyntheticEncryption(),
  tester?: SimulatedConnectionTester,
): Promise<{ center: ProviderCenterService; file: string }> {
  const directory = await mkdtemp(path.join(tmpdir(), 'investighost-provider-center-'))
  directories.push(directory)
  const file = path.join(directory, 'secure', 'providers.json')
  const center = new ProviderCenterService(file, encryption, {
    catalog,
    connectionTester: tester,
    projectDirectory: process.cwd(),
    now: () => new Date('2026-07-25T10:15:00.000Z'),
  })
  await center.initialize()
  return { center, file }
}

function configuration(providerId = 'tavily', credential = syntheticCredential) {
  return {
    providerId,
    credential,
    selectedModel: providerId === 'research-alternative'
      ? 'fixture'
      : providerId === 'openai' ? 'gpt-5.6-luna' : 'search-and-extract',
    confirmReplace: false,
  }
}

describe('Centro seguro de proveedores', () => {
  it('guarda una credencial cifrada fuera del proyecto y solo devuelve máscara', async () => {
    const { center, file } = await service()
    const snapshot = await center.configure(configuration())
    const serialized = JSON.stringify(snapshot)
    const stored = await readFile(file, 'utf8')

    expect(snapshot.providers[0]).toMatchObject({
      configured: true,
      credentialMask: '••••••••',
    })
    expect(serialized).not.toContain(syntheticCredential)
    expect(stored).not.toContain(syntheticCredential)
  })

  it('guarda también una credencial OpenAI sintética y su modelo permitido', async () => {
    const openAICredential = 'synthetic-openai-provider-key'
    const { center, file } = await service()
    const snapshot = await center.configure(configuration('openai', openAICredential))
    const openAI = snapshot.providers.find(provider => provider.id === 'openai')

    expect(openAI).toMatchObject({
      configured: true,
      credentialMask: '••••••••',
      selectedModel: 'gpt-5.6-luna',
      tariffStatus: 'current',
    })
    expect(JSON.stringify(snapshot)).not.toContain(openAICredential)
    expect(await readFile(file, 'utf8')).not.toContain(openAICredential)
  })

  it('requiere confirmación y sustituye la credencial sin conservar la anterior', async () => {
    const { center, file } = await service()
    await center.configure(configuration())
    await expect(center.configure(configuration('tavily', 'second-synthetic-key'))).rejects.toMatchObject({
      code: 'REPLACE_CONFIRMATION_REQUIRED',
    })

    await center.configure({
      ...configuration('tavily', 'second-synthetic-key'),
      confirmReplace: true,
    })
    const stored = await readFile(file, 'utf8')
    expect(stored).not.toContain(syntheticCredential)
    expect(stored).not.toContain('second-synthetic-key')
  })

  it('elimina solo con confirmación explícita', async () => {
    const { center } = await service()
    await center.configure(configuration())
    expect(ProviderDeleteInputSchema.safeParse({
      providerId: 'tavily',
      confirmation: 'sí',
    }).success).toBe(false)

    const snapshot = await center.remove({ providerId: 'tavily', confirmation: 'ELIMINAR' })
    expect(snapshot.providers.find(provider => provider.id === 'tavily')?.configured).toBe(false)
  })

  it('activa un único proveedor por categoría', async () => {
    const { center } = await service()
    await center.configure(configuration())
    await center.configure(configuration('research-alternative', 'alternative-synthetic-key'))
    await center.setActive({ providerId: 'tavily', active: true })
    const snapshot = await center.setActive({ providerId: 'research-alternative', active: true })
    const activeResearch = snapshot.providers.filter(provider =>
      provider.category === 'research_tool' && provider.active,
    )

    expect(activeResearch.map(provider => provider.id)).toEqual(['research-alternative'])
  })

  it('impide activar un proveedor sin credencial', async () => {
    const { center } = await service()
    await expect(center.setActive({ providerId: 'openai', active: true })).rejects.toMatchObject({
      code: 'NOT_CONFIGURED',
    })
  })

  it('falla cerrado cuando safeStorage no está disponible', async () => {
    const { center } = await service(new SyntheticEncryption(false))
    expect(center.snapshot()).toMatchObject({
      secureStorageAvailable: false,
      providers: expect.arrayContaining([
        expect.objectContaining({ id: 'tavily', configured: false, active: false }),
      ]),
    })
    await expect(center.configure(configuration())).rejects.toMatchObject({
      code: 'SECURE_STORAGE_UNAVAILABLE',
    })
  })

  it('rehidrata tras un reinicio simulado sin revelar la credencial', async () => {
    const { center, file } = await service()
    await center.configure(configuration())
    await center.setActive({ providerId: 'tavily', active: true })

    const restarted = new ProviderCenterService(file, new SyntheticEncryption(), {
      catalog,
      projectDirectory: process.cwd(),
    })
    await restarted.initialize()
    const snapshot = restarted.snapshot()

    expect(snapshot.providers.find(provider => provider.id === 'tavily')).toMatchObject({
      configured: true,
      active: true,
      credentialMask: '••••••••',
    })
    expect(JSON.stringify(snapshot)).not.toContain(syntheticCredential)
  })

  it('ejecuta únicamente el comprobador simulado y registra su resultado', async () => {
    let calls = 0
    const tester: SimulatedConnectionTester = {
      test: async () => {
        calls += 1
        return 'simulated_ok'
      },
    }
    const { center } = await service(new SyntheticEncryption(), tester)
    await center.configure(configuration())
    const snapshot = await center.testConnection({ providerId: 'tavily' })

    expect(calls).toBe(1)
    expect(snapshot.providers[0]).toMatchObject({
      connectionState: 'simulated_ok',
      lastTestAt: '2026-07-25T10:15:00.000Z',
    })
  })

  it('solo descifra durante una operación main activa y nunca permite devolver la clave', async () => {
    const { center } = await service()
    await center.configure(configuration())
    await center.setActive({ providerId: 'tavily', active: true })

    await expect(center.withCredential('tavily', async (credential, selectedModel) => ({
      selectedModel,
      credentialLength: credential.length,
    }))).resolves.toEqual({
      selectedModel: 'search-and-extract',
      credentialLength: syntheticCredential.length,
    })
    await expect(center.withCredential('tavily', async credential => credential)).rejects.toMatchObject({
      code: 'SECURE_OPERATION_FAILED',
    })
  })

  it('sanea errores y logs sin exponer el secreto sintético', async () => {
    const { center } = await service()
    await center.configure(configuration())
    await center.setActive({ providerId: 'tavily', active: true })
    const messages: string[] = []
    let failure: unknown

    try {
      await center.withCredential('tavily', async credential => {
        messages.push('operación segura iniciada')
        throw new Error(`fallo interno ${credential}`)
      })
    } catch (error) {
      failure = error
    }

    expect(messages.join(' ')).not.toContain(syntheticCredential)
    expect(String(failure)).not.toContain(syntheticCredential)
  })

  it('rechaza IPC inválido antes de tocar el almacenamiento', () => {
    expect(ProviderConfigureInputSchema.safeParse({
      providerId: '../tavily',
      credential: 'short',
      selectedModel: 'unknown',
    }).success).toBe(false)
  })

  it('no filtra una credencial en errores de cifrado', async () => {
    const { center } = await service(new ThrowingEncryption())
    let failure: unknown
    try {
      await center.configure(configuration())
    } catch (error) {
      failure = error
    }

    expect(failure).toBeInstanceOf(ProviderCenterError)
    expect(String(failure)).not.toContain(syntheticCredential)
  })

  it('rechaza cualquier archivo de credenciales dentro del proyecto', async () => {
    const center = new ProviderCenterService(
      path.join(process.cwd(), 'forbidden-provider-data.json'),
      new SyntheticEncryption(),
      { projectDirectory: process.cwd() },
    )

    await expect(center.initialize()).rejects.toMatchObject({ code: 'UNSAFE_STORAGE_PATH' })
  })
})
