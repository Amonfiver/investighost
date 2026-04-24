/**
 * Investighost - Servicio Web
 * 
 * Propósito: Búsqueda web y scraping de información
 * Alcance: Integración con search APIs y navegación web
 * Estado: Placeholder - NO implementar scraping real en esqueleto
 */

export interface WebService {
  search(query: string, options?: unknown): Promise<unknown[]>
  fetchPage(url: string): Promise<string>
  extractSignals(html: string): unknown[]
}

// Placeholder - requiere configuración de APIs de búsqueda
export const webService: WebService = {
  search: async () => {
    throw new Error('Web search not implemented - requires search API configuration')
  },
  fetchPage: async () => {
    throw new Error('Web fetch not implemented - requires puppeteer/playwright setup')
  },
  extractSignals: () => [],
}

console.log('[Web Service] Placeholder loaded - search API configuration pending')