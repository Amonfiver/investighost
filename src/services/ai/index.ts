/**
 * Investighost - Servicio AI
 * 
 * Propósito: Integración con modelos de lenguaje para generación de contenido
 * Alcance: Abstracción de la capa de IA (OpenAI, Anthropic, local, etc.)
 * Estado: Placeholder - NO implementar en esqueleto
 */

export interface AIService {
  isAvailable(): boolean
  generateText(prompt: string, options?: unknown): Promise<string>
  improveText(text: string, instructions: string): Promise<string>
}

// Placeholder - se activará cuando se configure API key
export const aiService: AIService = {
  isAvailable: () => false,
  generateText: async () => {
    throw new Error('AI service not configured - set up API keys in future block')
  },
  improveText: async () => {
    throw new Error('AI service not configured - set up API keys in future block')
  },
}

console.log('[AI Service] Placeholder loaded - configure API keys to activate')