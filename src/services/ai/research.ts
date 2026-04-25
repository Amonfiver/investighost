/**
 * Investighost - Servicio de Investigación con IA (Mejorado)
 * 
 * Propósito: Realizar investigaciones honestas de destinos usando Kimi
 * Alcance: Generar datos estructurados con reconocimiento de limitaciones
 * Estado: Prompts optimizados para especificidad y honestidad
 * 
 * NOTA: Este servicio trabaja SOLO con conocimiento del modelo.
 * No realiza búsqueda web real. Los resultados indican claramente
 * qué información requiere verificación adicional.
 */

import { generateText } from './index'
import { getProviderFactory } from './providers'
import type { ResearchInput, ResearchResult, EditorialDraft, Place, Activity, Source, WebResearchBundle, WebSearchResult, WebSourceType } from '@shared/types'
import { generateId } from '@utils/helpers'

// ============================================
// PROMPTS DE INVESTIGACIÓN MEJORADOS
// ============================================

/**
 * Prompt inicial: Solicita información específica sin inventar fuentes
 */
const buildResearchPrompt = (input: ResearchInput): string => {
  const { country, region, focus, userNotes } = input
  
  const location = region ? `${region}, ${country}` : country
  const focusText = focus ? ` con enfoque en ${focus}` : ''
  const notesText = userNotes ? `\n\nNotas adicionales del usuario: ${userNotes}` : ''
  
  return `Eres un investigador de viajes honesto y riguroso. Tu trabajo es recopilar información sobre "${location}"${focusText} usando SOLO tu conocimiento del modelo.

REGLAS ESTRICTAS:
1. NO inventes fuentes, URLs, nombres de negocios específicos o precios exactos que no conozcas con certeza.
2. Si no estás seguro de un dato, indícalo claramente como "[pendiente de verificar]".
3. Evita frases genéricas como "combinación perfecta de cultura y gastronomía" o "experiencias inolvidables".
4. Sé específico con lugares reales que conozcas del destino.
5. No sugieras actividades genéricas como "paseo por el centro histórico" sin detalles concretos.

ESTRUCTURA DE RESPUESTA:

1. RESUMEN EDITORIAL (2-3 frases específicas sobre qué hace único a ${location})

2. DATOS ÚTILES CONOCIDOS
   - Ubicación geográfica relevante
   - Cómo llegar (aproximado)
   - Mejor época para visitar (si la conoces)
   - Duración recomendada de visita

3. LUGARES RECOMENDABLES (solo si los conoces con certeza)
   Para cada lugar indica:
   - Nombre específico
   - Breve descripción factual (no promocional)
   - Por qué es relevante
   - Nivel de confianza: alto/medio/bajo

4. CURIOSIDADES / HISTORIA / CULTURA
   - Datos históricos relevantes que conozcas
   - Tradiciones o costumbres específicas
   - Anécdotas o historias del lugar

5. IDEAS DE ENFOQUE PARA ARTÍCULO
   - 3-4 ángulos editoriales potenciales
   - Públicos objetivo específicos
   - Temporadas o eventos relevantes

6. ELEMENTOS PENDIENTES DE VERIFICAR
   - Lista explícita de lo que necesitaría confirmación web
   - Nombres de restaurantes, hoteles o negocios específicos
   - Precios, horarios o datos que pueden haber cambiado
   - Eventos actuales o temporales

7. LIMITACIONES DE ESTA INVESTIGACIÓN
   - Esta investigación NO incluye búsqueda web real
   - Los datos provienen únicamente del conocimiento del modelo hasta corte de entrenamiento
   - Se recomienda verificación cruzada antes de publicar${notesText}

Responde en español, siendo honesto sobre lo que sabes y lo que desconoces.`
}

/**
 * Prompt para estructurar datos: Enfatiza honestidad y marca lo pendiente
 */
