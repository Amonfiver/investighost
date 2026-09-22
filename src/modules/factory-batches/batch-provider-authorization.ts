/**
 * Explicit capability for real provider work initiated by a destination batch.
 * It is intentionally independent from the historical pilot feature tokens.
 * The value lives only in the runtime environment and is never persisted.
 */
export const REAL_BATCH_EXECUTION_TOKEN_ENV = 'INVESTIGHOST_REAL_BATCH_EXECUTION_TOKEN'

export interface BatchJobProviderAuthorization {
  enabled: boolean
  featureToken?: string
}

export function readBatchJobProviderAuthorization(
  environment: NodeJS.ProcessEnv = process.env,
): BatchJobProviderAuthorization {
  const featureToken = environment[REAL_BATCH_EXECUTION_TOKEN_ENV]?.trim()
  return featureToken && isBatchExecutionToken(featureToken)
    ? { enabled: true, featureToken }
    : { enabled: false }
}

/** Kept deliberately permissive about the token format, but rejects the short
 * placeholders that are easy to enable accidentally in a local .env. */
export function isBatchExecutionToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{24,256}$/.test(value)
}

export function resolveBatchJobExecutionFeatureFlag(
  suppliedToken: string,
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  const authorization = readBatchJobProviderAuthorization(environment)
  return authorization.enabled && authorization.featureToken === suppliedToken
}
