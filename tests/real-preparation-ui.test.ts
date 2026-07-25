import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

async function source(relativePath: string): Promise<string> {
  return readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8')
}

describe('superficie de preparación real sin ejecución', () => {
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

  it('muestra preflight, tarifas y conectividad deshabilitada sin acción Morella', async () => {
    const renderer = await source('src/renderer/App.tsx')

    expect(renderer).toContain('Preflight real sin red')
    expect(renderer).toContain('Tarifa oficial')
    expect(renderer).toContain('Preparar prueba de conectividad')
    expect(renderer).toMatch(/<button className="button primary" disabled>Preparar prueba de conectividad<\/button>/)
    expect(renderer).not.toMatch(/executeMorella|runMorella|startRealResearch/)
  })

  it('el proceso main solo registra lectura de preflight y no conectividad real', async () => {
    const main = await source('src/main/index.ts')
    const runtime = await source('src/main/real-connectivity-preflight-runtime.ts')

    expect(main).toContain("ipcMain.handle('real-preflight:get'")
    expect(main).not.toMatch(/real-connectivity:(run|test)|real-research:(run|start)/)
    expect(runtime).toContain('process.env.INVESTIGHOST_REAL_EXECUTION_TOKEN')
    expect(runtime).not.toMatch(/KIMI_API_KEY|BRAVE_SEARCH_API_KEY|OPENAI_API_KEY|TAVILY_API_KEY/)
    expect(runtime).not.toContain('withLiveProviderClients')
    expect(runtime).not.toContain('api.tavily.com')
    expect(runtime).not.toContain('api.openai.com')
  })
})
