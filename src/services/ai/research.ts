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

const buildWebBundleResearchPrompt = (
  input: ResearchInput,
  webResearchBundle: WebResearchBundle
): string => {
  const { country, region, focus, userNotes } = input
  const location = region ? `${region}, ${country}` : country
  const focusText = focus ? ` con enfoque en ${focus}` : ''
  const notesText = userNotes ? `\n\nNotas adicionales del usuario: ${userNotes}` : ''

  return `Eres un analista editorial de viajes para Trawel. Tu trabajo es analizar material recopilado de busqueda web sobre "${location}"${focusText}.

REGLAS ESTRICTAS:
1. Usa SOLO la informacion incluida en el MATERIAL WEB RECOPILADO.
2. NO uses conocimiento externo del modelo para completar datos.
3. NO inventes lugares, fuentes, URLs, horarios, precios, restaurantes ni opiniones.
4. Si un dato no aparece en las fuentes, marca "[pendiente de verificar]".
5. Diferencia claramente "confirmado por fuente", "senal encontrada en fuente" y "pendiente de verificar".
6. No conviertas snippets de opiniones en hechos universales.
7. Evita frases genericas como "combinacion perfecta", "experiencias memorables" o "cautiva los sentidos".
8. Mantén una confianza prudente: hay busqueda web, pero NO se han abierto ni scrapeado paginas completas.

MATERIAL WEB RECOPILADO:
${formatWebSourcesForPrompt(webResearchBundle)}

ESTRUCTURA DE RESPUESTA:

1. RESUMEN EDITORIAL
   - 2-3 frases basadas solo en las fuentes.

2. HECHOS Y SENALES CONFIRMADAS
   - Lista de datos o lugares que aparecen en fuentes.
   - Incluye entre parentesis el numero de fuente: [F1], [F2], etc.

3. LUGARES / TEMAS RELEVANTES
   Para cada elemento:
   - Nombre especifico
   - Que dice la fuente
   - Por que puede ser util editorialmente
   - Fuente(s)
   - Nivel de confianza: alto/medio/bajo

4. OPINIONES / SENALES DE VIAJEROS
   - Solo si aparecen en snippets de reseñas, blogs o foros.
   - Marcarlas como señales, no como hechos.

5. IDEAS DE ENFOQUE PARA ARTICULO
   - 3-4 angulos editoriales derivados de las fuentes.

6. ELEMENTOS PENDIENTES DE VERIFICAR
   - Horarios, precios, accesos, disponibilidad, eventos actuales.
   - Cualquier dato que requiera abrir paginas completas o fuente oficial.

7. LIMITACIONES
   - Esta investigacion usa resultados de busqueda: titulo, URL y snippet.
   - No incluye scraping ni lectura completa de paginas.
   - Antes de publicar, revisar las URLs clave.${notesText}

Responde en español con criterio editorial prudente.`
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

const buildWebStructuredPrompt = (
  input: ResearchInput,
  researchText: string,
  webResearchBundle: WebResearchBundle
): string => {
  const { country, region } = input
  const location = region ? `${region}, ${country}` : country

  return `Basandote SOLO en esta investigacion y en las fuentes listadas sobre "${location}":
"""
${researchText}
"""

FUENTES WEB DISPONIBLES:
${formatWebSourcesForPrompt(webResearchBundle)}

Genera un objeto JSON con la siguiente estructura EXACTA. No inventes datos que no esten soportados por las fuentes.

{
  "destination": {
    "country": "${country}",
    "region": "${region || country}",
    "description": "descripcion especifica basada en fuentes, sin adjetivos vacios"
  },
  "summary": "resumen honesto de por que puede interesar, maximo 2 frases",
  "places": [
    {
      "name": "nombre especifico mencionado o respaldado por fuente",
      "category": "landmark|neighborhood|museum|viewpoint|beach|park|market|other",
      "description": "descripcion factual basada en fuentes",
      "whyVisit": "razon concreta basada en fuentes",
      "confidenceLevel": "high|medium|low",
      "verificationNeeded": "que falta verificar antes de publicar, o null",
      "sourceRefs": ["F1", "F2"]
    }
  ],
  "activities": [
    {
      "name": "actividad o tema respaldado por fuente",
      "description": "descripcion sin relleno",
      "category": "experience|tour|food|nightlife|shopping|relax|other",
      "confidenceLevel": "high|medium|low",
      "sourceRefs": ["F1"]
    }
  ],
  "tips": ["consejo practico derivado de fuentes o marcado pendiente de verificar"],
  "pendingVerification": [
    "horarios actuales",
    "precios actuales",
    "accesos/aparcamiento",
    "datos que requieren abrir fuente completa"
  ],
  "articleAngles": [
    "angulo editorial derivado de fuentes"
  ],
  "limitations": "Esta investigacion se basa en resultados de busqueda (titulo, URL y snippet). No se han abierto paginas completas.",
  "confidence": 0.65
}

REGLAS CRITICAS:
1. confidence: usa 0.5-0.75. NUNCA uses 0.9+.
2. NO inventes URLs ni fuentes: las fuentes reales ya estan listadas.
3. Si algo no esta respaldado por fuente, omitelo o marca pendiente.
4. Evita frases genericas y promocionales.
5. Devuelve SOLO JSON valido, sin markdown.`
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
  
  // 1. Generar investigación textual
  const researchPrompt = webResearchBundle
    ? buildWebBundleResearchPrompt(input, webResearchBundle)
    : buildResearchPrompt(input)
  console.log('🤖 [researchWithAI] Prompt 1 length:', researchPrompt.length)
  
  const { result: researchText, cost, logId } = await generateText(researchPrompt, {
    strategy: 'kimi',
    trackUsage: true,
  })
  
  console.log('🤖 [researchWithAI] Step 1 complete. Research text length:', researchText.length)
  console.log('🤖 [researchWithAI] Step 1 preview:', researchText.substring(0, 200) + '...')
  
  // 2. Generar datos estructurados
  const structuredPrompt = webResearchBundle
    ? buildWebStructuredPrompt(input, researchText, webResearchBundle)
    : buildStructuredPrompt(input, researchText)
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
    sources: webResearchBundle
      ? buildSourcesFromWebBundle(webResearchBundle)
      : [{
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
      heading: 'Lugares destacados (verificados)',
      content: highConfidencePlaces.length > 0 
        ? highConfidencePlaces.map(p => 
            `**${p.name}** (${p.category})\n${p.description}\n${p.whyVisit ? `Por qué visitarlo: ${p.whyVisit}` : ''}`
          ).join('\n\n')
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
      content: `${limitations}\n\n**Nivel de confianza general: ${Math.round(result.confidence * 100)}%**\n\nEsta investigación NO reemplaza la verificación web. Antes de publicar:\n1. Verifica nombres de lugares en fuentes oficiales\n2. Confirma precios y horarios actuales\n3. Comprueba disponibilidad de tours y servicios\n4. Añade fuentes reales consultadas`,
      order: 7,
    },
  ]
  
  const wordCount = sections.reduce((acc, s) => acc + s.content.split(/\s+/).length, 0)
  
  return {
    id: generateId(),
    researchResultId: result.id,
    title: `${destination.region}, ${destination.country} — Borrador preliminar [REQUIERE REVISIÓN]`,
    introduction: `${summary}\n\n⚠️ **AVISO DE EDITOR**: Este borrador se generó sin búsqueda web real. Requiere verificación antes de su uso editorial.`,
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

function formatWebSourcesForPrompt(webResearchBundle: WebResearchBundle): string {
  return selectPromptSources(webResearchBundle.results)
    .map((source, index) => {
      const ref = `F${index + 1}`
      return `[${ref}]
Title: ${source.title}
URL: ${source.url}
Snippet: ${source.snippet || '[sin snippet]'}
ReliabilityScore: ${source.reliabilityScore}
Provider: ${source.provider}`
    })
    .join('\n\n')
}

function selectPromptSources(results: WebSearchResult[]): WebSearchResult[] {
  const seen = new Set<string>()

  return [...results]
    .sort((a, b) => b.reliabilityScore - a.reliabilityScore)
    .filter(result => {
      if (seen.has(result.url)) return false
      seen.add(result.url)
      return true
    })
    .slice(0, 14)
}

function buildSourcesFromWebBundle(webResearchBundle: WebResearchBundle): Source[] {
  return selectPromptSources(webResearchBundle.results).map(result => ({
    id: generateId(),
    url: result.url,
    title: result.title,
    type: mapWebSourceType(result.sourceType),
    reliability: result.reliabilityScore,
    accessedAt: result.capturedAt,
  }))
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
