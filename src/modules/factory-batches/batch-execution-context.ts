import type { GeographicCatalogEntry, GeographyCatalogRepository } from '@modules/editorial-pipeline/geography'
import type { DestinationBatch, DestinationBatchJob } from '@shared/factory-batch-contracts'
import type { GenericRealEditorialExecutionContext, GenericRealEditorialPolicy } from '@modules/real-pipeline/generic-real-editorial-execution'

export const FACTORY_BATCH_REAL_POLICY_ID = 'factory-batch-real-v1'
const DEFAULT_DESTINATION_BUDGET_EUR = 0.2
const DEFAULT_BATCH_BUDGET_EUR = 10

/** Generic real-execution policy. It is destination independent; the durable
 * batch supplies the cost limits and the existing LLM routing supplies models. */
export function createBatchJobRealEditorialPolicy(batch: DestinationBatch): GenericRealEditorialPolicy {
  const taskBudgetEur = batch.maxCostPerDestination ?? DEFAULT_DESTINATION_BUDGET_EUR
  const batchBudgetEur = Math.max(batch.maxCostPerBatch ?? DEFAULT_BATCH_BUDGET_EUR, taskBudgetEur)
  return {
    language: 'es', depth: 'deep',
    objectives: ['hechos verificables', 'patrimonio y contexto', 'diferenciación editorial por perfil'],
    limits: {
      maxRounds: 2, maxFocusedQueriesPerRound: 3, maxSources: 8,
      maxCharactersPerSource: 100_000, maxProviderCalls: 12,
      maxInputTokens: 200_000, maxOutputTokens: 50_000,
      taskBudgetEur, batchBudgetEur, dailyBudgetEur: batchBudgetEur,
    },
    promptVersion: FACTORY_BATCH_REAL_POLICY_ID,
  }
}

export class BatchExecutionContextError extends Error {
  constructor(
    readonly code: 'CANONICAL_DESTINATION_REQUIRED' | 'CANONICAL_DESTINATION_NOT_FOUND' | 'INVALID_BATCH_JOB_OWNER',
    message: string,
  ) {
    super(message)
    this.name = 'BatchExecutionContextError'
  }
}

/** Maps only durable batch/geography data to the owner-neutral execution
 * context. It neither accesses providers nor creates a pilot surrogate. */
export class BatchExecutionContextMapper {
  constructor(private readonly geography: GeographyCatalogRepository) {}

  async map(batch: DestinationBatch, job: DestinationBatchJob): Promise<GenericRealEditorialExecutionContext> {
    if (job.batchId !== batch.id) throw new BatchExecutionContextError('INVALID_BATCH_JOB_OWNER', 'El job no pertenece al lote solicitado')
    if (!job.canonicalDestinationId) throw new BatchExecutionContextError('CANONICAL_DESTINATION_REQUIRED', 'El job no tiene una identidad geográfica canónica')
    const destination = await this.destination(job.canonicalDestinationId)
    if (!destination) throw new BatchExecutionContextError('CANONICAL_DESTINATION_NOT_FOUND', 'La identidad geográfica canónica no está disponible')
    return {
      owner: { type: 'BATCH_JOB', id: job.id },
      executionId: `factory-batch:${job.id}`,
      runId: job.id,
      taskId: `factory-batch:${job.id}`,
      batchId: batch.id,
      destination: {
        destinationId: destination.entity.id,
        name: destination.entity.name,
        countryCode: destination.entity.countryCode,
        ...(job.region ? { region: job.region } : {}),
        destinationType: destination.entity.type,
      },
      policy: createBatchJobRealEditorialPolicy(batch),
      budgetDate: new Date().toISOString().slice(0, 10),
    }
  }

  private async destination(id: string): Promise<GeographicCatalogEntry | undefined> {
    return (await this.geography.listActive()).find(entry => entry.entity.id === id)
  }
}
