import type {
  CanonicalEditorialDraft,
  ResearchEvent,
} from './editorial-contracts'

export type ManualReviewAction = 'started' | 'reopened' | 'approved' | 'changes_requested' | 'rejected'

export interface ManualReviewHistoryEntry {
  id: string
  requestId: string
  runId?: string
  draftId: string
  draftVersion: number
  actorId?: string
  action: ManualReviewAction
  comment?: string
  occurredAt: Date
}

const actionByEventType: Record<string, ManualReviewAction> = {
  'manual.review.started': 'started',
  'manual.review.reopened': 'reopened',
  'manual.review.approved': 'approved',
  'manual.review.changes_requested': 'changes_requested',
  'manual.review.rejected': 'rejected',
}

export function manualReviewHistory(
  events: ResearchEvent[],
  draft: Pick<CanonicalEditorialDraft, 'id' | 'contentVersion'>,
): ManualReviewHistoryEntry[] {
  return events.flatMap(event => {
    const action = actionByEventType[event.type]
    if (!action || event.payload.draftId !== draft.id) return []

    const payloadVersion = event.payload.draftVersion
    const draftVersion = typeof payloadVersion === 'number' && Number.isInteger(payloadVersion) && payloadVersion > 0
      ? payloadVersion
      : draft.contentVersion
    const payloadActorId = event.payload.actorId
    const actorId = typeof payloadActorId === 'string' ? payloadActorId : event.actorId
    const payloadComment = event.payload.comment
    const comment = typeof payloadComment === 'string' && payloadComment.length > 0 ? payloadComment : undefined

    return [{
      id: event.id,
      requestId: event.requestId,
      runId: event.runId,
      draftId: draft.id,
      draftVersion,
      actorId,
      action,
      comment,
      occurredAt: event.occurredAt,
    }]
  }).sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime())
}
