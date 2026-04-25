/**
 * Investighost - Servicio de Investigación con IA
 * 
 * Propósito: Realizar investigaciones reales de destinos usando Kimi
 * Alcance: Generar datos estructurados y borradores editoriales
 * Estado: Implementación mínima con Kimi
 * 
 * NOTA: Usa generateStructured para obtener JSON válido de la API
 */

import { generateText } from './index'
import type { ResearchInput, ResearchResult, EditorialDraft, Place, Activity } from '@shared/types'
import { generateId } from '@utils/helpers'

// ============================================
// PROMPTS DE INVESTIGACIÓN
// ============================================

const buildResearchPrompt = (input: ResearchInput): string => {
  const { country, region, focus, userNotes } = input
  
  const location = region ? `${region}, ${country}` : country
  const focusText = focus ? ` con enfoque en ${focus}` : ''
  const notesText = userNotes ? `\n\nNotas adicionales del usuario: ${userNotes}` : ''
  
  return `Investiga sobre "${location}"${focusText} como destino de viaje.

Proporciona información útil, específica y práctica para viajeros. Evita descripciones genéricas.

Tu respuesta debe incluir:
1. Descripción general del destino (2-3 frases específicas)
2. Resumen breve de por qué merece la pena visitarlo
3. 4-6 lugares imprescindibles para visitar (con categoría: landmark, neighborhood, museum, viewpoint, beach, park, market)
4. 3-5 actividades o experiencias recomendadas (con categoría: experience, tour, food, nightlife, shopping, relax)
5. 4-6 consejos prácticos para visitantes
6. 2-3 fuentes de información confiables (simuladas pero realistas)${notesText}

Responde en español de forma natural, amable y útil.`
}

const buildStructuredPrompt = (input: ResearchInput, researchText: string): string => {
  const { country, region } = input
  const location = region ? `${region}, ${country}` : country
  
  return `Basándote en esta investigación sobre "${location}":

"""
${researchText}
"""

Genera un objeto JSON con la siguiente estructura EXACTA:

{
  "destination": {
    "country": "${country}",
    "region": "${region || country}",
    "description": "descripción específica del lugar (2-3 frases)"
  },
  "summary": "resumen persuasivo de por qué visitar (1-2 frases)",
  "places": [
    {
      "name": "nombre del lugar",
      "category": "landmark|neighborhood|museum|viewpoint|beach|park|market|other",
      "description": "descripción específica (no genérica)",
      "whyVisit": "por qué merece la pena visitarlo",
      "bestFor": "tipo de viajero ideal (opcional)",
      "estimatedTime": "tiempo recomendado de visita (opcional)",
      "practicalInfo": "información práctica breve (opcional)"
    }
  ],
  "activities": [
    {
      "name": "nombre de la actividad",
      "description": "descripción de la experiencia",
      "category": "experience|tour|food|nightlife|shopping|relax|other",
      "idealFor": "a quién va dirigida (opcional)",
      "duration": "duración aproximada (opcional)"
    }
  ],
  "tips": ["consejo práctico 1", "consejo práctico 2", ...],
  "sources": [
    {
      "url": "https://ejemplo-realista.com/articulo",
      "title": "título del artículo o fuente",
      "type": "official|blog|guide|review|other",
      "reliability": 0.8
    }
  ],
  "confidence": 0.85
}

IMPORTANTE:
- Usa información REAL y ESPECÍFICA de ${location}
- Evita frases genéricas como "es un lugar maravilloso" sin contexto
- Los lugares y actividades deben ser concretos y nombrables
- confidence: número entre 0 y 1 estimando la fiabilidad de la info`
}

// ============================================
// FUNCIÓN PRINCIPAL DE INVESTIGACIÓN
// ============================================

export interface ResearchWithAIResult {
  result: ResearchResult
  draft: EditorialDraft
  logId?: string
  provider: string
  cost?: number
}

/**
 * Realiza una investigación real usando Kimi
 * @throws Error si no hay proveedor configurado o falla la API
 */
