/**
 * Investighost - Servicio Trawel
 * 
 * Propósito: Futura integración con Trawel para publicación
 * Alcance: Puerto de conexión hacia la futura API de Trawel
 * Estado: Placeholder - Trawel será rehecho, esta es la interfaz futura
 * 
 * Nota importante: Según DECISIONES.md, Trawel será rehecho por el equipo.
 * Esta interfaz anticipa la futura conectividad nativa.
 */

export interface TrawelService {
  isConnected(): boolean
  authenticate(): Promise<void>
  publishContent(content: unknown): Promise<{ success: boolean; contentId?: string }>
  getContentStatus(contentId: string): Promise<'pending' | 'live' | 'rejected'>
}

// Placeholder - esperando rebuild de Trawel
export const trawelService: TrawelService = {
  isConnected: () => false,
  authenticate: async () => {
    throw new Error('Trawel integration pending - waiting for Trawel rebuild')
  },
  publishContent: async () => {
    throw new Error('Trawel integration pending - waiting for Trawel rebuild')
  },
  getContentStatus: async () => 'pending',
}

console.log('[Trawel Service] Placeholder loaded - awaiting Trawel rebuild for native integration')