const buildStructuredPrompt = (input: ResearchInput, researchText: string): string => {
  const { country, region } = input
  const location = region ? `${region}, ${country}` : country
  
  return `Basándote en esta investigación sobre "${location}":
"""
${researchText}
"""

Genera un objeto JSON con la siguiente estructura EXACTA. SE HONESTO: si no tienes certeza sobre algo, usa "pendiente de verificar" o omite el campo.

{
  "destination": {
    "country": "${country}",
    "region": "${region || country}",
    "description": "descripción específica y factual, sin adjetivos vacíos de contenido"
  },
  "summary": "resumen honesto de por qué visitar, máximo 2 frases",
  "places": [
    {
      "name": "nombre específico del lugar (no genérico)",
      "category": "landmark|neighborhood|museum|viewpoint|beach|park|market|other",
      "description": "descripción factual, evita 'maravilloso', 'perfecto', 'increíble'",
      "whyVisit": "razón concreta para visitar",
      "confidenceLevel": "high|medium|low",
      "verificationNeeded": "descripción de qué falta por verificar, o null si está completo"
    }
  ],
  "activities": [
    {
      "name": "nombre específico de la actividad",
      "description": "descripción sin frases de relleno tipo 'experiencia única'",
      "category": "experience|tour|food|nightlife|shopping|relax|other",
      "confidenceLevel": "high|medium|low"
    }
  ],
  "tips": ["consejo práctico específico, evita 'respeta las normas locales'"],
  "sources": {
    "note": "NINGUNA FUENTE WEB REAL CONSULTADA. Esta investigación usa solo conocimiento del modelo.",
    "realSources": [],
    "suggestedSourcesToCheck": ["tipo de fuente recomendada: ej. web oficial de turismo", "blogs especializados en ${country}", "guías de viaje actualizadas"]
  },
  "pendingVerification": [
    "elemento específico que necesita verificación web",
    "precios actuales",
    "horarios de apertura",
    "disponibilidad de tours"
  ],
  "articleAngles": [
    "ángulo editorial 1: descripción del enfoque",
    "ángulo editorial 2: público objetivo específico"
  ],
  "limitations": "Esta investigación no incluye búsqueda web. Se recomienda verificar: precios, horarios, disponibilidad de servicios, y nombres específicos de negocios antes de publicar.",
  "confidence": 0.65
}

REGLAS CRÍTICAS:
1. confidence: usa 0.6-0.75 para destinos conocidos, 0.4-0.6 para destinos menos conocidos. NUNCA uses 0.9+ sin verificación web real.
2. NO inventes URLs ni fuentes específicas en sources.realSources.
3. Marca explícitamente qué lugares/infos necesitan verificationNeeded.
4. Evita frases genéricas como "cautivará todos tus sentidos" o "fusión perfecta de tradición y modernidad".
5. Sé específico: en lugar de "Mercado Tradicional", pon el nombre real si lo conoces, o indica "[nombre real pendiente de verificar]".`
}

interface CompactWebSource {
  ref: string
  title: string
  url: string
  snippet: string
  provider: string
  reliabilityScore: number
  sourceType: WebSourceType
  capturedAt: Date
}