export async function researchWithAI(
  researchId: string,
  input: ResearchInput
): Promise<ResearchWithAIResult> {
  
  // 1. Generar investigación textual
  const researchPrompt = buildResearchPrompt(input)
  
  const { result: researchText, cost, logId } = await generateText(researchPrompt, {
    strategy: 'kimi', // Forzar uso de Kimi
    trackUsage: true,
  })
  
  // Actualizar log con tipo de operación correcto
  if (logId) {
    // El log ya se creó, pero podríamos añadir metadatos adicionales si fuera necesario
  }
  
  // 2. Generar datos estructurados
  const structuredPrompt = buildStructuredPrompt(input, researchText)
  
  const { result: structuredData, provider: structProvider, cost: structCost, logId: structLogId } = await generateText(
    structuredPrompt,
    { strategy: 'kimi', trackUsage: true }
  )
  
  // Parsear JSON (con limpieza de markdown)
  let parsedData: Partial<ResearchResult>
  try {
    const cleanJson = structuredData
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim()
    parsedData = JSON.parse(cleanJson)
  } catch (error) {
    throw new Error(`Failed to parse structured data: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
  
  // 3. Construir ResearchResult
  const result: ResearchResult = {
    id: generateId(),
    researchId,
    destination: {
      country: parsedData.destination?.country || input.country,
      region: parsedData.destination?.region || input.region || input.country,
      description: parsedData.destination?.description || `Destino en ${input.country}`,
    },
    summary: parsedData.summary || `Investigación sobre ${input.region || input.country}`,
    places: (parsedData.places || []).map((p: Partial<Place>) => ({
      id: generateId(),
      name: p.name || 'Lugar sin nombre',
      category: p.category || 'other',
      description: p.description || '',
      whyVisit: p.whyVisit || '',
      bestFor: p.bestFor,
      estimatedTime: p.estimatedTime,
      practicalInfo: p.practicalInfo,
    })),
    activities: (parsedData.activities || []).map((a: Partial<Activity>) => ({
      id: generateId(),
      name: a.name || 'Actividad sin nombre',
      description: a.description || '',
      category: a.category || 'other',
      idealFor: a.idealFor,
      duration: a.duration,
    })),
    tips: parsedData.tips || [],
    sources: (parsedData.sources || []).map((s: { url: string; title: string; type: string; reliability: number }) => ({
      id: generateId(),
      url: s.url || 'https://example.com',
      title: s.title || 'Fuente',
      type: (s.type as 'official' | 'blog' | 'guide' | 'review' | 'other') || 'other',
      reliability: s.reliability ?? 0.7,
      accessedAt: new Date(),
    })),
    confidence: parsedData.confidence ?? 0.7,
    generatedAt: new Date(),
  }
  
  // 4. Generar borrador editorial
  const draft = generateEditorialDraft(result, researchText)
  
  // Calcular coste total
  const totalCost = (cost || 0) + (structCost || 0)
  
  return {
    result,
    draft,
    logId: structLogId || logId,
    provider: structProvider,
    cost: totalCost,
  }
}

// ============================================
// GENERACIÓN DE BORRADOR EDITORIAL
// ============================================

function generateEditorialDraft(result: ResearchResult, _researchText: string): EditorialDraft {
  const { destination, summary, places, activities, tips } = result
  
  const sections = [
    {
      id: generateId(),
      heading: 'Descubre el lugar',
      content: destination.description,
      order: 0,
    },
    {
      id: generateId(),
      heading: 'Lugares imprescindibles',
      content: places.length > 0 
        ? places.map(p => `${p.name}: ${p.description} ${p.whyVisit ? `Por qué visitarlo: ${p.whyVisit}` : ''}`).join('\n\n')
        : 'Información de lugares en preparación.',
      order: 1,
    },
    {
      id: generateId(),
      heading: 'Experiencias recomendadas',
      content: activities.length > 0
        ? activities.map(a => `${a.name}${a.duration ? ` (${a.duration})` : ''}: ${a.description}`).join('\n\n')
        : 'Experiencias en documentación.',
      order: 2,
    },
    {
      id: generateId(),
      heading: 'Consejos prácticos',
      content: tips.length > 0
        ? tips.map(t => `• ${t}`).join('\n')
        : 'Consulta fuentes oficiales para información actualizada.',
      order: 3,
    },
  ]
  
  const wordCount = sections.reduce((acc, s) => acc + s.content.split(/\s+/).length, 0)
  
  return {
    id: generateId(),
    researchResultId: result.id,
    title: `Guía de viaje: ${destination.region}, ${destination.country}`,
    introduction: summary,
    sections,
    tone: 'friendly',
    language: 'es',
    status: 'ready',
    wordCount,
    generatedAt: new Date(),
  }
}

// ============================================
// UTILIDADES
// ============================================

/**
 * Verifica si la investigación con IA está disponible
 */
export function isAIResearchAvailable(): boolean {
  try {
    // Importación dinámica para evitar dependencia circular
    const { getProviderFactory } = require('./providers')
    const factory = getProviderFactory()
    return factory.getAvailableProviders().length > 0
  } catch {
    return false
  }
}