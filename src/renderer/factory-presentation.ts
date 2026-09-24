import type { DestinationBatch, DestinationBatchJob, DestinationBatchRedoScope } from '@shared/factory-batch-contracts'

export const BATCH_LIVE_REFRESH_INTERVAL_MS = 1_500

export const redoScopeLabel = (scope: DestinationBatchRedoScope): string => ({ STUDENT: 'Student', ADVENTURE: 'Adventure', VISUALS: 'Imágenes', EDITORIAL: 'contenido editorial' } as Record<DestinationBatchRedoScope, string>)[scope]
export const jobStatusLabel = (value: string, redoScope?: DestinationBatchRedoScope): string => redoScope && ['REDO_REQUIRED', 'PROCESSING'].includes(value)
  ? `Rehaciendo ${redoScopeLabel(redoScope)}`
  : ({ QUEUED: 'En cola', PROCESSING: 'Procesando', READY_FOR_REVIEW: 'Para revisar', APPROVED: 'Aprobado', REDO_REQUIRED: 'Rehacer', FAILED: 'Fallido', BLOCKED_AMBIGUOUS: 'Requiere revisión', REUSED: 'Reutilizado', DELIVERED: 'Enviado', IMPORTED: 'Importado' } as Record<string, string>)[value] ?? value
export const jobPhaseLabel = (value: string, redoScope?: DestinationBatchRedoScope): string => redoScope && ['STUDENT', 'ADVENTURE', 'VISUALS', 'AUTO_REVIEW'].includes(value)
  ? `Rehaciendo ${redoScopeLabel(redoScope)}`
  : ({ IDENTITY: 'Preparando destino', RESEARCH: 'Investigando', ANALYSIS: 'Analizando', STUDENT: 'Creando Student', ADVENTURE: 'Creando Adventure', VISUALS: 'Buscando imágenes', AUTO_REVIEW: 'Revisando automáticamente', DELIVERY: 'Enviando' } as Record<string, string>)[value] ?? value
export const formatCost = (value: number): string => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value)
export const formatBatchCreatedAt = (value: Date): string => `${new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(value)} · ${value.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`
export const sortBatchesByCreatedAt = <T extends { createdAt: Date }>(batches: readonly T[]): T[] => [...batches].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
export const singleJobStatusLabel = (jobs: readonly DestinationBatchJob[]): string | null => jobs.length === 1 ? jobStatusLabel(jobs[0]!.status, jobs[0]!.redoScope) : null
export const smokeFixtureLabel = (batch: Pick<DestinationBatch, 'smokeFixture'>): string | null => batch.smokeFixture ? 'Prueba local' : null
export const isActiveBatchJob = (job: Pick<DestinationBatchJob, 'status'>): boolean => ['REDO_REQUIRED', 'PROCESSING'].includes(job.status)
export const isActiveRedo = (job: Pick<DestinationBatchJob, 'status' | 'redoScope'>): boolean => Boolean(job.redoScope && isActiveBatchJob(job))
export function validateBatchFile(file: Pick<File, 'name' | 'type'>): string | null { if (!file.name.toLowerCase().endsWith('.json')) return 'Archivo no válido. Selecciona un archivo de lote (.json).'; if (file.type && !['application/json', 'text/json'].includes(file.type)) return 'Archivo no válido. Selecciona un archivo de lote (.json).'; return null }
export function userFacingJobFailure(lastFailure: string, redoScope?: DestinationBatchRedoScope): string {
  if (lastFailure.includes('BATCH_PROVIDER_AUTHORIZATION_REQUIRED')) return redoScope ? `No se pudo rehacer ${redoScopeLabel(redoScope)}. El modo de ejecución disponible no está autorizado.` : 'La ejecución del destino no está autorizada.'
  if (lastFailure.includes('REAL_EDITORIAL_BUDGET_EXCEEDED') || lastFailure.includes('DESTINATION_COST_LIMIT_REACHED') || lastFailure.includes('BATCH_COST_LIMIT_REACHED')) return redoScope ? `No se pudo rehacer ${redoScopeLabel(redoScope)} porque el presupuesto disponible para esta operación no es suficiente.` : 'No se pudo completar este destino porque el presupuesto disponible no es suficiente.'
  return redoScope ? `No se pudo rehacer ${redoScopeLabel(redoScope)}.` : 'No se pudo completar este destino.'
}
export function technicalJobFailureDetail(lastFailure: string): string { return lastFailure.match(/[A-Z][A-Z0-9_]{2,}/)?.[0] ?? lastFailure }
export const primaryNavigationLabels = { library: 'Biblioteca', new: 'Nueva investigación', batches: 'Producción', providers: 'Proveedores' } as const
export const hiddenTechnicalViews = ['contributions', 'real-config'] as const
