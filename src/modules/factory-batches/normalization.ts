import { createHash } from 'node:crypto'
import { normalizeGeographicText } from '@modules/editorial-pipeline/geography'
import type { DestinationBatchDestination } from '@shared/factory-batch-contracts'

export interface NormalizedDestinationInput {
  originalName: string
  country: string
  region?: string
  normalizedName: string
  normalizedCountry: string
  normalizedRegion?: string
  countryCode?: string
  normalizedIdentity: string
}

const COUNTRY_CODES: Record<string, string> = {
  espana: 'ES',
  spain: 'ES',
  es: 'ES',
}

export function normalizeDisplayText(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

export function normalizeDestinationInput(input: DestinationBatchDestination): NormalizedDestinationInput {
  const originalName = normalizeDisplayText(input.name)
  const country = normalizeDisplayText(input.country)
  const region = input.region === undefined ? undefined : normalizeDisplayText(input.region)
  const normalizedName = normalizeGeographicText(originalName)
  const countryText = normalizeGeographicText(country)
  const countryCode = COUNTRY_CODES[countryText]
  const normalizedCountry = countryCode ?? countryText
  const normalizedRegion = region ? normalizeGeographicText(region) : undefined
  return {
    originalName,
    country,
    ...(region ? { region } : {}),
    normalizedName,
    normalizedCountry,
    ...(normalizedRegion ? { normalizedRegion } : {}),
    ...(countryCode ? { countryCode } : {}),
    normalizedIdentity: [normalizedName, normalizedCountry, normalizedRegion ?? '*'].join('|'),
  }
}

/** Fingerprint semantic: batch name plus the multiset of valid normalized identities; row order is irrelevant. */
export function importFingerprint(
  batchName: string,
  identities: readonly string[],
  limits: { maxCostPerDestination?: number; maxCostPerBatch?: number } = {},
): string {
  const canonical = JSON.stringify({
    schema: 'investighost-destination-batch-import-v1',
    batchName: normalizeGeographicText(batchName),
    identities: [...identities].sort(),
    limits,
  })
  return createHash('sha256').update(canonical, 'utf8').digest('hex')
}
