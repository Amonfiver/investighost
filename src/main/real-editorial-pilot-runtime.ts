import { randomUUID } from 'node:crypto'
import {
  CostLedgerService,
  DurableRealEditorialPipeline,
  evaluateRealEditorialPreflight,
  inspectInstalledOpenAIResponsesCapability,
  realEditorialIdentityKey,
  SupabaseRealEditorialLedgerRepository,
  SupabaseRealEditorialPilotRepository,
  withLiveProviderClients,
} from '@modules/real-pipeline'
import {
  RealEditorialPilotActionSchema,
  RealEditorialPilotCancelSchema,
  RealEditorialPilotPrepareSchema,
  RealEditorialPilotProgressSchema,
  resolveRealEditorialFeatureFlag,
  type RealEditorialPilotProgress,
  type RealEditorialPreflight,
} from '@shared/real-editorial-pilot-contracts'
import { createLocalSupabaseClientFromEnv } from '@services/supabase'
import { getProviderCenterRuntime } from './provider-center-runtime'

export class RealEditorialPilotRuntime {
  private readonly controllers = new Map<string, AbortController>()

  constructor(
    private readonly repository: SupabaseRealEditorialPilotRepository,
    private readonly client: ReturnType<typeof createLocalSupabaseClientFromEnv>['client'],
  ) {}

  async preflight(pilotId?: string): Promise<RealEditorialPreflight> {
    const defaultIdentity = realEditorialIdentityKey('initial')
    const pilot = pilotId
      ? await this.repository.getPilot(pilotId)
      : await this.repository.findByIdentity(defaultIdentity)
    const identity = pilot ? realEditorialIdentityKey(pilot.variantKey) : defaultIdentity
    const inspection = await this.repository.inspect(identity, pilot?.id)
    const duplicateResolution = pilot
      ? 'current_pilot'
      : inspection.identicalPilotCount > 0
        ? 'identical_real_pilot_exists'
        : inspection.manualMorellaCount > 0
          ? 'manual_only_coexists'
          : 'no_conflict'
    const providerCenter = await getProviderCenterRuntime()
    return evaluateRealEditorialPreflight({
      featureEnabled: resolveRealEditorialFeatureFlag(
        process.env.INVESTIGHOST_REAL_EDITORIAL_TOKEN,
      ),
      providerCenter: providerCenter.snapshot(),
      repositoryAvailable: inspection.repositoryAvailable,
      budgetValid: inspection.budgetValid,
      connectivityValidated: inspection.connectivityValidated,
      guardFree: inspection.guardFree,
      activeExecutions: inspection.activeExecutions,
      pendingReservations: inspection.pendingReservations,
      openAIResponsesCapability: inspectInstalledOpenAIResponsesCapability(),
      duplicateResolution,
      pilot,
      boundaries: {
        regenerationBlocked: true,
        publicationBlocked: true,
        trawelConnected: false,
        automaticEnabled: false,
      },
    })
  }

  async prepare(candidate: unknown) {
    return this.repository.prepare(RealEditorialPilotPrepareSchema.parse(candidate ?? {}))
  }

  async confirmBudget(candidate: unknown) {
    const input = RealEditorialPilotActionSchema.parse(candidate)
    return this.repository.confirmBudget(input.pilotId)
  }

  async progress(candidate: unknown): Promise<RealEditorialPilotProgress> {
    const { pilotId } = RealEditorialPilotActionSchema.parse(candidate)
    const pilot = await this.repository.getPilot(pilotId)
    if (!pilot) throw new Error('El piloto editorial no existe')
    const [snapshot, incidents, run, inspection] = await Promise.all([
      this.repository.getResult(pilotId),
      this.client.from('real_editorial_incidents').select('id', { head: true, count: 'exact' })
        .eq('pilot_id', pilotId),
      this.client.from('real_editorial_runs').select('current_round,accumulated_cost')
        .eq('id', pilot.currentRunId).eq('pilot_id', pilotId).single(),
      this.repository.inspect(pilot.identityKey, pilotId),
    ])
    if (incidents.error || run.error) throw new Error('No se pudo leer el progreso durable')
    return RealEditorialPilotProgressSchema.parse({
      pilot,
      snapshot,
      currentRound: Number(run.data.current_round),
      accumulatedCost: Number(run.data.accumulated_cost),
      incidentCount: incidents.count ?? 0,
      pendingReservations: inspection.pendingReservations,
      guardFree: inspection.guardFree,
    })
  }

  async result(candidate: unknown) {
    const { pilotId } = RealEditorialPilotActionSchema.parse(candidate)
    return this.repository.getResult(pilotId)
  }

  async cancel(candidate: unknown): Promise<void> {
    const input = RealEditorialPilotCancelSchema.parse(candidate)
    this.controllers.get(input.pilotId)?.abort()
    await this.repository.cancel(input.pilotId, input.reason)
  }

  async resume(candidate: unknown) {
    const { pilotId } = RealEditorialPilotActionSchema.parse(candidate)
    await this.repository.reopenCancelled(pilotId)
    return this.start({ pilotId })
  }

  async start(candidate: unknown) {
    const { pilotId } = RealEditorialPilotActionSchema.parse(candidate)
    if (this.controllers.has(pilotId)) throw new Error('El piloto ya se está ejecutando')
    const preflight = await this.preflight(pilotId)
    if (!preflight.startActionEnabled || preflight.status !== 'ready_for_real_editorial_pilot') {
      throw new Error('El preflight editorial real no autoriza iniciar Morella')
    }
    const pilot = await this.repository.getPilot(pilotId)
    if (!pilot?.budget) throw new Error('Falta el presupuesto durable del piloto')
    const featureToken = process.env.INVESTIGHOST_REAL_EDITORIAL_TOKEN
    if (!featureToken) throw new Error('La feature flag editorial real no está disponible')

    const controller = new AbortController()
    this.controllers.set(pilotId, controller)
    const executionId = `real-editorial:${pilot.currentRunId}`
    const leaseToken = randomUUID()
    const ledgerRepository = new SupabaseRealEditorialLedgerRepository(
      this.client,
      pilot.id,
      pilot.currentRunId,
    )
    const ledger = new CostLedgerService(ledgerRepository)
    const acquired = await ledger.acquireExecution(
      executionId,
      leaseToken,
      new Date(Date.now() + 30 * 60 * 1_000),
    )
    if (!acquired) {
      this.controllers.delete(pilotId)
      throw new Error('La guarda editorial real está ocupada')
    }

    try {
      const providerCenter = await getProviderCenterRuntime()
      return await withLiveProviderClients(
        providerCenter,
        {
          featureToken,
          preflightStatus: preflight.status,
          taskAuthorized: true,
          budgetReserved: pilot.budgetConfirmed,
          globalGuardAcquired: true,
        },
        async providers => new DurableRealEditorialPipeline({
          repository: this.repository,
          ledgerRepository,
          providers: {
            researchTool: providers.tavily,
            intelligenceEngine: providers.openai,
          },
          guardLease: { executionId, leaseToken },
        }).execute(pilot, controller.signal),
      )
    } finally {
      await ledger.releaseExecution(leaseToken)
      this.controllers.delete(pilotId)
    }
  }
}

let runtime: RealEditorialPilotRuntime | undefined

export function getRealEditorialPilotRuntime(): RealEditorialPilotRuntime {
  if (!runtime) {
    const { client } = createLocalSupabaseClientFromEnv()
    runtime = new RealEditorialPilotRuntime(
      new SupabaseRealEditorialPilotRepository(client),
      client,
    )
  }
  return runtime
}
