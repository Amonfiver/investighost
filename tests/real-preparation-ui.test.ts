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

  it('separa conectividad y piloto editorial, cuyo inicio depende del preflight', async () => {
    const renderer = await source('src/renderer/App.tsx')

    expect(renderer).toContain('Preflight real sin red')
    expect(renderer).toContain('Tarifa oficial')
    expect(renderer).toContain('Probar conectividad real')
    expect(renderer).toContain('window.confirm')
    expect(renderer).toContain('1 USD = 1 EUR')
    expect(renderer.match(/Probar conectividad real/g)).toHaveLength(1)
    expect(renderer).toContain('Preparar piloto')
    expect(renderer).toContain('Confirmar presupuesto 0,20 EUR')
    expect(renderer).toContain('Iniciar piloto real')
    expect(renderer).toContain('disabled={!preflight.startActionEnabled || operation !== null}')
    expect(renderer).toContain('Reanudar desde checkpoint')
  })

  it('main expone IPC editorial validado tras una feature flag independiente', async () => {
    const main = await source('src/main/index.ts')
    const runtime = await source('src/main/real-editorial-pilot-runtime.ts')

    expect(main).toContain("ipcMain.handle('real-preflight:get'")
    expect(main).toContain("ipcMain.handle('real-connectivity:run'")
    expect(main).toContain("ipcMain.handle('real-editorial:preflight'")
    expect(main).toContain("ipcMain.handle('real-editorial:start'")
    expect(main).toContain("ipcMain.handle('real-editorial:cancel'")
    expect(main).toContain("ipcMain.handle('real-editorial:resume'")
    expect(runtime).toContain('process.env.INVESTIGHOST_REAL_EDITORIAL_TOKEN')
    expect(runtime).not.toMatch(/KIMI_API_KEY|BRAVE_SEARCH_API_KEY|OPENAI_API_KEY|TAVILY_API_KEY/)
    expect(runtime).toContain('withLiveProviderClients')
    expect(runtime).not.toContain('api.tavily.com')
    expect(runtime).not.toContain('api.openai.com')
  })
})
