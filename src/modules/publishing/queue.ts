/**
 * Investighost - Cola Editorial / Publishing Queue
 * 
 * Propósito: Gestionar la publicación regulada de contenido aprobado
 * Alcance: Acumular trabajo aprobado y publicar con ritmo controlado
 * Estado: Base arquitectónica preparada, persistencia temporal
 * 
 * CONCEPTO CLAVE:
 * Investighost produce contenido internamente sin presión de publicación inmediata.
 * La cola editorial permite:
 * - Acumular piezas aprobadas
 * - Regular el ritmo de salida (ej: 3-5 piezas/día)
 * - Programar publicaciones
 * - Mantener flujo constante hacia Trawel
 */

import type { 
  PublishingQueueItem, 
  PublishingRateConfig, 
  EditorialQueueSummary,
  PublishingStatus,
  ContentPiece
} from '@shared/types'

// ============================================
// STORE TEMPORAL EN MEMORIA
// Se sustituirá por SQLite cuando esté operativo
// ============================================

interface QueueStore {
  items: Map<string, PublishingQueueItem>
  configs: Map<string, PublishingRateConfig>
  activeConfigId: string | null
}

const store: QueueStore = {
  items: new Map(),
  configs: new Map(),
  activeConfigId: null
}

// Configuración por defecto al iniciar
const defaultConfig: PublishingRateConfig = {
  id: 'default',
  name: 'Ritmo estándar (3/día)',
  maxDailyPosts: 3,
  preferredHoursStart: 9,
  preferredHoursEnd: 20,
  allowedDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
  minIntervalMinutes: 60,
  isActive: true,
  createdAt: new Date()
}

// Inicializar config por defecto
store.configs.set(defaultConfig.id, defaultConfig)
store.activeConfigId = defaultConfig.id

// ============================================
// GESTIÓN DE CONFIGURACIÓN DE RITMO
// ============================================

/**
 * Crea una nueva configuración de ritmo de publicación
 */
export async function createRateConfig(
  config: Omit<PublishingRateConfig, 'id' | 'createdAt'>
): Promise<PublishingRateConfig> {
  const newConfig: PublishingRateConfig = {
    ...config,
    id: `config_${Date.now()}`,
    createdAt: new Date()
  }
  
  store.configs.set(newConfig.id, newConfig)
  return newConfig
}

/**
 * Obtiene todas las configuraciones de ritmo
 */
export async function getAllRateConfigs(): Promise<PublishingRateConfig[]> {
  return Array.from(store.configs.values())
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
}

/**
 * Obtiene la configuración activa
 */
export async function getActiveRateConfig(): Promise<PublishingRateConfig | null> {
  if (!store.activeConfigId) return null
  return store.configs.get(store.activeConfigId) || null
}

/**
 * Activa una configuración específica
 */
export async function setActiveRateConfig(configId: string): Promise<boolean> {
  const config = store.configs.get(configId)
  if (!config) return false
  
  // Desactivar todas
  store.configs.forEach(c => { c.isActive = false })
  
  // Activar la seleccionada
  config.isActive = true
  store.activeConfigId = configId
  
  return true
}

// ============================================
// GESTIÓN DE LA COLA EDITORIAL
// ============================================

/**
 * Añade una pieza de contenido aprobada a la cola editorial
 * 
 * FLUJO: ContentPiece (approved) → PublishingQueueItem (queued)
 */
