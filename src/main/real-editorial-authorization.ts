import {
  resolveRealEditorialFeatureFlag,
} from '@shared/real-editorial-pilot-contracts'

export const REAL_EDITORIAL_FEATURE_ENV = 'INVESTIGHOST_REAL_EDITORIAL_TOKEN'

export interface RealEditorialAuthorization {
  enabled: boolean
  featureToken?: string
}

export function readRealEditorialAuthorization(
  environment: NodeJS.ProcessEnv = process.env,
): RealEditorialAuthorization {
  const featureToken = environment[REAL_EDITORIAL_FEATURE_ENV]
  return {
    enabled: resolveRealEditorialFeatureFlag(featureToken),
    featureToken,
  }
}
