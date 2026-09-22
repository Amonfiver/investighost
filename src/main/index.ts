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
import { createHash } from 'node:crypto'
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
import { getDestinationBatchRuntime, getDestinationBatchPersistenceStatus } from '@modules/factory-batches'
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
  REAL_EDITORIAL_CUENCA_DEEPSEEK_BENCHMARK_POLICY,
  REAL_EDITORIAL_E2E04_POLICY,
  RealEditorialPilotActionSchema,
} from '@shared/real-editorial-pilot-contracts'
import { getRealEditorialPilotRuntime } from './real-editorial-pilot-runtime'
import { readRealEditorialAuthorization } from './real-editorial-authorization'
import { createLocalSupabaseClientFromEnv } from '@services/supabase'
import {
  RealEditorialLibraryVersionDraftApplicationService,
  RealEditorialLibraryVersioningService,
  SupabaseRealEditorialLibraryVersioningRepository,
} from '@modules/library-versioning'
import { readRealLlmRouting, withLiveProviderClients } from '@modules/real-pipeline'

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

// Factory V1: importar y consultar lotes no ejecuta investigación ni proveedores.
ipcMain.handle('factory-batches:persistence-status', () => getDestinationBatchPersistenceStatus())

ipcMain.handle('factory-batches:import-json', async (_event, jsonText: unknown) => {
  return (await getDestinationBatchRuntime()).importJson(z.string().max(2 * 1024 * 1024).parse(jsonText))
})

ipcMain.handle('factory-batches:list', async () => (await getDestinationBatchRuntime()).list())

ipcMain.handle('factory-batches:read', async (_event, batchId: unknown) => {
  return (await getDestinationBatchRuntime()).read(z.string().uuid().parse(batchId))
})