export async function enqueueContent(
  contentPiece: ContentPiece,
  priority: number = 5,
  scheduledPublishAt?: Date,
  editorialNotes?: string
): Promise<PublishingQueueItem> {
  // Solo se puede encolar contenido aprobado
  if (contentPiece.productionStatus !== 'approved') {
    throw new Error('Only approved content can be enqueued. Current status: ' + contentPiece.productionStatus)
  }
  
  // Calcular posición en cola
  const currentQueue = await getQueueByStatus('queued')
  const queuePosition = currentQueue.length + 1
  
  const queueItem: PublishingQueueItem = {
    id: `queue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    draftId: contentPiece.production.draft.id,
    researchResultId: contentPiece.production.result.id,
    title: contentPiece.production.draft.title,
    destination: contentPiece.destination,
    status: scheduledPublishAt ? 'scheduled' : 'queued',
    priority,
    queuePosition,
    addedToQueueAt: new Date(),
    scheduledPublishAt,
    targetPlatform: 'trawel',
    publishOptions: {
      category: 'destination',
      featured: false
    },
    editorialNotes
  }
  
  store.items.set(queueItem.id, queueItem)
  
  console.log(`[PublishingQueue] Content enqueued: "${queueItem.title}" at position ${queuePosition}`)
  
  return queueItem
}

/**
 * Obtiene elementos de la cola filtrados por estado
 */
export async function getQueueByStatus(
  status: PublishingStatus
): Promise<PublishingQueueItem[]> {
  return Array.from(store.items.values())
    .filter(item => item.status === status)
    .sort((a, b) => {
      // Primero por prioridad (mayor primero)
      if (b.priority !== a.priority) {
        return b.priority - a.priority
      }
      // Luego por fecha de encolado (más antiguo primero)
      return a.addedToQueueAt.getTime() - b.addedToQueueAt.getTime()
    })
}

/**
 * Obtiene todos los elementos de la cola
 */
export async function getAllQueueItems(): Promise<PublishingQueueItem[]> {
  return Array.from(store.items.values())
    .sort((a, b) => b.addedToQueueAt.getTime() - a.addedToQueueAt.getTime())
}

/**
 * Obtiene el siguiente elemento listo para publicar
 * 
 * Lógica:
 * 1. Primero los programados para ahora o antes
 * 2. Luego por prioridad
 * 3. Luego por orden de llegada
 */
export async function getNextPublishableItem(): Promise<PublishingQueueItem | null> {
  const now = new Date()
  
  // Buscar items programados para ya
  const scheduled = await getQueueByStatus('scheduled')
  const readyScheduled = scheduled.filter(item => 
    item.scheduledPublishAt && item.scheduledPublishAt <= now
  )
  
  if (readyScheduled.length > 0) {
    return readyScheduled[0] // Ya están ordenados
  }
  
  // Si no hay programados listos, tomar de la cola general
  const queued = await getQueueByStatus('queued')
  return queued[0] || null
}

/**
 * Marca un item como publicado
 */
export async function markAsPublished(
  queueItemId: string,
  publishedBy: string = 'system'
): Promise<boolean> {
  const item = store.items.get(queueItemId)
  if (!item) return false
  
  item.status = 'published'
  item.publishedAt = new Date()
  item.publishedBy = publishedBy
  
  // Recalcular posiciones de los que quedan en cola
  await recalculateQueuePositions()
  
  return true
}

/**
 * Mueve un item a estado 'publishing' (en proceso)
 */
export async function markAsPublishing(queueItemId: string): Promise<boolean> {
  const item = store.items.get(queueItemId)
  if (!item) return false
  
  item.status = 'publishing'
  return true
}

/**
 * Desprograma un item (vuelve a cola)
 */
export async function unscheduleItem(queueItemId: string): Promise<boolean> {
  const item = store.items.get(queueItemId)
  if (!item || item.status !== 'scheduled') return false
  
  item.status = 'queued'
  item.scheduledPublishAt = undefined
  
  await recalculateQueuePositions()
  return true
}

/**
 * Elimina un item de la cola
 */
export async function removeFromQueue(queueItemId: string): Promise<boolean> {
  const deleted = store.items.delete(queueItemId)
  if (deleted) {
    await recalculateQueuePositions()
  }
  return deleted
}

/**
 * Reordena un item en la cola (cambia prioridad)
 */
export async function reorderItem(
  queueItemId: string, 
  newPriority: number
): Promise<boolean> {
  const item = store.items.get(queueItemId)
  if (!item) return false
  
  item.priority = newPriority
  
  // Recalcular posiciones
  await recalculateQueuePositions()
  
  return true
}

/**
 * Programa un item para fecha específica
 */
export async function scheduleItem(
  queueItemId: string,
  scheduledDate: Date
): Promise<boolean> {
  const item = store.items.get(queueItemId)
  if (!item) return false
  
  item.scheduledPublishAt = scheduledDate
  item.status = 'scheduled'
  
  return true
}

// ============================================
// CÁLCULOS Y ESTADÍSTICAS
// ============================================

/**
 * Recalcula las posiciones en cola
 */
async function recalculateQueuePositions(): Promise<void> {
  const queued = await getQueueByStatus('queued')
  
  queued.forEach((item, index) => {
    item.queuePosition = index + 1
  })
}

/**
 * Obtiene estadísticas de publicación para hoy
 */
export async function getTodayStats(): Promise<{
  published: number
  remaining: number
  maxDaily: number
}> {
  const config = await getActiveRateConfig()
  const maxDaily = config?.maxDailyPosts || 3
  
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  const publishedToday = Array.from(store.items.values()).filter(item => {
    if (!item.publishedAt) return false
    const pubDate = new Date(item.publishedAt)
    pubDate.setHours(0, 0, 0, 0)
    return pubDate.getTime() === today.getTime()
  }).length
  
  return {
    published: publishedToday,
    remaining: Math.max(0, maxDaily - publishedToday),
    maxDaily
  }
}

/**
 * Obtiene resumen completo de la cola editorial
 */
export async function getQueueSummary(): Promise<EditorialQueueSummary> {
  const allItems = await getAllQueueItems()
  const stats = await getTodayStats()
  const config = await getActiveRateConfig()
  
  const approved = allItems.filter(i => i.status === 'not_published').length
  const queued = allItems.filter(i => i.status === 'queued').length
  const scheduled = allItems.filter(i => i.status === 'scheduled').length
  const published = allItems.filter(i => i.status === 'published').length
  
  const nextItem = await getNextPublishableItem()
  
  return {
    totalApproved: approved,
    totalQueued: queued,
    totalScheduled: scheduled,
    totalPublished: published,
    
    nextInQueue: nextItem ? {
      id: nextItem.id,
      title: nextItem.title,
      destination: `${nextItem.destination.country} > ${nextItem.destination.region}`,
      scheduledFor: nextItem.scheduledPublishAt
    } : undefined,
    
    currentRate: {
      configName: config?.name || 'Default',
      maxDaily: stats.maxDaily,
      publishedToday: stats.published,
      remainingToday: stats.remaining
    }
  }
}

// ============================================
// UTILIDADES
// ============================================

/**
 * Limpia toda la cola (solo para desarrollo)
 */
export function clearQueue(): void {
  store.items.clear()
  console.log('[PublishingQueue] Queue cleared')
}

/**
 * Obtiene estadísticas de debug
 */
export function getQueueDebugStats(): {
  totalItems: number
  byStatus: Record<string, number>
} {
  const byStatus: Record<string, number> = {}
  
  store.items.forEach(item => {
    byStatus[item.status] = (byStatus[item.status] || 0) + 1
  })
  
  return {
    totalItems: store.items.size,
    byStatus
  }
}