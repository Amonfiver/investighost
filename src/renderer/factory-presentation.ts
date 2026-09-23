import type { DestinationBatchRedoScope } from '@shared/factory-batch-contracts'

export const redoScopeLabel = (scope: DestinationBatchRedoScope): string => ({ STUDENT: 'Student', ADVENTURE: 'Adventure', VISUALS: 'Imágenes', EDITORIAL: 'contenido editorial' } as Record<DestinationBatchRedoScope, string>)[scope]
export const jobStatusLabel = (value: string, redoScope?: DestinationBatchRedoScope): string => redoScope && ['REDO_REQUIRED', 'PROCESSING'].includes(value)
  ? `Rehaciendo ${redoScopeLabel(redoScope)}`
  : ({ QUEUED: 'En cola', PROCESSING: 'Procesando', READY_FOR_REVIEW: 'Para revisar', APPROVED: 'Aprobado', REDO_REQUIRED: 'Rehacer', FAILED: 'Fallido', BLOCKED_AMBIGUOUS: 'Requiere revisión', REUSED: 'Reutilizado', DELIVERED: 'Enviado', IMPORTED: 'Importado' } as Record<string, string>)[value] ?? value
export const jobPhaseLabel = (value: string, redoScope?: DestinationBatchRedoScope): string => redoScope && ['STUDENT', 'ADVENTURE', 'VISUALS', 'AUTO_REVIEW'].includes(value)
  ? `Rehaciendo ${redoScopeLabel(redoScope)}`
  : ({ IDENTITY: 'Preparando destino', RESEARCH: 'Investigando', ANALYSIS: 'Analizando', STUDENT: 'Creando Student', ADVENTURE: 'Creando Adventure', VISUALS: 'Buscando imágenes', AUTO_REVIEW: 'Revisando automáticamente', DELIVERY: 'Enviando' } as Record<string, string>)[value] ?? value
export const formatCost = (value: number): string => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value)
export function validateBatchFile(file: Pick<File, 'name' | 'type'>): string | null { if (!file.name.toLowerCase().endsWith('.json')) return 'Archivo no válido. Selecciona un archivo de lote (.json).'; if (file.type && !['application/json', 'text/json'].includes(file.type)) return 'Archivo no válido. Selecciona un archivo de lote (.json).'; return null }
export function userFacingJobFailure(lastFailure: string, redoScope?: DestinationBatchRedoScope): string {
  if (lastFailure.includes('BATCH_PROVIDER_AUTHORIZATION_REQUIRED')) return redoScope ? `No se pudo rehacer ${redoScopeLabel(redoScope)}. El modo de ejecución disponible no está autorizado.` : 'La ejecución del destino no está autorizada.'
  return redoScope ? `No se pudo rehacer ${redoScopeLabel(redoScope)}.` : 'No se pudo completar este destino.'
}
export const primaryNavigationLabels = { library: 'Biblioteca', new: 'Nueva investigación', batches: 'Producción', providers: 'Proveedores' } as const
export const hiddenTechnicalViews = ['contributions', 'real-config'] as const