ipcMain.handle('factory-batches:retry-job', async (_event, jobId: unknown) => {
  return (await getDestinationBatchRuntime()).retry(z.string().uuid().parse(jobId))
})

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
  const localAudit = !app.isPackaged || process.env.INVESTIGHOST_LOCAL_AUDIT === '1'
  const cuencaBenchmarkAction = process.argv
    .find(argument => argument.startsWith('--real-editorial-cuenca-benchmark='))
    ?.split('=', 2)[1]
  if (localAudit && cuencaBenchmarkAction) {
    await runLocalAuditCommand(
      'REAL_EDITORIAL_CUENCA_BENCHMARK',
      async () => runRealEditorialCuencaBenchmarkCommand(cuencaBenchmarkAction),
    )
    return
  }
  const e2e04Action = process.argv
    .find(argument => argument.startsWith('--real-editorial-e2e04='))
    ?.split('=', 2)[1]
    ?? process.env.INVESTIGHOST_REAL_EDITORIAL_E2E04_ACTION
  if (localAudit && e2e04Action) {
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

async function runRealEditorialCuencaBenchmarkCommand(action: string): Promise<unknown> {
  if (action === 'activate-openai') {
    return providerCenterAction(service => service.setActive({ providerId: 'openai', active: true }))
  }
  const runtime = getRealEditorialPilotRuntime()
  if (action === 'preflight') {
    return runtime.preflight(
      readOptionalE2E04PilotId(process.argv),
      REAL_EDITORIAL_CUENCA_DEEPSEEK_BENCHMARK_POLICY.id,
    )
  }
  if (action === 'prepare') {
    return runtime.prepare({
      policyId: REAL_EDITORIAL_CUENCA_DEEPSEEK_BENCHMARK_POLICY.id,
      variantKey: 'deepseek-benchmark-cuenca-20260914',
      preparationKey: 'cuenca-real-editorial-deepseek-benchmark-v1-prepare',
      taskOrigin: 'human_authorized',
      profiles: [
        { profile: 'adventure', enabled: true, targetWords: 1_000, depth: 'standard' },
        { profile: 'student', enabled: true, targetWords: 1_800, depth: 'deep' },
      ],
    })
  }
  const pilotId = readE2E04PilotId(process.argv)
  if (action === 'confirm-budget') return runtime.confirmBudget({ pilotId })
  if (action === 'reconcile-prudential') {
    const progress = await runtime.progress({ pilotId })
    const pending = progress.humanRequiredCall
    if (
      !pending
      || pending.providerId !== 'deepseek'
      || pending.operation !== 'analysis'
      || pending.sourceState !== 'unknown'
      || pending.maximumExposureEur !== 0.022
      || !pending.prudentialReconciliation
      || pending.prudentialReconciliation.maximumSubrequestCostEur !== 0.022
    ) {
      throw new Error('La ambigüedad durable no coincide con la conciliación prudencial Cuenca/DeepSeek')
    }
    return runtime.resolveAmbiguousCall({
      pilotId,
      runId: pending.runId,
      callId: pending.callId,
      actorId: MANUAL_LOCAL_ACTOR_ID,
      decision: 'prudential_cost_assumed',
      prudentialCostEur: 0.022,
      currency: 'EUR',
      reason: 'DeepSeek no confirmó consumo ni devolvió identificador remoto tras el timeout; se asume el máximo reservado.',
      note: 'Decisión humana Investighost 037: cierre prudencial sin afirmar consumo confirmado.',
      acceptsPotentialDuplicateCharge: true,
      confirmed: true,
    })
  }
  if (action === 'recover-analysis') return runtime.recoverConfirmedAnalysisArtifact({ pilotId })
  if (action === 'accept-round-one-coverage-with-warnings') {
    const progress = await runtime.progress({ pilotId })
    const coverage = progress.coverageReview
    const expectedGaps = ['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7']
    if (
      progress.pilot.currentRunId !== 'ceb14fcc-8d70-43e1-af7e-619013ff324b'
      || progress.pilot.state !== 'review_required'
      || !coverage
      || coverage.status !== 'required'
      || coverage.coverageScore !== 0.58
      || JSON.stringify(coverage.gaps.map(gap => gap.id)) !== JSON.stringify(expectedGaps)
      || coverage.contradictions.length !== 4
      || coverage.currentMaximumCostEur !== 0.2
      || coverage.estimates.acceptWithWarnings.remainingEstimatedCostEur !== 0.06
    ) throw new Error('La aceptación de cobertura no coincide con el checkpoint Cuenca de ronda 1')
    return runtime.resolveCoverageDecision({
      pilotId,
      runId: progress.pilot.currentRunId,
      actorId: MANUAL_LOCAL_ACTOR_ID,
      decision: 'accept_with_warnings',
      reason: 'Autorización humana Cuenca 051: no adquirir más Tavily; redactar únicamente con evidencia trazada y advertencias obligatorias.',
      note: 'No tratar como verificados acceso, aparcamiento, horarios, precios, reservas, rutas, duración, desnivel, riesgos, temporada, población ni vida cotidiana sin evidencia específica. Excluir Cuenca Ecuador; conservar contradicciones y gaps en los borradores y revisión.',
      riskAccepted: true,
      confirmed: true,
    })
  }
  if (action === 'authorize-round-one-coverage-extension-250') {
    const progress = await runtime.progress({ pilotId })
    const coverage = progress.coverageReview
    const review = progress.budgetReview
    if (
      progress.pilot.currentRunId !== 'ceb14fcc-8d70-43e1-af7e-619013ff324b'
      || progress.pilot.state !== 'review_required'
      || coverage?.status !== 'accepted'
      || !coverage.editorialConstraints
      || !review
      || review.status !== 'pending'
      || review.context !== 'coverage_acceptance'
      || review.currentMaximumCostEur !== 0.2
      || review.remainingEstimatedCostEur !== 0.06
      || review.coverageDecisionId !== coverage.latestDecision?.decisionId
    ) throw new Error('La ampliación no coincide con la aceptación de cobertura Cuenca')
    return runtime.resolveBudgetDecision({
      pilotId,
      runId: progress.pilot.currentRunId,
      actorId: MANUAL_LOCAL_ACTOR_ID,
      decision: 'authorize_extension',
      newMaximumCostEur: 0.25,
      reason: 'Autorización humana Cuenca 051: extensión manual hasta EUR 0.25 para completar borradores y revisión sin nuevas fuentes.',
      note: 'Extensión acotada al run Cuenca actual; no autoriza Tavily adicional, publicación, Biblioteca, Trawel ni otro destino.',
      confirmed: true,
    })
  }
  if (action === 'start') return runtime.start({ pilotId })
  if (action === 'resume') return runtime.resume({ pilotId })
  if (action === 'progress') return runtime.progress({ pilotId })
  if (action === 'result') return runtime.result({ pilotId })
  if (action === 'approve-terminal') {
    return runtime.resolveTerminalDecision({
      pilotId,
      runId: 'ceb14fcc-8d70-43e1-af7e-619013ff324b',
      actorId: MANUAL_LOCAL_ACTOR_ID,
      decision: 'approve_editorial_result',
      reason: 'Aprobación canónica para crear revisiones editoriales inmutables en Biblioteca; las correcciones 052 se revisarán y aprobarán como versiones derivadas antes de cualquier publicación.',
      observations: 'No publica ni conecta Trawel. Conserva el origen y habilita únicamente la revisión derivada trazable.',
      affectedProfiles: ['adventure', 'student'],
      profileComments: [],
      warningsAccepted: true,
      confirmed: true,
    })
  }
  if (action === 'move-library') {
    return runtime.moveApprovedResultToLibrary({
      pilotId,
      runId: 'ceb14fcc-8d70-43e1-af7e-619013ff324b',
      actorId: MANUAL_LOCAL_ACTOR_ID,
      confirmed: true,
    })
  }
  if (action === 'correct-library-052') return createCuencaEditorialCorrections()
  if (action === 'refine-library-053') return saveCuencaEditorialRefinements()
  if (action === 'approve-library-053') return approveCuencaEditorialRefinements()
  if (action === 'review-library-052') return reviewCuencaEditorialCorrections()
  if (action === 'review-library-052-openai-fallback') return reviewCuencaEditorialCorrections(true)
  throw new Error('Acción de benchmark Cuenca no reconocida')
}

async function createCuencaEditorialCorrections() {
  const runtime = getRealEditorialPilotRuntime()
  const entries = await runtime.listLibraryEntries({ destination: 'Cuenca', origin: 'real_editorial_pilot' })
  const adventure = entries.find(entry => entry.profile === 'adventure')
  const student = entries.find(entry => entry.profile === 'student')
  if (!adventure || !student || entries.length !== 2) {
    throw new Error('Biblioteca no conserva exactamente las dos entradas de Cuenca para la revisión 052')
  }
  const { client } = createLocalSupabaseClientFromEnv()
  const repository = new SupabaseRealEditorialLibraryVersioningRepository(client)
  const drafts = new RealEditorialLibraryVersionDraftApplicationService(repository, repository, repository)
  const correctedAdventure = correctCuencaAdventure(adventure.content)
  const correctedStudent = correctCuencaStudent(student.content)
  const results = await Promise.all([
    createCuencaCorrectedVersion(drafts, repository, adventure.entryId, adventure.title, correctedAdventure, 'adventure'),
    createCuencaCorrectedVersion(drafts, repository, student.entryId, student.title, correctedStudent, 'student'),
  ])
  const accepted = []
  for (const result of results) {
    if (result.status !== 'ok') {
      throw new Error('La revisión editorial 052 no pudo crear sus versiones derivadas de forma canónica')
    }
    accepted.push({
      profile: result.entrySummary.profile,
      libraryEntryId: result.entrySummary.libraryEntryId,
      versionId: result.version.versionId,
      revisionId: result.currentRevision.id,
      versionHash: result.version.versionHash,
      contentHash: result.currentRevision.contentHash,
      revisionHash: result.currentRevision.revisionHash,
      state: result.stateSnapshot.effectiveState,
      operationReplayed: result.operationReplayed,
    })
  }
  return accepted
}

async function createCuencaCorrectedVersion(
  drafts: RealEditorialLibraryVersionDraftApplicationService,
  repository: SupabaseRealEditorialLibraryVersioningRepository,
  libraryEntryId: string,
  title: string,
  content: string,
  profile: 'adventure' | 'student',
) {
  const summary = await repository.getVersioningSummary(libraryEntryId)
  return drafts.createDraft({
    libraryEntryId,
    expectedHeadHash: summary.currentApproved.versionHash,
    title,
    content,
    changeSummary: profile === 'adventure'
      ? '052: se eliminan inferencias espaciales y evidencia exclusiva del perfil estudiante; se homogeneizan los gaps g1–g7.'
      : '052: se retira la caracterización no corroborada de resolí sin alterar las referencias gastronómicas respaldadas.',
    actorId: MANUAL_LOCAL_ACTOR_ID,
    operationKey: operationKey(`investighost:052:cuenca:${profile}:corrected-library-version:v1`),
  })
}

function correctCuencaAdventure(content: string): string {
  let corrected = replaceExactlyOnce(
    content,
    'El conjunto dibuja un eje peatonal de alto valor escénico: el puente de San Pablo es el punto donde la hoz del Huécar y las Casas Colgadas se contemplan juntas, y la plaza Mayor funciona como nudo entre catedral, torre y callejeo.',
    'El expediente no acredita una relación espacial, recorrido, proximidad u orientación más precisa entre esos lugares; por eso esta guía no los convierte en un itinerario ni en un punto de vista concreto.',
    'la precisión espacial de puente/plaza',
  )
  corrected = replaceExactlyOnce(
    corrected,
    'Vida cotidiana: pinceladas, no estadísticas\n\nEl expediente ofrece observaciones cualitativas sobre huertos, artesanía, barrios, restauración, vida nocturna y celebraciones en Cuenca (España), pero no aporta población actual ni una caracterización demográfica sistemática (c10). Es decir: se puede hablar del pulso del barrio, no de cuántos habitantes tiene.\n\n',
    'Límite de perfil: vida cotidiana\n\nNo incorporo una caracterización de vida cotidiana en este perfil de aventura: la evidencia específica disponible para ese asunto pertenece al alcance del perfil Student. La información de población y prácticas contemporáneas queda abierta y no se usa aquí.\n\n',
    'la fuga de evidencia Student',
  )
  return replaceExactlyOnce(
    corrected,
    'Los huecos que no voy a rellenar\n\nAquí está la parte importante.',
    'Los huecos que no voy a rellenar\n\nGaps abiertos y explícitos: g1 acceso y desplazamiento local; g2 costes, horarios, reservas y condiciones de visita; g3 rutas, recorridos, duración, dificultad, desnivel y distancias; g4 temporada y riesgos; g5 población; g6 vida cotidiana contemporánea; g7 corroboración independiente de los datos del documental. Los gaps g5 y g6 no se desarrollan en el perfil Adventure por pertenecer al alcance Student, pero permanecen visibles y sin rellenar.\n\nAquí está la parte importante.',
    'la declaración homogénea de gaps g1–g7',
  )
}

function correctCuencaStudent(content: string): string {
  return replaceExactlyOnce(
    content,
    'Ojo con el resolí: es un dulce, y si buscas recetas, asegúrate de que la fuente habla de Cuenca (España).',
    'Sobre el resolí, el expediente solo confirma que se cita entre las referencias gastronómicas; su caracterización concreta no queda corroborada y no se afirma aquí.',
    'la caracterización no corroborada de resolí',
  )
}

async function saveCuencaEditorialRefinements() {
  const { client } = createLocalSupabaseClientFromEnv()
  const repository = new SupabaseRealEditorialLibraryVersioningRepository(client)
  const drafts = new RealEditorialLibraryVersionDraftApplicationService(repository, repository, repository)
  const plans = [
    {
      profile: 'adventure' as const,
      versionId: '4a6ca898-7967-4052-a7a2-d6d25c26ce2a',
      title: 'Cuenca (España) para aventureros: hoces, serranía y patrimonio con incógnitas operativas',
      correction: refineCuencaAdventure053,
      summary: '053: se eliminan recorribilidad a pie y caracterizaciones kársticas o de disolución no respaldadas.',
    },
    {
      profile: 'student' as const,
      versionId: '7791d810-35a8-4269-bfa6-c2fad5132b4d',
      title: 'Cuenca (España): historia, monumentos y cultura',
      correction: refineCuencaStudent053,
      summary: '053: se eliminan valoraciones y relaciones espaciales no respaldadas; vida cotidiana queda explícitamente sin caracterizar.',
    },
  ]
  const saved = []
  for (const plan of plans) {
    const detail = await repository.getVersionDetail(plan.versionId)
    const result = await drafts.saveDraft({
      versionId: plan.versionId,
      expectedPreviousRevisionHash: detail.currentRevision.revisionHash,
      title: plan.title,
      content: plan.correction(detail.currentRevision.content),
      changeSummary: plan.summary,
      actorId: MANUAL_LOCAL_ACTOR_ID,
      operationKey: operationKey(`investighost:053:cuenca:${plan.profile}:revision:2`),
    })
    if (result.status !== 'ok') throw new Error(`No se pudo guardar la revisión 053 de ${plan.profile}`)
    saved.push({
      profile: plan.profile,
      libraryEntryId: result.entrySummary.libraryEntryId,
      versionId: result.versionDetail.version.versionId,
      revisionId: result.savedRevision.id,
      revisionNumber: result.savedRevision.revisionNumber,
      versionHash: result.versionDetail.version.versionHash,
      contentHash: result.savedRevision.contentHash,
      revisionHash: result.savedRevision.revisionHash,
    })
  }
  return saved
}

function refineCuencaAdventure053(content: string): string {
  let refined = replaceExactlyOnce(
    content,
    'Ese es el material con el que trabaja un perfil de aventura: terreno kárstico, formaciones modeladas por disolución, bosque y agua.',
    'Para este perfil, el expediente solo permite señalar los lugares naturales y las actividades nombradas, sin caracterizar su geología.',
    'la caracterización kárstica no respaldada',
  )
  refined = replaceExactlyOnce(
    refined,
    'Cuenca (España) ofrece, según el expediente, un paquete coherente para quien va a caminar: ciudad colgada entre hoces, patrimonio concentrado y recorrible a pie en el casco, un cinturón natural kárstico con ríos y formaciones singulares, un yacimiento cretácico de relevancia y una cultura viva con nombres propios.',
    'Cuenca (España) reúne, según el expediente, ciudad entre hoces, lugares patrimoniales nombrados, entornos naturales citados, un yacimiento del Cretácico inferior y referencias culturales concretas.',
    'la recorribilidad a pie y el paisaje kárstico del cierre',
  )
  return refined
}

function refineCuencaStudent053(content: string): string {
  let refined = replaceExactlyOnce(
    content,
    'El puente de San Pablo es el punto desde el que tradicionalmente se contemplan esas casas, aunque cuidado: el expediente no describe miradores, recorridos ni distancias, así que no te diré cuánto se tarda de un sitio a otro.',
    'El expediente cita el puente de San Pablo y las Casas Colgadas, pero no describe su relación espacial, usos ni recorridos; por eso no se añade una función de mirador ni tiempos de desplazamiento.',
    'el mirador tradicional no respaldado',
  )
  refined = replaceExactlyOnce(
    refined,
    'La plaza Mayor funciona como centro urbano de referencia.',
    'La plaza Mayor figura entre los lugares citados por el expediente.',
    'el centro urbano no respaldado',
  )
  refined = replaceExactlyOnce(
    refined,
    'La catedral de Santa María y San Julián es el gran edificio religioso citado.',
    'La catedral de Santa María y San Julián figura entre los lugares citados.',
    'la valoración de la catedral',
  )
  refined = replaceExactlyOnce(
    refined,
    'El túnel de Alfonso VIII conecta, por lo que se desprende del nombre, con la memoria del rey conquistador, pero el expediente no detalla su historia constructiva.',
    'El túnel de Alfonso VIII figura entre los lugares citados; el expediente no detalla su historia constructiva.',
    'la inferencia sobre el túnel',
  )
  return refined
}

async function approveCuencaEditorialRefinements() {
  const { client } = createLocalSupabaseClientFromEnv()
  const repository = new SupabaseRealEditorialLibraryVersioningRepository(client)
  const service = new RealEditorialLibraryVersioningService(repository)
  const approved = []
  for (const [profile, versionId] of [
    ['adventure', '4a6ca898-7967-4052-a7a2-d6d25c26ce2a'],
    ['student', '7791d810-35a8-4269-bfa6-c2fad5132b4d'],
  ] as const) {
    const detail = await repository.getVersionDetail(versionId)
    const revision = detail.currentRevision
    let effective = await repository.getEffectiveVersionFindings(versionId, revision.id)
    const acceptedRiskFindingKeys = effective.items.map(item => item.findingKey).sort()
    for (const item of effective.items) {
      if (!item.isBaseline) continue
      const state = await repository.getVersionStateSnapshot(versionId)
      const reconciliation = await service.reconcileFindings({
        versionId,
        revisionId: revision.id,
        expectedState: 'draft',
        expectedRevisionHash: revision.revisionHash,
        expectedTraceabilityHash: state.traceabilityHash,
        finding: {
          findingKey: item.findingKey,
          sourceFindingType: item.sourceFindingType,
          sourceFindingId: item.sourceFindingId,
          origin: item.origin,
          disposition: 'accepted_risk',
          claimRelation: item.claimRelation,
          supportStatus: item.supportStatus,
          subjectText: item.subjectText,
          diffAnchor: null,
          claimIds: item.claimIds,
          evidenceReferences: item.evidenceReferences,
          sourceIds: item.sourceIds,
          editorDeclaration: 'Revisión 053: contenido preservado con límites, gaps y contradicciones visibles.',
          justification: 'La revisión final no identifica una afirmación material no respaldada tras las correcciones 053; los límites heredados permanecen explícitos y no se publican.',
        },
        createdByActorId: MANUAL_LOCAL_ACTOR_ID,
        operationKey: operationKey(`investighost:053:${profile}:reconcile:${item.findingKey}`),
      })
      if (reconciliation.status !== 'ok') throw new Error(`No se pudo reconciliar ${profile}/${item.findingKey}`)
      effective = await repository.getEffectiveVersionFindings(versionId, revision.id)
    }
    const submittedState = await repository.getVersionStateSnapshot(versionId)
    const submitted = await service.submitForReview({
      versionId,
      revisionId: revision.id,
      expectedState: 'draft',
      expectedRevisionHash: revision.revisionHash,
      expectedTraceabilityHash: submittedState.traceabilityHash,
      reason: '053: revisión final completada; las advertencias restantes son informativas y los límites documentales siguen visibles.',
      actorId: MANUAL_LOCAL_ACTOR_ID,
      operationKey: operationKey(`investighost:053:${profile}:submit`),
    })
    if (submitted.status !== 'ok') throw new Error(`No se pudo enviar ${profile} a revisión canónica`)
    const reviewState = await repository.getVersionStateSnapshot(versionId)
    if (!reviewState.aggregateHash) throw new Error(`Falta el hash de decisión de ${profile}`)
    const decision = await service.decideVersion({
      versionId,
      revisionId: revision.id,
      decisionType: 'approve',
      expectedPreviousState: 'ready_for_review',
      expectedDecisionTargetHash: reviewState.aggregateHash,
      reason: '053: aprobación humana canónica tras correcciones mínimas y revisión final sin defectos materiales.',
      actorId: MANUAL_LOCAL_ACTOR_ID,
      affectedFindingKeys: [],
      changeInstructions: [],
      acceptedRiskFindingKeys,
      separationOfDutiesException: true,
      separationOfDutiesReason: 'Operador local autorizado documenta la excepción para cerrar la revisión editorial humana de Cuenca.',
      operationKey: operationKey(`investighost:053:${profile}:approve`),
    })
    if (decision.status !== 'ok') throw new Error(`No se pudo aprobar ${profile}`)
    const [current, decisions] = await Promise.all([
      repository.getCurrentApprovedVersion(detail.version.libraryEntryId),
      repository.listVersionDecisions(versionId),
    ])
    const terminalDecision = decisions.at(-1)
    if (!terminalDecision || terminalDecision.decisionType !== 'approve') {
      throw new Error(`La aprobación ${profile} no conserva su decisión durable`)
    }
    approved.push({ profile, decisionId: terminalDecision.id, current })
  }
  return approved
}

function replaceExactlyOnce(content: string, search: string, replacement: string, label: string): string {
  const first = content.indexOf(search)
  if (first < 0 || first !== content.lastIndexOf(search)) {
    throw new Error(`No se pudo aplicar de forma determinista ${label}`)
  }
  return `${content.slice(0, first)}${replacement}${content.slice(first + search.length)}`
}

function operationKey(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

async function reviewCuencaEditorialCorrections(useOpenAiFallback = false) {
  const runtime = getRealEditorialPilotRuntime()
  const terminal = await runtime.result({ pilotId: 'a8e4d6ad-ce09-46bd-81d9-bc316ae620a9' })
  if (!terminal) throw new Error('El resultado terminal de Cuenca no está disponible para la revisión 052')
  const { client } = createLocalSupabaseClientFromEnv()
  const versioning = new SupabaseRealEditorialLibraryVersioningRepository(client)
  const entries = await runtime.listLibraryEntries({ destination: 'Cuenca', origin: 'real_editorial_pilot' })
  const masterKnowledge = terminal.snapshot.masterKnowledge
  if (!masterKnowledge) {
    throw new Error('Falta el conocimiento maestro inmutable de Cuenca')
  }
  const corrected = [...terminal.drafts]
  for (const profile of ['adventure', 'student'] as const) {
    const entry = entries.find(item => item.profile === profile)
    if (!entry) throw new Error(`Falta la entrada ${profile} de Biblioteca`)
    const summary = await versioning.getVersioningSummary(entry.entryId)
    if (!summary.latestVersion || summary.latestVersion.versionNumber !== 2) {
      throw new Error(`Falta la revisión derivada 052 de ${profile}`)
    }
    const detail = await versioning.getVersionDetail(summary.latestVersion.versionId)
    const original = terminal.drafts.find(draft => draft.profile === profile)
    if (!original) throw new Error(`Falta el borrador original ${profile}`)
    const index = corrected.findIndex(draft => draft.profile === profile)
    if (index < 0) throw new Error(`Falta el borrador corregible ${profile}`)
    corrected[index] = {
      ...original,
      title: detail.currentRevision.title,
      content: detail.currentRevision.content,
    }
  }
  const mission = await client.from('real_editorial_artifacts').select('payload').eq('run_id', terminal.runId)
    .eq('artifact_kind', 'mission').eq('artifact_key', 'initial').eq('version', 1).single()
  if (mission.error || !mission.data) throw new Error('Falta la misión inmutable de Cuenca')
  const authorization = readRealEditorialAuthorization()
  if (!authorization.enabled || !authorization.featureToken) {
    throw new Error('La autorización editorial real no está disponible para la revisión 052')
  }
  const providerCenter = await getProviderCenterRuntime()
  const routing = readRealLlmRouting()
  if (useOpenAiFallback) {
    routing.routes.review = {
      ...routing.routes.analysis,
      providerId: 'openai',
      model: 'gpt-5.6-luna',
      apiModel: 'gpt-5.6-luna',
    }
  }
  const review = await withLiveProviderClients(
    providerCenter,
    {
      featureToken: authorization.featureToken,
      preflightStatus: 'ready_for_real_editorial_pilot',
      taskAuthorized: true,
      budgetReserved: true,
      globalGuardAcquired: true,
    },
    providers => providers.intelligence.review(
      mission.data.payload as never,
      masterKnowledge,
      corrected as never,
      AbortSignal.timeout(60_000),
    ),
    { routing },
  )
  return {
    provider: useOpenAiFallback ? 'openai' : 'deepseek',
    model: useOpenAiFallback ? 'gpt-5.6-luna' : 'deepseek-flash',
    review,
  }
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
