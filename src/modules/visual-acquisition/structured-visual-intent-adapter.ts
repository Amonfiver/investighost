import type { WikimediaCommonsDiscoveryQuery } from '@shared/visual-candidate-contracts'
import { VisualIntentSchema, type VisualIntent } from '@shared/structured-editorial-package-contracts'

/** Maps the structured editorial plan onto the existing Wikimedia discovery
 * abstraction. It does not search, select, download or relax rights checks. */
export function discoveryQueryForVisualIntent(
  intentInput: VisualIntent,
  destination: { destinationId: string; destinationName: string; countryOrRegion: string | null },
  category: WikimediaCommonsDiscoveryQuery['category'],
  limit = 20,
): WikimediaCommonsDiscoveryQuery {
  const intent = VisualIntentSchema.parse(intentInput)
  return {
    destinationId: destination.destinationId,
    destinationName: destination.destinationName,
    countryOrRegion: destination.countryOrRegion,
    category,
    role: intent.desiredRole === 'HERO' ? 'hero' : intent.desiredRole === 'HIGHLIGHT' ? 'highlight' : 'gallery',
    searchKeywords: [intent.subject, ...intent.keywords],
    limit,
  }
}