const buildCompactWebStructuredPrompt = (
  input: ResearchInput,
  sources: CompactWebSource[]
): string => {
  const { country, region } = input
  const location = region ? `${region}, ${country}` : country

  return `Eres analista/redactor editorial para Trawel. Analiza "${location}" usando SOLO estas fuentes de busqueda web ya compactadas.

FUENTES DISPONIBLES:
${formatCompactSourcesForPrompt(sources)}

Reglas estrictas:
- Usa solo title, url y snippet de las fuentes.
- No inventes lugares, fuentes, horarios, precios, restaurantes ni opiniones.
- Si algo no aparece en las fuentes, ponlo en pendingVerification.
- Conserva URLs reales solo desde las fuentes.
- No uses frases promocionales genericas.
- confidence debe ser prudente y nunca mayor que 0.75.
- Devuelve SOLO JSON valido, sin markdown.

Genera un objeto JSON con esta estructura:

{
  "destination": {
    "country": "${country}",
    "region": "${region || country}",
    "description": "descripcion breve basada solo en fuentes"
  },
  "title": "titulo editorial prudente",
  "summary": "resumen honesto, maximo 2 frases",
  "keyPoints": ["punto clave basado en fuente [F1]"],
  "places": [
    {
      "name": "lugar o tema detectado",
      "category": "landmark|neighborhood|museum|viewpoint|beach|park|market|other",
      "description": "que dice la fuente",
      "whyVisit": "por que puede ser util editorialmente",
      "confidenceLevel": "high|medium|low",
      "verificationNeeded": "que falta verificar antes de publicar",
      "sourceRefs": ["F1"]
    }
  ],
  "activities": [
    {
      "name": "actividad o tema practico detectado",
      "description": "descripcion sin relleno",
      "category": "experience|tour|food|nightlife|shopping|relax|other",
      "confidenceLevel": "high|medium|low",
      "sourceRefs": ["F1"]
    }
  ],
  "tips": ["consejo practico derivado de fuentes o marcado pendiente de verificar"],
  "sourcesUsed": ["F1", "F2"],
  "pendingVerification": [
    "horarios, precios o datos que requieren abrir fuente completa"
  ],
  "articleAngles": [
    "angulo editorial derivado de fuentes"
  ],
  "limitations": "Esta investigacion se basa en resultados de busqueda (titulo, URL y snippet). No se han abierto paginas completas.",
  "confidence": 0.65
}
`
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
 * Realiza una investigación honesta usando Kimi
 * @throws Error si no hay proveedor configurado o falla la API
 */
export async function researchWithAI(
  researchId: string,
  input: ResearchInput,
  webResearchBundle?: WebResearchBundle
): Promise<ResearchWithAIResult> {
  
  console.log('🤖 [researchWithAI] Called with researchId:', researchId)
  console.log('🤖 [researchWithAI] Input:', JSON.stringify(input))

  if (webResearchBundle) {
    return researchWithCompactWebBundle(researchId, input, webResearchBundle)
  }
  
  // 1. Generar investigación textual
  const researchPrompt = buildResearchPrompt(input)
  console.log('🤖 [researchWithAI] Prompt 1 length:', researchPrompt.length)
  
  const { result: researchText, cost, logId } = await generateText(researchPrompt, {
    strategy: 'kimi',
    trackUsage: true,
  })
  
  console.log('🤖 [researchWithAI] Step 1 complete. Research text length:', researchText.length)
  console.log('🤖 [researchWithAI] Step 1 preview:', researchText.substring(0, 200) + '...')
  
  // 2. Generar datos estructurados
  const structuredPrompt = buildStructuredPrompt(input, researchText)
  console.log('🤖 [researchWithAI] Prompt 2 length:', structuredPrompt.length)
  
  const { result: structuredData, provider: structProvider, cost: structCost, logId: structLogId } = await generateText(
    structuredPrompt,
    { strategy: 'kimi', trackUsage: true }
  )
  
  console.log('🤖 [researchWithAI] Step 2 complete. Structured data length:', structuredData.length)
  
  // Parsear JSON (con limpieza de markdown)
  let parsedData: Record<string, unknown>
  try {
    const cleanJson = structuredData
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim()
    parsedData = JSON.parse(cleanJson) as Record<string, unknown>
  } catch (error) {
    throw new Error(`Failed to parse structured data: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
  
  console.log('🤖 [researchWithAI] Parsing JSON...')
  
  // 3. Construir ResearchResult con manejo seguro de campos
  const result: ResearchResult = {
    id: generateId(),
    researchId,
    destination: {
      country: (parsedData.destination as { country?: string })?.country || input.country,
      region: (parsedData.destination as { region?: string })?.region || input.region || input.country,
      description: (parsedData.destination as { description?: string })?.description || `Destino en ${input.country}`,
    },
    summary: (parsedData.summary as string) || `Investigación sobre ${input.region || input.country}`,
    places: ((parsedData.places as Record<string, unknown>[]) || []).map((p) => ({
      id: generateId(),
      name: (p.name as string) || 'Lugar sin nombre',
      category: (p.category as Place['category']) || 'other',
      description: (p.description as string) || '',
      whyVisit: (p.whyVisit as string) || '',
      bestFor: (p.bestFor as string) || (p.confidenceLevel as string) === 'low' ? '[verificar antes de publicar]' : undefined,
      estimatedTime: (p.estimatedTime as string),
      practicalInfo: (p.verificationNeeded as string) || undefined,
    })),
    activities: ((parsedData.activities as Record<string, unknown>[]) || []).map((a) => ({
      id: generateId(),
      name: (a.name as string) || 'Actividad sin nombre',
      description: (a.description as string) || '',
      category: (a.category as Activity['category']) || 'other',
      idealFor: (a.confidenceLevel as string) === 'low' ? '[sugerencia - verificar disponibilidad]' : (a.idealFor as string),
      duration: (a.duration as string),
    })),
    tips: ((parsedData.tips as string[]) || []).filter(t => 
      // Filtrar consejos demasiado genéricos
      !t.toLowerCase().includes('aprender frases básicas') &&
      !t.toLowerCase().includes('respeta las normas') &&
      !t.toLowerCase().includes('disfruta de')
    ),
    sources: [{
      id: generateId(),
      url: 'internal://model-knowledge',
      title: 'Conocimiento del modelo Kimi (sin búsqueda web)',
      type: 'other',
      reliability: 0.6,
      accessedAt: new Date(),
    }],
    confidence: Math.min((parsedData.confidence as number) ?? 0.65, 0.75), // Cap a 0.75 max
    generatedAt: new Date(),
  }
  
  console.log('🤖 [researchWithAI] Result built:', {
    id: result.id,
    confidence: result.confidence,
    placesCount: result.places.length,
    sourcesCount: result.sources.length,
    sourcesTitles: result.sources.map(s => s.title)
  })
  
  // 4. Generar borrador editorial mejorado
  const draft = generateHonestEditorialDraft(result, parsedData, researchText)
  
  console.log('🤖 [researchWithAI] Draft generated:', {
    id: draft.id,
    title: draft.title,
    sectionsCount: draft.sections.length
  })
  
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
// GENERACIÓN DE BORRADOR EDITORIAL HONESTO
// ============================================

function generateHonestEditorialDraft(
  result: ResearchResult, 
  parsedData: Record<string, unknown>,
  _researchText: string
): EditorialDraft {
  const { destination, summary, places, activities, tips } = result
  const hasWebSources = result.sources.some(source => !source.url.startsWith('internal://'))
  
  const pendingVerification = (parsedData.pendingVerification as string[]) || []
  const articleAngles = (parsedData.articleAngles as string[]) || []
  const limitations = (parsedData.limitations as string) || 
    'Esta investigación se basa únicamente en conocimiento del modelo. Se recomienda verificación web antes de publicar.'
  
  // Filtrar lugares por nivel de confianza implícito
  const highConfidencePlaces = places.filter(p => 
    !p.practicalInfo?.includes('verificar') && !p.bestFor?.includes('verificar')
  )
  const needsVerificationPlaces = places.filter(p => 
    p.practicalInfo?.includes('verificar') || p.bestFor?.includes('verificar')
  )
  
  const sections = [
    {
      id: generateId(),
      heading: 'Sobre el destino',
      content: destination.description,
      order: 0,
    },
    {
      id: generateId(),
      heading: hasWebSources ? 'Lugares y temas detectados en fuentes' : 'Lugares destacados (verificados)',
      content: highConfidencePlaces.length > 0 
        ? highConfidencePlaces.map(p => 
            `**${p.name}** (${p.category})\n${p.description}\n${p.whyVisit ? `Por qué visitarlo: ${p.whyVisit}` : ''}`
          ).join('\n\n')
        : hasWebSources
          ? 'No hay lugares con soporte suficiente en los snippets recopilados.'
          : 'No hay lugares con alta confianza en la base de conocimiento del modelo. Se requiere investigación web adicional.',
      order: 1,
    },
    {
      id: generateId(),
      heading: 'Sugerencias pendientes de verificación',
      content: needsVerificationPlaces.length > 0
        ? needsVerificationPlaces.map(p => 
            `**${p.name}** [VERIFICAR]\n${p.description}\n${p.practicalInfo || ''}`
          ).join('\n\n')
        : 'No hay sugerencias pendientes.',
      order: 2,
    },
    {
      id: generateId(),
      heading: 'Experiencias y actividades',
      content: activities.length > 0
        ? activities.map(a => {
            const needsVerify = a.idealFor?.includes('verificar')
            return `**${a.name}${needsVerify ? ' [VERIFICAR]' : ''}**${a.duration ? ` (${a.duration})` : ''}\n${a.description}`
          }).join('\n\n')
        : 'Actividades no documentadas en la base de conocimiento.',
      order: 3,
    },
    {
      id: generateId(),
      heading: 'Consejos prácticos',
      content: tips.length > 0
        ? tips.map(t => `• ${t}`).join('\n')
        : 'Consulta fuentes oficiales para información práctica actualizada.',
      order: 4,
    },
    {
      id: generateId(),
      heading: 'Ángulos editoriales propuestos',
      content: articleAngles.length > 0
        ? articleAngles.map((a, i) => `${i + 1}. ${a}`).join('\n')
        : 'Se requiere análisis editorial manual.',
      order: 5,
    },
    {
      id: generateId(),
      heading: 'Elementos que requieren verificación web',
      content: pendingVerification.length > 0
        ? pendingVerification.map(v => `• ${v}`).join('\n')
        : '• Precios actuales\n• Horarios de apertura\n• Disponibilidad de servicios',
      order: 6,
    },
    {
      id: generateId(),
      heading: 'Limitaciones de esta investigación',
      content: `${limitations}\n\n**Nivel de confianza general: ${Math.round(result.confidence * 100)}%**\n\nAntes de publicar:\n1. Abre y revisa las URLs clave\n2. Confirma precios y horarios actuales\n3. Comprueba disponibilidad de tours y servicios\n4. Contrasta los datos importantes con fuentes oficiales`,
      order: 7,
    },
  ]
  
  const wordCount = sections.reduce((acc, s) => acc + s.content.split(/\s+/).length, 0)
  
  return {
    id: generateId(),
    researchResultId: result.id,
    title: `${destination.region}, ${destination.country} — Borrador preliminar [REQUIERE REVISIÓN]`,
    introduction: hasWebSources
      ? `${summary}\n\n**AVISO DE EDITOR**: Este borrador se generó a partir de resultados de búsqueda web (título, URL y snippet). Requiere abrir y verificar las fuentes antes de publicar.`
      : `${summary}\n\n**AVISO DE EDITOR**: Este borrador se generó sin búsqueda web real. Requiere verificación antes de su uso editorial.`,
    sections,
    tone: 'informative', // Más informativo que entusiasta
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
    const factory = getProviderFactory()
    return factory.getAvailableProviders().length > 0
  } catch {
    return false
  }
}

async function researchWithCompactWebBundle(
  researchId: string,
  input: ResearchInput,
  webResearchBundle: WebResearchBundle
): Promise<ResearchWithAIResult> {
  console.log('[Research] compacting web bundle')
  const compactSources = compactWebBundleSources(webResearchBundle.results)
  console.log('[Research] compacted web results:', compactSources.length)

  if (compactSources.length === 0) {
    throw new Error('No hay fuentes web reales suficientes para enviar a Kimi')
  }

  const prompt = buildCompactWebStructuredPrompt(input, compactSources)
  console.log('[Research] compact prompt length:', prompt.length)
  console.log('[Research] sending compact bundle to Kimi')

  const { result: structuredData, provider, cost, logId } = await generateText(prompt, {
    strategy: 'kimi',
    trackUsage: true,
  })

  let parsedData: Record<string, unknown>
  try {
    const cleanJson = structuredData
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim()
    parsedData = JSON.parse(cleanJson) as Record<string, unknown>
  } catch (error) {
    throw new Error(`Failed to parse compact web bundle response: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }

  const result: ResearchResult = {
    id: generateId(),
    researchId,
    destination: {
      country: (parsedData.destination as { country?: string })?.country || input.country,
      region: (parsedData.destination as { region?: string })?.region || input.region || input.country,
      description: (parsedData.destination as { description?: string })?.description || `Destino en ${input.country}`,
    },
    summary: (parsedData.summary as string) || `Investigación con fuentes web sobre ${input.region || input.country}`,
    places: ((parsedData.places as Record<string, unknown>[]) || []).map((p) => {
      const sourceRefs = Array.isArray(p.sourceRefs) ? (p.sourceRefs as string[]) : []
      const verificationNeeded = (p.verificationNeeded as string) || undefined

      return {
        id: generateId(),
        name: (p.name as string) || 'Elemento detectado en fuentes',
        category: (p.category as Place['category']) || 'other',
        description: (p.description as string) || '',
        whyVisit: (p.whyVisit as string) || '',
        bestFor: sourceRefs.length > 0 ? `Fuentes: ${sourceRefs.join(', ')}` : undefined,
        practicalInfo: verificationNeeded,
      }
    }),
    activities: ((parsedData.activities as Record<string, unknown>[]) || []).map((a) => {
      const sourceRefs = Array.isArray(a.sourceRefs) ? (a.sourceRefs as string[]) : []

      return {
        id: generateId(),
        name: (a.name as string) || 'Tema detectado en fuentes',
        description: (a.description as string) || '',
        category: (a.category as Activity['category']) || 'other',
        idealFor: sourceRefs.length > 0 ? `Fuentes: ${sourceRefs.join(', ')}` : undefined,
      }
    }),
    tips: ((parsedData.tips as string[]) || []).filter(t =>
      !t.toLowerCase().includes('aprender frases básicas') &&
      !t.toLowerCase().includes('respeta las normas') &&
      !t.toLowerCase().includes('disfruta de')
    ),
    sources: buildSourcesFromCompactSources(compactSources),
    confidence: Math.min((parsedData.confidence as number) ?? 0.65, 0.75),
    generatedAt: new Date(),
  }

  const draft = generateHonestEditorialDraft(result, parsedData, JSON.stringify(compactSources))

  console.log('🤖 [researchWithAI] Compact web result built:', {
    id: result.id,
    confidence: result.confidence,
    placesCount: result.places.length,
    sourcesCount: result.sources.length,
    sourcesTitles: result.sources.map(s => s.title),
  })

  return {
    result,
    draft,
    logId,
    provider,
    cost,
  }
}

function formatCompactSourcesForPrompt(sources: CompactWebSource[]): string {
  return sources
    .map(source => `[${source.ref}]
Title: ${source.title}
URL: ${source.url}
Snippet: ${source.snippet || '[sin snippet]'}
ReliabilityScore: ${source.reliabilityScore}
Provider: ${source.provider}`)
    .join('\n\n')
}

function compactWebBundleSources(results: WebSearchResult[]): CompactWebSource[] {
  const seen = new Set<string>()

  return [...results]
    .sort((a, b) => b.reliabilityScore - a.reliabilityScore)
    .filter(result => {
      if (seen.has(result.url)) return false
      seen.add(result.url)
      return true
    })
    .slice(0, 6)
    .map((result, index) => ({
      ref: `F${index + 1}`,
      title: result.title,
      url: result.url,
      snippet: truncateText(result.snippet || '', 300),
      provider: result.provider,
      reliabilityScore: result.reliabilityScore,
      sourceType: result.sourceType,
      capturedAt: result.capturedAt,
    }))
}

function buildSourcesFromCompactSources(sources: CompactWebSource[]): Source[] {
  return sources.map(result => ({
    id: generateId(),
    url: result.url,
    title: `${result.ref} - ${result.title}`,
    type: mapWebSourceType(result.sourceType),
    reliability: result.reliabilityScore,
    accessedAt: result.capturedAt,
  }))
}

function truncateText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) {
    return normalized
  }

  return `${normalized.slice(0, maxLength - 3).trim()}...`
}

function mapWebSourceType(sourceType: WebSourceType): Source['type'] {
  switch (sourceType) {
    case 'official':
      return 'official'
    case 'blog':
      return 'blog'
    case 'review':
    case 'forum':
    case 'social':
      return 'review'
    case 'news':
      return 'guide'
    case 'unknown':
    default:
      return 'other'
  }
}
