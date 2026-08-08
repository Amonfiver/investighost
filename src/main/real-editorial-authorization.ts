import {
  realEditorialPolicyIdForFeatureToken,
  resolveRealEditorialFeatureFlag,
  type RealEditorialPilotPolicyId,
} from '@shared/real-editorial-pilot-contracts'

export const REAL_EDITORIAL_FEATURE_ENV = 'INVESTIGHOST_REAL_EDITORIAL_TOKEN'

export interface RealEditorialAuthorization {
  enabled: boolean
  featureToken?: string
  policyId: RealEditorialPilotPolicyId | null
}

export function readRealEditorialAuthorization(
  environment: NodeJS.ProcessEnv = process.env,
): RealEditorialAuthorization {
  const featureToken = environment[REAL_EDITORIAL_FEATURE_ENV]
  return {
    enabled: resolveRealEditorialFeatureFlag(featureToken),
    featureToken,
    policyId: realEditorialPolicyIdForFeatureToken(featureToken),
  }
}
