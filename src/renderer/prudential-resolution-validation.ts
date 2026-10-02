export type PrudentialResolutionContext = { reservationId: string; providerCallId: string; provider: string; model: string; reservedAmount: number }
export type PrudentialResolutionDraft = { decision: string; reason: string }

export function prudentialResolutionRequirements(ambiguity: PrudentialResolutionContext, draft: PrudentialResolutionDraft): string[] {
  if (draft.decision !== 'PRUDENTIAL_COST_ASSUMED') return []
  return [
    !ambiguity.reservationId ? 'Reserva actual' : null, !ambiguity.providerCallId ? 'Provider call actual' : null,
    !ambiguity.provider.trim() ? 'Provider' : null, !ambiguity.model.trim() ? 'Modelo' : null,
    !(ambiguity.reservedAmount > 0) ? 'Importe prudencial derivado de la reserva' : null,
    !draft.reason.trim() ? 'Motivo de evidencia insuficiente' : null,
  ].filter((value): value is string => Boolean(value))
}
