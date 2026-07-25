import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

async function source(relativePath: string): Promise<string> {
  return readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8')
}

describe('superficie de preparación y conectividad real controlada', () => {
  it('expone credenciales por escritura y solo devuelve snapshots públicos', async () => {
    const preload = await source('src/main/preload.ts')
    const contracts = await source('src/shared/provider-center-contracts.ts')

    expect(preload).toContain("ipcRenderer.invoke('providers:configure'")
    expect(preload).toContain("ipcRenderer.invoke('providers:remove'")
    expect(preload).toContain("ipcRenderer.invoke('real-preflight:get')")
    expect(preload).not.toMatch(/getProviderCredential|decryptCredential/)
    expect(contracts).toContain("credentialMask: z.literal('••••••••').optional()")
    expect(contracts).not.toMatch(/decryptedCredential|apiKey|credentialValue/)
  })

  it('muestra preflight, tarifas y una única acción confirmada sin acción Morella', async () => {
    const renderer = await source('src/renderer/App.tsx')

    expect(renderer).toContain('Preflight real sin red')
    expect(renderer).toContain('Tarifa oficial')
    expect(renderer).toContain('Probar conectividad real')
    expect(renderer).toContain('window.confirm')
    expect(renderer).toContain('1 USD = 1 EUR')
    expect(renderer.match(/Probar conectividad real/g)).toHaveLength(1)
    expect(renderer).not.toMatch(/executeMorella|runMorella|startRealResearch/)
  })

  it('el proceso main expone solo el check de conectividad y mantiene bloqueada la investigación', async () => {
    const main = await source('src/main/index.ts')
    const runtime = await source('src/main/real-connectivity-preflight-runtime.ts')

    expect(main).toContain("ipcMain.handle('real-preflight:get'")
    expect(main).toContain("ipcMain.handle('real-connectivity:run'")
    expect(main).not.toMatch(/real-research:(run|start)/)
    expect(runtime).toContain('process.env.INVESTIGHOST_REAL_EXECUTION_TOKEN')
    expect(runtime).not.toMatch(/KIMI_API_KEY|BRAVE_SEARCH_API_KEY|OPENAI_API_KEY|TAVILY_API_KEY/)
    expect(runtime).not.toContain('withLiveProviderClients')
    expect(runtime).not.toContain('api.tavily.com')
    expect(runtime).not.toContain('api.openai.com')
  })
})
