/**
 * Investighost - Proceso Principal (Main Process)
 * 
 * Propósito: Punto de entrada de Electron, gestión de ventana y sistema
 * Alcance: Node.js/Electron main process - no tiene acceso a DOM
 * 
 * Decisiones técnicas:
 *   - Carga variables de entorno desde .env al inicio
 *   - Usa electron-is-dev para detectar modo desarrollo
 *   - Carga Vite dev server en desarrollo, archivos estáticos en producción
 *   - Preload script para comunicación segura main/renderer
 * 
 * Limitaciones:
 *   - Contribuciones usa exclusivamente Supabase local desde el proceso principal.
 * 
 * Cambios recientes: 
 *   - El pipeline Manual activo usa exclusivamente proveedores mock locales.
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

import { z } from 'zod'
import {
  LibraryPageQuerySchema,
  LibraryPageSchema,
} from '@shared/library-contracts'
import { getContributionImportRuntime, getContributionPersistenceStatus } from '@modules/contributions/runtime'
import {
  getManualPersistenceStatus,
  getManualResearchRuntime,
  MANUAL_LOCAL_ACTOR_ID,
} from '@modules/editorial-pipeline/manual-runtime'
import { getProviderCenterRuntime } from './provider-center-runtime'
import { getRealConnectivityPreflightRuntime } from './real-connectivity-preflight-runtime'
import { getRealProfileSettingsRuntime } from './real-profile-settings-runtime'

ipcMain.handle('contributions:import-pending', async () => {
  return (await getContributionImportRuntime()).importPending()
})

ipcMain.handle('contributions:list-jobs', async () => {
  return (await getContributionImportRuntime()).listJobs()
})

ipcMain.handle('contributions:retry-job', async (_event, jobId: unknown) => {
  return (await getContributionImportRuntime()).retryJob(z.string().uuid().parse(jobId))
})

ipcMain.handle('contributions:persistence-status', () => getContributionPersistenceStatus())

// Pipeline Manual canónico. Toda persistencia y toda clave privilegiada permanecen en main.
ipcMain.handle('manual:persistence-status', () => getManualPersistenceStatus())

ipcMain.handle('manual:get-actor', () => MANUAL_LOCAL_ACTOR_ID)

ipcMain.handle('manual:resolve-destination', async (_event, input: unknown) => {
  return (await getManualResearchRuntime()).resolveDestination(input as never)
})

ipcMain.handle('manual:correct-destination', async (_event, input: unknown) => {
  return (await getManualResearchRuntime()).correctDestination(input as never)
})

ipcMain.handle('manual:start', async (_event, input: unknown) => {
  return (await getManualResearchRuntime()).startForInterface(input as never)
})

ipcMain.handle('manual:resume', async (_event, input: unknown) => {
  return (await getManualResearchRuntime()).resume(input as never)
})

ipcMain.handle('manual:retry', async (_event, input: unknown) => {
  return (await getManualResearchRuntime()).retryForInterface(input as never)
})

ipcMain.handle('manual:cancel', async (_event, input: unknown) => {
  return (await getManualResearchRuntime()).cancel(input as never)
})

ipcMain.handle('manual:list', async (_event, input: unknown) => {
  const query = LibraryPageQuerySchema.parse(input === undefined ? {} : input)
  return LibraryPageSchema.parse(await (await getManualResearchRuntime()).list(query))
})

ipcMain.handle('manual:get', async (_event, requestId: unknown) => {
  return (await getManualResearchRuntime()).get(z.string().uuid().parse(requestId))
})

ipcMain.handle('manual:list-draft-versions', async (_event, requestId: unknown) => {
  return (await getManualResearchRuntime()).listDraftVersions(z.string().uuid().parse(requestId))
})

ipcMain.handle('manual:edit-section', async (_event, input: unknown) => {
  return (await getManualResearchRuntime()).editSection(input as never)
})

ipcMain.handle('manual:regenerate-section', async (_event, input: unknown) => {
  return (await getManualResearchRuntime()).regenerateSection(input as never)
})

ipcMain.handle('manual:submit-review', async (_event, input: unknown) => {
  return (await getManualResearchRuntime()).submitForReview(input as never)
})

ipcMain.handle('manual:decide', async (_event, input: unknown) => {
  return (await getManualResearchRuntime()).decide(input as never)
})

ipcMain.handle('manual:reopen-review', async (_event, input: unknown) => {
  return (await getManualResearchRuntime()).reopenReview(input as never)
})

// Centro de proveedores: las credenciales entran por canales de escritura específicos,
// se cifran en main y jamás forman parte de las respuestas.
ipcMain.handle('providers:list', async () => {
  return (await getProviderCenterRuntime()).snapshot()
})

ipcMain.handle('providers:configure', async (_event, input: unknown) => {
  return providerCenterAction(service => service.configure(input))
})

ipcMain.handle('providers:set-active', async (_event, input: unknown) => {
  return providerCenterAction(service => service.setActive(input))
})

ipcMain.handle('providers:remove', async (_event, input: unknown) => {
  return providerCenterAction(service => service.remove(input))
})

ipcMain.handle('providers:test-simulated', async (_event, input: unknown) => {
  return providerCenterAction(service => service.testConnection(input))
})

ipcMain.handle('real-preflight:get', () => getRealConnectivityPreflightRuntime())

ipcMain.handle('real-profiles:get', () => getRealProfileSettingsRuntime().load())

ipcMain.handle('real-profiles:save', async (_event, input: unknown) => {
  return getRealProfileSettingsRuntime().save(input)
})

async function providerCenterAction<T>(
  action: (service: Awaited<ReturnType<typeof getProviderCenterRuntime>>) => Promise<T>,
): Promise<T> {
  try {
    return await action(await getProviderCenterRuntime())
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : 'El centro de proveedores rechazó la operación'
    throw new Error(message)
  }
}

// Ciclo de vida de la app
app.whenReady().then(() => {
  // Valida Supabase local al arrancar; el fallo queda visible y nunca activa SQLite como fallback.
  getContributionImportRuntime().catch(error => console.error('[Contributions]', error.message))
  getManualResearchRuntime().catch(error => console.error('[Manual]', error.message))
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
