import type { LibraryTrawelApprovedSource } from '@shared/trawel-editorial-handoff-contracts'
import type { TrawelEditorialDeliveryTarget } from '@shared/trawel-editorial-delivery-contracts'
import { prepareTrawelEditorialDeliveryV2 } from './delivery-v2-adapter'
import { DurableTrawelDeliveryService } from './durable-delivery-service'
import type { EditorialDelivery } from './delivery-repository'

/** Boundary for the authoritative Library read model; no Supabase locality is assumed. */
export interface CurrentApprovedLibraryPort {
  loadApprovedPair(input: { adventureLibraryEntryId: string; studentLibraryEntryId: string }): Promise<[
    LibraryTrawelApprovedSource,
    LibraryTrawelApprovedSource,
  ]>
}

export interface PrepareAndDeliverTrawelEditorialCommand {
  target: TrawelEditorialDeliveryTarget
  adventureLibraryEntryId: string
  studentLibraryEntryId: string
}

export interface TrawelEditorialDeliveryDryRun {
  destination: Pick<TrawelEditorialDeliveryTarget, 'entityType' | 'entitySlug' | 'countrySlug' | 'zoneSlug'>
  sourceMappingId: string
  canonicalDestinationId: string
  profiles: Array<{ profile: 'adventure' | 'student'; libraryEntryId: string; versionHash: string; contentHash: string }>
  handoffKey: string
  payloadFingerprint: string
}

/** Explicit, privileged composition point. Hosts must invoke it deliberately; it has no scheduler or UI. */
export class ExplicitTrawelDeliveryRuntime {
  constructor(
    private readonly library: CurrentApprovedLibraryPort,
    private readonly deliveries: DurableTrawelDeliveryService,
  ) {}

  /** Pure preparation through the authorized Library port. It never enqueues or performs HTTP. */
  async dryRun(input: PrepareAndDeliverTrawelEditorialCommand): Promise<TrawelEditorialDeliveryDryRun> {
    const payload = await this.prepare(input)
    return {
      destination: {
        entityType: input.target.entityType, entitySlug: input.target.entitySlug,
        countrySlug: input.target.countrySlug, zoneSlug: input.target.zoneSlug,
      },
      sourceMappingId: payload.mappingId,
      canonicalDestinationId: payload.canonicalDestinationId,
      profiles: (['adventure', 'student'] as const).map(profile => {
        const trace = payload.profiles[profile].metadata.investighost as {
          libraryEntryId: string
          currentApproved: { versionHash: string; contentHash: string }
        }
        return { profile, libraryEntryId: trace.libraryEntryId, versionHash: trace.currentApproved.versionHash, contentHash: trace.currentApproved.contentHash }
      }),
      handoffKey: payload.handoffKey,
      payloadFingerprint: payload.payloadFingerprint,
    }
  }

  async prepareEnqueueAndDeliver(input: PrepareAndDeliverTrawelEditorialCommand): Promise<EditorialDelivery | null> {
    const payload = await this.prepare(input)
    const delivery = await this.deliveries.enqueue(payload)
    return this.deliveries.deliver(delivery.id)
  }

  private async prepare(input: PrepareAndDeliverTrawelEditorialCommand) {
    const sources = await this.library.loadApprovedPair({
      adventureLibraryEntryId: input.adventureLibraryEntryId,
      studentLibraryEntryId: input.studentLibraryEntryId,
    })
    return prepareTrawelEditorialDeliveryV2({ target: input.target, sources })
  }
}
