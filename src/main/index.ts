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
import { executeRealConnectivityCheck } from './real-connectivity-runtime'
import { getRealProfileSettingsRuntime } from './real-profile-settings-runtime'
import { REAL_CONNECTIVITY_CONFIRMATION } from '@shared/real-connectivity-contracts'
import {
  REAL_EDITORIAL_E2E04_POLICY,
  RealEditorialPilotActionSchema,
} from '@shared/real-editorial-pilot-contracts'
import { getRealEditorialPilotRuntime } from './real-editorial-pilot-runtime'

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

ipcMain.handle('real-connectivity:run', async (_event, input: unknown) => {
  return executeRealConnectivityCheck(input)
})

ipcMain.handle('real-profiles:get', () => getRealProfileSettingsRuntime().load())

ipcMain.handle('real-profiles:save', async (_event, input: unknown) => {
  return getRealProfileSettingsRuntime().save(input)
})

ipcMain.handle('real-editorial:preflight', async (_event, pilotId: unknown) => {
  return getRealEditorialPilotRuntime().preflight(
    pilotId === undefined ? undefined : z.string().uuid().parse(pilotId),
  )
})

ipcMain.handle('real-editorial:prepare', async (_event, input: unknown) => {
  return getRealEditorialPilotRuntime().prepare(input)
})

ipcMain.handle('real-editorial:confirm-budget', async (_event, input: unknown) => {
  return getRealEditorialPilotRuntime().confirmBudget(input)
})

ipcMain.handle('real-editorial:progress', async (_event, input: unknown) => {
  return getRealEditorialPilotRuntime().progress(input)
})

ipcMain.handle('real-editorial:result', async (_event, input: unknown) => {
  return getRealEditorialPilotRuntime().result(input)
})

ipcMain.handle('real-editorial:resolve-terminal-review', async (_event, input: unknown) => {
  return getRealEditorialPilotRuntime().resolveTerminalDecision(input)
})

ipcMain.handle('real-editorial:move-to-library', async (_event, input: unknown) => {
  return getRealEditorialPilotRuntime().moveApprovedResultToLibrary(input)
})

ipcMain.handle('real-editorial:list-library', async (_event, input: unknown) => {
  return getRealEditorialPilotRuntime().listLibraryEntries(input)
})

ipcMain.handle('real-editorial:start', async (_event, input: unknown) => {
  return getRealEditorialPilotRuntime().start(input)
})

ipcMain.handle('real-editorial:cancel', async (_event, input: unknown) => {
  return getRealEditorialPilotRuntime().cancel(input)
})

ipcMain.handle('real-editorial:resume', async (_event, input: unknown) => {
  return getRealEditorialPilotRuntime().resume(input)
})

ipcMain.handle('real-editorial:resolve-ambiguous-call', async (_event, input: unknown) => {
  return getRealEditorialPilotRuntime().resolveAmbiguousCall(input)
})

ipcMain.handle('real-editorial:resolve-budget', async (_event, input: unknown) => {
  return getRealEditorialPilotRuntime().resolveBudgetDecision(input)
})

ipcMain.handle('real-editorial:resolve-coverage', async (_event, input: unknown) => {
  return getRealEditorialPilotRuntime().resolveCoverageDecision(input)
})

ipcMain.handle('real-editorial:recover-source-limit', async (_event, input: unknown) => {
  return getRealEditorialPilotRuntime().recoverSourceLimit(input)
})

ipcMain.handle('real-editorial:recover-partial-analysis', async (_event, input: unknown) => {
  return getRealEditorialPilotRuntime().recoverPartialAnalysis(input)
})

