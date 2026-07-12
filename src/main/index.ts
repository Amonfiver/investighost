/**
 * Investighost - Proceso Principal (Main Process)
 * 
 * Propósito: Punto de entrada de Electron, gestión de ventana y sistema
 * Alcance: Node.js/Electron main process - no tiene acceso a DOM
 * 
 * Decisiones técnicas:
 *   - Carga variables de entorno desde .env al inicio
 *   - Inicializa configuración de proveedores de IA
 *   - Usa electron-is-dev para detectar modo desarrollo
 *   - Carga Vite dev server en desarrollo, archivos estáticos en producción
 *   - Preload script para comunicación segura main/renderer
 * 
 * Limitaciones:
 *   - better-sqlite3 requiere build tools nativas (VS Build Tools en Windows)
 *   - Por ahora la DB está preparada pero no inicializada
 * 
 * Cambios recientes: 
 *   - Añadido carga de .env y configuración de proveedores
 *   - Integrado sistema de config multi-proveedor
 */

import { app, BrowserWindow, ipcMain } from 'electron'
import type { BrowserWindow as BrowserWindowType } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

// ============================================
// CARGA CONFIGURACIÓN DESDE .ENV
// ============================================

// Detectar modo desarrollo ANTES de cualquier otra operación
const isDev = !app.isPackaged

// Cargar .env desde la raíz del proyecto
// En desarrollo: process.cwd() apunta a la raíz del proyecto
// En producción: usar __dirname relativo al ejecutable
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const rootDir = isDev 
  ? process.cwd() 
  : path.join(__dirname, '../..')

const envPath = path.join(rootDir, '.env')
console.log('[Main] Loading .env from:', envPath)

const dotenvResult = dotenv.config({ path: envPath })
console.log(`[Main] dotenv loaded: ${dotenvResult.parsed ? Object.keys(dotenvResult.parsed).length : 0} variables`)

// Cargar configuración de la app
import { loadConfig, getProviderConfigStatus } from '@services/config'
import { createProviderConfigFromEnv, initializeProviderFactory } from '@services/ai/providers'

// Inicializar configuración (esto debe hacerse antes de cualquier otra cosa)
loadConfig()
initializeProviderFactory(createProviderConfigFromEnv())

// Log de estado de proveedores
const providerStatus = getProviderConfigStatus()
console.log('[Main] Provider status:', {
  kimi: providerStatus.kimi.configured ? '✅ configured' : '❌ not configured',
  openai: providerStatus.openai.configured ? '✅ configured' : '❌ not configured',
})

const shouldOpenDevTools = process.env.OPEN_DEVTOOLS === 'true'

// Mantener referencia global para evitar garbage collection
let mainWindow: BrowserWindowType | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    titleBarStyle: 'default',
    show: false, // Mostrar cuando esté listo para evitar parpadeo
  })

  // Cargar contenido según entorno
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    if (shouldOpenDevTools) {
      mainWindow.webContents.openDevTools()
    }
  } else {
    mainWindow.loadFile(path.join(__dirname, '../index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ============================================
// IPC HANDLERS
// ============================================

ipcMain.handle('app:get-version', () => {
  return app.getVersion()
})

ipcMain.handle('app:get-platform', () => {
  return process.platform
})

// Nuevo: Verificar estado de configuración de proveedores
ipcMain.handle('ai:get-provider-status', () => {
  return getProviderConfigStatus()
})

// Research handlers - conectan UI con backend real
import { researchModule } from '@modules/research'
import * as store from '@modules/persistence/memory-store'
import { collectWebResearchBundle } from '@services/search'
import { z } from 'zod'
import { getContributionImportRuntime } from '@modules/contributions/runtime'

ipcMain.handle('research:create', async (_event, input) => {
  console.log('[IPC] research:create called with:', JSON.stringify(input))
  const request = await researchModule.createRequest(input)
  console.log('[IPC] research:create returned:', request.id)
  return request
})

ipcMain.handle('research:start', async (_event, requestId) => {
  console.log('[IPC] research:start called for:', requestId)
  // Iniciar investigación en background (no esperamos a que termine)
  researchModule.startResearch(requestId).catch(err => {
    console.error('[IPC] research:start failed:', err.message)
  })
  console.log('[IPC] research:start initiated for:', requestId)
  return { started: true, requestId }
})

ipcMain.handle('research:get-all', async () => {
  return researchModule.getAllRequests()
})

ipcMain.handle('research:get-result', async (_event, requestId) => {
  const result = await researchModule.getResult(requestId)
  if (result) {
    console.log('[IPC] research:get-result found for:', requestId)
  }
  return result
})

ipcMain.handle('research:get-draft', async (_event, resultId) => {
  const draft = await store.getDraftByResultId(resultId)
  if (draft) {
    console.log('[IPC] research:get-draft found for resultId:', resultId)
  }
  return draft
})

ipcMain.handle('search:collect', async (_event, input) => {
  console.log('[IPC] search:collect called')
  return collectWebResearchBundle(input)
})

ipcMain.handle('contributions:import-pending', async () => {
  return getContributionImportRuntime().importPending()
})

ipcMain.handle('contributions:list-jobs', async () => {
  return getContributionImportRuntime().listJobs()
})

ipcMain.handle('contributions:retry-job', async (_event, jobId: unknown) => {
  return getContributionImportRuntime().retryJob(z.string().uuid().parse(jobId))
})

// Ciclo de vida de la app
app.whenReady().then(() => {
  // Inicializa únicamente la persistencia local; no conecta ninguna fuente remota real.
  getContributionImportRuntime()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
