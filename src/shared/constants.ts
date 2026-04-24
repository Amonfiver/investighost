/**
 * Investighost - Constantes Compartidas
 * 
 * Propósito: Valores constantes usados en toda la app
 * Alcance: Main y renderer processes
 * Estado: Esqueleto inicial
 */

// Versión de la app
export const APP_NAME = 'Investighost'
export const APP_DESCRIPTION = 'Herramienta personal de investigación para alimentar Trawel'

// Estados de investigación
export const RESEARCH_STATUSES = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  REVIEWING: 'reviewing',
  PUBLISHED: 'published',
} as const

// Tipos de contenido que Investighost manejará
export const CONTENT_TYPES = {
  LANDMARK: 'landmark',
  NEIGHBORHOOD: 'neighborhood',
  ROUTE: 'route',
  MUSEUM: 'museum',
  VIEWPOINT: 'viewpoint',
  BEACH: 'beach',
  EXPERIENCE: 'experience',
  ITINERARY: 'itinerary',
} as const

// Fases del flujo de trabajo
export const WORKFLOW_PHASES = {
  INPUT: 'input',
  RESEARCH: 'research',
  SIGNALS: 'signals',
  STRUCTURING: 'structuring',
  EDITORIAL: 'editorial',
  REVIEW: 'review',
  PUBLISHING: 'publishing',
} as const