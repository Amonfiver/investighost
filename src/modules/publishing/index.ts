/**
 * Investighost - Módulo de Publicación
 * 
 * Propósito: Gestión del flujo de publicación hacia Trawel con cola editorial
 * Alcance: Cola editorial, ritmo de publicación, envío a Trawel
 * Estado: Base preparada con cola editorial, integración Trawel pendiente
 * 
 * ARQUITECTURA:
 * - Separa producción interna de publicación externa
 * - Permite acumular contenido aprobado
 * - Regula el ritmo de salida hacia Trawel
 */

import type { EditorialDraft, ContentPiece } from '@shared/types'

// Exportar sistema de cola editorial
export * from './queue'

// ============================================
// TIPOS DE RESULTADO
// ============================================

export interface PublishingResult {
  success: boolean
  trawelId?: string
  publishedUrl?: string
  error?: string
}

// ============================================
// SERVICIO DE PUBLICACIÓN EN TRAWEL
// Placeholder - se activará cuando Trawel esté rehecho
// ============================================

/**
 * Publica contenido en Trawel
 * Estado: NO IMPLEMENTADO - requiere Trawel rehecho
 */
export async function publishToTrawel(
  _draft: EditorialDraft
): Promise<PublishingResult> {
  // TODO: Implementar integración real con Trawel cuando esté disponible
  console.warn('[Publishing] publishToTrawel not yet implemented')
  return {
    success: false,
    error: 'Trawel integration not available - platform rebuild pending'
  }
}

/**
 * Previsualiza cómo quedaría el contenido en Trawel
 * Estado: NO IMPLEMENTADO
 */
export async function previewInTrawel(
  _draft: EditorialDraft
): Promise<{ previewUrl?: string; previewHtml?: string }> {
  return {
    previewHtml: '<p>Preview not available yet</p>'
  }
}

// ============================================
// FLUJO COMPLETO: Aprobación → Cola → Publicación
// ============================================

/**
 * Flujo completo para llevar una pieza de contenido aprobada a la cola editorial
 */
export async function approveAndEnqueue(
  contentPiece: ContentPiece,
  options?: {
    priority?: number
    scheduledPublishAt?: Date
    editorialNotes?: string
  }
): Promise<{ success: boolean; queueItemId?: string; error?: string }> {
  try {
    // Lazy import para evitar dependencias circulares
    const { enqueueContent } = await import('./queue')
    
    const queueItem = await enqueueContent(
      contentPiece,
      options?.priority ?? 5,
      options?.scheduledPublishAt,
      options?.editorialNotes
    )
    
    return {
      success: true,
      queueItemId: queueItem.id
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

// ============================================
// ESTADO DEL MÓDULO
// ============================================

export function getPublishingStatus(): {
  queueEnabled: boolean
  trawelIntegration: 'pending' | 'ready' | 'disabled'
} {
  return {
    queueEnabled: true,
    trawelIntegration: 'pending'
  }
}

console.log('[Publishing Module] Loaded with editorial queue support')