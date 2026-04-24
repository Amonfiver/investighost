/**
 * Investighost - Utilidades Helpers
 * 
 * Propósito: Funciones de utilidad generales
 * Alcance: Toda la aplicación
 * Estado: Esqueleto inicial
 */

/**
 * Genera un ID único simple (no UUID completo, suficiente para el esqueleto)
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Formatea una fecha para display
 */
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('es-ES', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

/**
 * Trunca texto con ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength).trim() + '...'
}

/**
 * Espera N milisegundos (util para simular delays en desarrollo)
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Validación simple de URL
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}