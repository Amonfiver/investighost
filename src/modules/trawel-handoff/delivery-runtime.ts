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

/** Explicit, privileged composition point. Hosts must invoke it deliberately; it has no scheduler or UI. */
export class ExplicitTrawelDeliveryRuntime {
  constructor(
    private readonly library: CurrentApprovedLibraryPort,
    private readonly deliveries: DurableTrawelDeliveryService,
  ) {}

  async prepareEnqueueAndDeliver(input: PrepareAndDeliverTrawelEditorialCommand): Promise<EditorialDelivery | null> {
    const sources = await this.library.loadApprovedPair({
      adventureLibraryEntryId: input.adventureLibraryEntryId,
      studentLibraryEntryId: input.studentLibraryEntryId,
    })
    const payload = prepareTrawelEditorialDeliveryV2({ target: input.target, sources })
    const delivery = await this.deliveries.enqueue(payload)
    return this.deliveries.deliver(delivery.id)
  }
}