ipcMain.handle('real-editorial:resolve-historical-incidents', async (_event, input: unknown) => {
  return getRealEditorialPilotRuntime().resolveHistoricalIncidents(input)
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
app.whenReady().then(async () => {
  const e2e04Action = process.argv
    .find(argument => argument.startsWith('--real-editorial-e2e04='))
    ?.split('=', 2)[1]
    ?? process.env.INVESTIGHOST_REAL_EDITORIAL_E2E04_ACTION
  if (!app.isPackaged && e2e04Action) {
    await runLocalAuditCommand(
      'REAL_EDITORIAL_E2E04',
      async () => runRealEditorialE2E04Command(e2e04Action),
    )
    return
  }
  if (!app.isPackaged && process.argv.includes('--inspect-real-connectivity-preflight')) {
    await runLocalConnectivityCommand(async () => getRealConnectivityPreflightRuntime())
    return
  }
  if (!app.isPackaged && process.argv.includes('--authorized-real-connectivity-check-10d')) {
    await runLocalConnectivityCommand(async () => executeRealConnectivityCheck({
      humanConfirmation: REAL_CONNECTIVITY_CONFIRMATION,
      morellaExecutionRequested: false,
      publicationRequested: false,
      automaticRequested: false,
      trawelRequested: false,
    }))
    return
  }
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

async function runLocalConnectivityCommand(operation: () => Promise<unknown>): Promise<void> {
  return runLocalAuditCommand('REAL_CONNECTIVITY_AUDIT', operation)
}

async function runLocalAuditCommand(
  prefix: string,
  operation: () => Promise<unknown>,
): Promise<void> {
  try {
    const result = await operation()
    process.stdout.write(`${prefix}=${JSON.stringify(result)}\n`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Operación local rechazada'
    process.stderr.write(`${prefix}_ERROR=${message}\n`)
    process.exitCode = 1
  } finally {
    app.quit()
  }
}

async function runRealEditorialE2E04Command(action: string): Promise<unknown> {
  const runtime = getRealEditorialPilotRuntime()
  if (action === 'preflight') {
    return runtime.preflight(
      readOptionalE2E04PilotId(process.argv),
      REAL_EDITORIAL_E2E04_POLICY.id,
    )
  }
  if (action === 'prepare') {
    return runtime.prepare({
      policyId: REAL_EDITORIAL_E2E04_POLICY.id,
      variantKey: 'e2e04-albarracin-20260808',
      preparationKey: 'albarracin-real-editorial-e2e04-v1-prepare',
      taskOrigin: 'human_authorized',
      profiles: [
        { profile: 'adventure', enabled: true, targetWords: 1_000, depth: 'standard' },
        { profile: 'student', enabled: true, targetWords: 1_800, depth: 'deep' },
      ],
    })
  }
  const pilotId = readE2E04PilotId(process.argv)
  if (action === 'confirm-budget') return runtime.confirmBudget({ pilotId })
  if (action === 'materialize-round-one-budget-review') {
    return runtime.materializeRoundOneBudgetReview({ pilotId })
  }
  if (action === 'round-one-source-selection-plan') {
    const progress = await runtime.progress({ pilotId })
    if (!progress.roundOneSourceSelection) {
      throw new Error('No existe una propuesta durable de selección de fuentes de ronda 1')
    }
    return progress.roundOneSourceSelection
  }
  if (action === 'authorize-round-one-source-selection') {
    const progress = await runtime.progress({ pilotId })
    const selection = progress.roundOneSourceSelection
    const expectedKeptSourceIds = [
      'tavily-f26972d6bc05f064de1c24bd49fdaae6',
      'tavily-53b83759ea7633498daa8f6eaecf7c88',
      'tavily-45fec76677a348754498a19a505a3e30',
      'tavily-10c7179940a8e62867243b3248077a8e',
      'tavily-879298c2b7e496fa5c73211afcd90648',
    ]
    const expectedDeselectedSourceIds = [
      'tavily-79d59033a79d518d58308376da5386c7',
      'tavily-771c87e3abda4a62c4bfee7691eaa95f',
      'tavily-d7813cc84ec4e98b002a9f32fd288fb4',
    ]
    const sourceIds = (decision: 'keep_active' | 'deselect_active') => selection?.sources
      .filter(source => source.decision === decision)
      .map(source => source.sourceId)
    if (
      progress.pilot.currentRunId !== '71244b74-6a81-440c-ae1f-0c5772ecf772'
      || !selection
      || selection.proposalHash !== '5cd32f14249ce9972722147e1db0d4e473db096682fb64299497584b8cce14fd'
      || selection.maximumSources !== 8
      || selection.originalActiveCount !== 8
      || selection.retainedCount !== 5
      || selection.deselectedCount !== 3
      || selection.availableSlotsAfterSelection !== 3
      || JSON.stringify(sourceIds('keep_active')) !== JSON.stringify(expectedKeptSourceIds)
      || JSON.stringify(sourceIds('deselect_active')) !== JSON.stringify(expectedDeselectedSourceIds)
    ) {
      throw new Error('La selección durable no coincide exactamente con la autorización humana')
    }
    return runtime.resolveRoundOneSourceSelection({
      pilotId,
      runId: selection.runId,
      incidentId: selection.incidentId,
      proposalHash: selection.proposalHash,
      actorId: MANUAL_LOCAL_ACTOR_ID,
      reason: 'Selección humana conservadora para liberar exactamente tres plazas sin alterar el historial de ronda 1.',
      confirmed: true,
    })
  }
  if (action === 'accept-coverage-with-warnings') {
    const progress = await runtime.progress({ pilotId })
    const review = progress.coverageReview
    const expectedGapIds = ['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7']
    if (
      progress.pilot.currentRunId !== '71244b74-6a81-440c-ae1f-0c5772ecf772'
      || progress.pilot.state !== 'review_required'
      || !review
      || review.status !== 'required'
      || review.checkpointVersion !== 8
      || review.checkpointHash !== '0599dff91090942ee2ee1c84d336caa7e0d1a724d2822f93c1f48b407596686f'
      || review.coverageScore !== 0.72
      || JSON.stringify(review.gaps.map(gap => gap.id)) !== JSON.stringify(expectedGapIds)
      || review.contradictions.length !== 4
      || JSON.stringify(review.affectedProfiles) !== JSON.stringify(['adventure', 'student'])
      || review.spentCostEur !== 0.308318
      || review.reservedCostEur !== 0
      || review.currentMaximumCostEur !== 0.42
      || review.estimates.acceptWithWarnings.remainingEstimatedCostEur !== 0.06
      || review.estimates.acceptWithWarnings.projectedTotalCostEur !== 0.368318
      || review.estimates.acceptWithWarnings.shortfallCostEur !== 0
    ) {
      throw new Error('La revisión de cobertura no coincide con la autorización humana de Albarracín')
    }
    return runtime.resolveCoverageDecision({
      pilotId,
      runId: progress.pilot.currentRunId,
      actorId: MANUAL_LOCAL_ACTOR_ID,
      decision: 'accept_with_warnings',
      reason: 'Aceptación humana explícita de siete gaps y cuatro contradicciones para redactar con cautelas estrictas.',
      note: 'No considerar verificados los datos incompletos o contradictorios. Usar solo evidencia disponible; no inferir datos faltantes ni presentar cifras antiguas como actuales; no equiparar tarifas, rutas, estadísticas o periodos no comparables; omitir o advertir lo insuficientemente verificado; no inventar transporte, aparcamiento, horarios, tarifas, restricciones ni métricas de rutas; distinguir Paseo Fluvial y Camino Natural del Guadalaviar; contextualizar temporalmente la población de 2013; conservar contradicciones en trazabilidad y revisión final.',
      riskAccepted: true,
      confirmed: true,
    })
  }
  if (action === 'authorize-coverage-within-420') {
    const progress = await runtime.progress({ pilotId })
    const coverage = progress.coverageReview
    const review = progress.budgetReview
    if (
      progress.pilot.currentRunId !== '71244b74-6a81-440c-ae1f-0c5772ecf772'
      || progress.pilot.state !== 'review_required'
      || coverage?.status !== 'accepted'
      || !coverage.editorialConstraints
      || !review
      || review.status !== 'pending'
      || review.context !== 'coverage_acceptance'
      || review.coverageDecisionId !== coverage.latestDecision?.decisionId
      || review.currentMaximumCostEur !== 0.42
      || review.spentCostEur !== 0.308318
      || review.reservedCostEur !== 0
      || review.remainingEstimatedCostEur !== 0.06
      || review.totalEstimatedCostEur !== 0.368318
      || review.shortfallCostEur !== 0
      || review.marginCostEur !== 0.051682
    ) {
      throw new Error('La revisión presupuestaria de cobertura no cabe exactamente en 0,420000 EUR')
    }
    return runtime.resolveBudgetDecision({
      pilotId,
      runId: progress.pilot.currentRunId,
      actorId: MANUAL_LOCAL_ACTOR_ID,
      decision: 'authorize_within_limit',
      reason: 'Autorización humana para redactar y revisar usando únicamente el margen ya disponible.',
      note: 'El máximo total permanece en 0,420000 EUR y no constituye un objetivo de gasto.',
      confirmed: true,
    })
  }
  if (action === 'authorize-budget-420') {
    const progress = await runtime.progress({ pilotId })
    const review = progress.budgetReview
    if (
      progress.pilot.currentRunId !== '71244b74-6a81-440c-ae1f-0c5772ecf772'
      || progress.pilot.state !== 'review_required'
      || !review
      || review.status !== 'pending'
      || review.context !== 'workflow_completion'
      || review.currentMaximumCostEur !== 0.2
      || review.spentCostEur !== 0.175406
      || review.reservedCostEur !== 0
      || review.remainingEstimatedCostEur !== 0.205406
      || review.totalEstimatedCostEur !== 0.380812
    ) {
      throw new Error('La revisión durable no coincide con la autorización de 0,420000 EUR')
    }
    return runtime.resolveBudgetDecision({
      pilotId,
      runId: progress.pilot.currentRunId,
      actorId: MANUAL_LOCAL_ACTOR_ID,
      decision: 'authorize_extension',
      newMaximumCostEur: 0.42,
      reason: 'Autorización humana explícita para completar Albarracín sin superar 0,420000 EUR.',
      note: 'El importe autorizado es un techo máximo y no un objetivo de gasto.',
      confirmed: true,
    })
  }
  if (action === 'reconcile-prudential') {
    const progress = await runtime.progress({ pilotId })
    const pending = progress.humanRequiredCall
    if (
      !pending
      || pending.providerId !== 'openai'
      || pending.operation !== 'analysis'
      || pending.sourceState !== 'unknown'
      || pending.maximumExposureEur !== 0.022
    ) {
      throw new Error('La ambigüedad durable no coincide con la aprobación prudencial E2E-04')
    }
    return runtime.resolveAmbiguousCall({
      pilotId,
      runId: pending.runId,
      callId: pending.callId,
      actorId: MANUAL_LOCAL_ACTOR_ID,
      decision: 'prudential_cost_assumed',
      prudentialCostEur: 0.022,
      currency: 'EUR',
      reason: 'El proveedor no confirmó el consumo tras el timeout; se asume el máximo reservado.',
      note: 'Decisión humana E2E-04: conciliación prudencial sin afirmar consumo confirmado.',
      acceptsPotentialDuplicateCharge: true,
      confirmed: true,
    })
  }
  if (action === 'start') return runtime.start({ pilotId })
  if (action === 'resume') return runtime.resume({ pilotId })
  if (action === 'progress') return runtime.progress({ pilotId })
  if (action === 'result') return runtime.result({ pilotId })
  throw new Error('Acción E2E-04 no reconocida')
}

function readE2E04PilotId(arguments_: string[]): string {
  const pilotId = readOptionalE2E04PilotId(arguments_)
  return RealEditorialPilotActionSchema.parse({ pilotId }).pilotId
}

function readOptionalE2E04PilotId(arguments_: string[]): string | undefined {
  const candidate = arguments_
    .find(argument => argument.startsWith('--pilot-id='))
    ?.split('=', 2)[1]
  if (!candidate) return undefined
  return RealEditorialPilotActionSchema.parse({ pilotId: candidate }).pilotId
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
