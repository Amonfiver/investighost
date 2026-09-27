import { randomBytes } from 'node:crypto'
import type { DestinationBatchJob } from '@shared/factory-batch-contracts'
import {
  REAL_BATCH_EXECUTION_TOKEN_ENV,
  isBatchExecutionToken,
  readBatchJobProviderAuthorization,
} from './batch-provider-authorization'

export type BatchJobExecutionAuthorizationStatus = {
  state: 'AUTHORIZED' | 'NOT_AUTHORIZED'
  authorizedAt?: string
}

/**
 * Main-process-only, in-memory consent for one durable job.  It deliberately
 * has no renderer input other than the job id and never returns the capability
 * token. A restart safely requires the human to authorize again.
 */
export class BatchJobExecutionAuthorizationRegistry {
  private readonly authorizedJobs = new Map<string, { batchId: string; authorizedAt: Date }>()

  constructor(private readonly environment: NodeJS.ProcessEnv = process.env) {}

  authorize(job: DestinationBatchJob): BatchJobExecutionAuthorizationStatus {
    const configured = readBatchJobProviderAuthorization(this.environment)
    if (!configured.enabled) {
      // The existing batch capability remains the authority. Electron main
      // creates a process-local one only after its native human confirmation.
      this.environment[REAL_BATCH_EXECUTION_TOKEN_ENV] = randomBytes(32).toString('base64url')
    }
    const authorization = readBatchJobProviderAuthorization(this.environment)
    if (!authorization.enabled || !authorization.featureToken || !isBatchExecutionToken(authorization.featureToken)) {
      throw new Error('BATCH_PROVIDER_AUTHORIZATION_UNAVAILABLE')
    }
    const authorizedAt = new Date()
    this.authorizedJobs.set(job.id, { batchId: job.batchId, authorizedAt })
    return { state: 'AUTHORIZED', authorizedAt: authorizedAt.toISOString() }
  }

  status(job: DestinationBatchJob): BatchJobExecutionAuthorizationStatus {
    const value = this.authorizedJobs.get(job.id)
    const capability = readBatchJobProviderAuthorization(this.environment)
    if (!value || value.batchId !== job.batchId || !capability.enabled) return { state: 'NOT_AUTHORIZED' }
    return { state: 'AUTHORIZED', authorizedAt: value.authorizedAt.toISOString() }
  }

  isAuthorized(job: DestinationBatchJob): boolean {
    return this.status(job).state === 'AUTHORIZED'
  }
}

export const batchJobExecutionAuthorizations = new BatchJobExecutionAuthorizationRegistry()
