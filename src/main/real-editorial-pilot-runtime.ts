import { randomUUID } from 'node:crypto'
import {
  CostLedgerService,
  DurableRealEditorialPipeline,
  evaluateRealEditorialPreflight,
  inspectOpenAIEditorialResponseContracts,
  inspectInstalledOpenAIResponsesCapability,
  realEditorialIdentityKey,
  SupabaseRealEditorialLedgerRepository,
  SupabaseRealEditorialPilotRepository,
  withLiveProviderClients,
} from '@modules/real-pipeline'
import {
  REAL_EDITORIAL_PILOT_POLICY,
  RealEditorialPilotActionSchema,
  RealEditorialAmbiguousCallResolutionSchema,
  RealEditorialBudgetResolutionSchema,
  RealEditorialPilotCancelSchema,
  RealEditorialPilotPrepareSchema,
  RealEditorialPilotProgressSchema,
  type RealEditorialPilotProgress,
  type RealEditorialPreflight,
} from '@shared/real-editorial-pilot-contracts'
import { createLocalSupabaseClientFromEnv } from '@services/supabase'
import { MANUAL_LOCAL_ACTOR_ID } from '@modules/editorial-pipeline/manual-runtime'
import { getProviderCenterRuntime } from './provider-center-runtime'
import { readRealEditorialAuthorization } from './real-editorial-authorization'

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
    const [inspection, budgetReview] = await Promise.all([
      this.repository.inspect(identity, pilot?.id),
      pilot ? this.repository.getBudgetReview(pilot.id) : Promise.resolve(undefined),
    ])
    const duplicateResolution = pilot
      ? 'current_pilot'
      : inspection.identicalPilotCount > 0
        ? 'identical_real_pilot_exists'
        : inspection.manualMorellaCount > 0
          ? 'manual_only_coexists'
          : 'no_conflict'
    const providerCenter = await getProviderCenterRuntime()
    const openAIRequestContract = inspectOpenAIEditorialResponseContracts(
      REAL_EDITORIAL_PILOT_POLICY.providers.model,
    )
    const firstContractIssue = openAIRequestContract.operations
      .flatMap(operation => operation.issues)[0]
    return evaluateRealEditorialPreflight({
      featureEnabled: readRealEditorialAuthorization().enabled,
      providerCenter: providerCenter.snapshot(),
      repositoryAvailable: inspection.repositoryAvailable,
      budgetValid: inspection.budgetValid,
      connectivityValidated: inspection.connectivityValidated,
      guardFree: inspection.guardFree,
      activeExecutions: inspection.activeExecutions,
      pendingReservations: inspection.pendingReservations,
      recoverableReservations: inspection.recoverableReservations,
      humanRequiredCalls: inspection.humanRequiredCalls,
      budgetDecisionStatus: budgetReview?.status ?? 'none',
      openAIResponsesCapability: inspectInstalledOpenAIResponsesCapability(),
      openAIRequestContract: {
        valid: openAIRequestContract.valid,
        issueCount: openAIRequestContract.operations
          .reduce((total, operation) => total + operation.issues.length, 0),
        detail: openAIRequestContract.valid
          ? 'Modelo, input y esquemas estrictos compatibles según validación local.'
          : `Payload incompatible: ${firstContractIssue?.path ?? 'contrato desconocido'}.`,
      },
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
    const [
      snapshot,
      incidents,
      run,
      inspection,
      humanRequiredCall,
      budgetReview,
      workflowCheckpoint,
      resumeAvailable,
    ] =
      await Promise.all([
      this.repository.getResult(pilotId),
      this.client.from('real_editorial_incidents')
        .select('code,classification,message,created_at', { count: 'exact' })
        .eq('pilot_id', pilotId).order('created_at', { ascending: false }).limit(1),
      this.client.from('real_editorial_runs').select('current_round')
        .eq('id', pilot.currentRunId).eq('pilot_id', pilotId).single(),
      this.repository.inspect(pilot.identityKey, pilotId),
      this.repository.getHumanRequiredCall(pilotId),
      this.repository.getBudgetReview(pilotId),
      this.repository.latestArtifact(pilot.currentRunId, 'checkpoint', 'workflow'),
      this.repository.canResumeFromCheckpoint(pilotId),
    ])
    if (incidents.error || run.error) throw new Error('No se pudo leer el progreso durable')
    return RealEditorialPilotProgressSchema.parse({
      pilot,
      snapshot,
      currentRound: Number(run.data.current_round),
      accumulatedCost: realEditorialAuthoritativeSpentCost(pilot),
      incidentCount: incidents.count ?? 0,
      latestIncident: incidents.data?.[0]
        ? {
            code: incidents.data[0].code,
            classification: incidents.data[0].classification,
            message: incidents.data[0].message,
            createdAt: incidents.data[0].created_at,
          }
        : undefined,
      pendingReservations: inspection.pendingReservations,
      humanRequiredCall,
      budgetReview,
      checkpointAvailable: Boolean(workflowCheckpoint),
      resumeAvailable,
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
    if (!await this.repository.canResumeFromCheckpoint(pilotId)) {
      throw new Error('El checkpoint no está autorizado para reanudarse')
    }
    await this.repository.reopenCancelled(pilotId)
    return this.start({ pilotId })
  }

  async resolveAmbiguousCall(candidate: unknown) {
    const input = RealEditorialAmbiguousCallResolutionSchema.parse(candidate)
    if (!readRealEditorialAuthorization().enabled) {
      throw new Error('La feature flag editorial real no autoriza la resolución')
    }
    if (input.actorId !== MANUAL_LOCAL_ACTOR_ID) {
      throw new Error('El actor humano no coincide con el operador local autorizado')
    }
    if (this.controllers.has(input.pilotId)) {
      throw new Error('No se puede resolver una llamada mientras el piloto se ejecuta')
    }
    const pilot = await this.repository.getPilot(input.pilotId)
    if (!pilot || pilot.currentRunId !== input.runId) {
      throw new Error('La resolución no corresponde al piloto y run activos')
    }
    const inspection = await this.repository.inspect(pilot.identityKey, pilot.id)
    if (!inspection.guardFree) {
      throw new Error('La guarda editorial debe estar libre para resolver la llamada')
    }
    return this.repository.resolveHumanRequiredCall(input)
  }

  async resolveBudgetDecision(candidate: unknown) {
    const input = RealEditorialBudgetResolutionSchema.parse(candidate)
    if (!readRealEditorialAuthorization().enabled) {
      throw new Error('La feature flag editorial real no autoriza la decisión presupuestaria')
    }
    if (input.actorId !== MANUAL_LOCAL_ACTOR_ID) {
      throw new Error('El actor humano no coincide con el operador local autorizado')
    }
    if (this.controllers.has(input.pilotId)) {
      throw new Error('No se puede decidir el presupuesto mientras el piloto se ejecuta')
    }
    const pilot = await this.repository.getPilot(input.pilotId)
    if (!pilot || pilot.currentRunId !== input.runId) {
      throw new Error('La decisión no corresponde al piloto y run activos')
    }
    const inspection = await this.repository.inspect(pilot.identityKey, pilot.id)
    if (!inspection.guardFree) {
      throw new Error('La guarda editorial debe estar libre para decidir el presupuesto')
    }
    return this.repository.resolveBudgetReview(input)
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
    if (pilot.state !== 'preflight') {
      throw new Error('El estado durable no autoriza iniciar; debe prepararse o reanudarse')
    }
    const authorization = readRealEditorialAuthorization()
    if (!authorization.enabled || !authorization.featureToken) {
      throw new Error('La feature flag editorial real no está disponible')
    }
    const featureToken = authorization.featureToken

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

export function realEditorialAuthoritativeSpentCost(
  pilot: { budget?: { spentCost: number } },
): number {
  return pilot.budget?.spentCost ?? 0
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
