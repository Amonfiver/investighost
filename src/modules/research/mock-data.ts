/**
 * Investighost - Datos Mock para Simulación
 * 
 * Propósito: Generar datos de investigación simulados coherentes
 * Alcance: Solo para demo interna, se reemplazará por investigación real
 * Estado: SIMULACIÓN TEMPORAL - documentado para reemplazo futuro
 */

import type { 
  ResearchResult, 
  Place, 
  Activity, 
  Source, 
  ResearchInput 
} from '@shared/types'
import { generateId } from '@utils/helpers'

// ============================================
// Generadores de datos mock coherentes
// ============================================

export function generateMockResult(
  researchId: string,
  input: ResearchInput
): ResearchResult {
  const region = input.region || input.country
  const destination = `${region}, ${input.country}`
  
  return {
    id: generateId(),
    researchId,
    destination: {
      country: input.country,
      region: region,
      description: generateDescription(destination, input.focus),
    },
    summary: generateSummary(destination, input.focus),
    places: generatePlaces(destination, input.focus),
    activities: generateActivities(destination, input.focus),
    tips: generateTips(destination),
    sources: generateSources(),
    confidence: 0.75 + Math.random() * 0.2, // 0.75 - 0.95
    generatedAt: new Date(),
  }
}

function generateDescription(destination: string, focus?: string): string {
  const focusText = focus ? `con enfoque en ${focus}` : 'con un encanto único'
  return `${destination} es un destino fascinante ${focusText}. ` +
    `Ofrece una combinación perfecta de cultura, gastronomía y experiencias memorables ` +
    `para todo tipo de viajeros.`
}

function generateSummary(destination: string, focus?: string): string {
  const focusText = focus ? `destacando en ${focus}` : 'ofreciendo experiencias únicas'
  return `${destination} se presenta como un destino imperdible, ${focusText}. ` +
    `Su atmósfera especial, combinada con opciones para todos los gustos, ` +
    `lo convierte en una elección excelente para una escapada memorable.`
}

function generatePlaces(destination: string, focus?: string): Place[] {
  const basePlaces: Omit<Place, 'id'>[] = [
    {
      name: `Centro Histórico de ${destination.split(',')[0]}`,
      category: 'landmark',
      description: 'El corazón de la ciudad, donde la historia cobra vida en cada rincón.',
      whyVisit: 'Para sumergirse en la auténtica esencia del lugar y su patrimonio cultural.',
      bestFor: 'Viajeros curiosos y amantes de la historia',
      estimatedTime: '2-3 horas',
      practicalInfo: 'Acceso libre. Mejor visitar por la mañana temprano.',
    },
    {
      name: `Mirador Panorámico`,
      category: 'viewpoint',
      description: 'Vistas espectaculares de toda la ciudad y sus alrededores.',
      whyVisit: 'El atardecer desde aquí es una experiencia inolvidable.',
      bestFor: 'Fotógrafos y románticos',
      estimatedTime: '1 hora',
      practicalInfo: 'Llevar agua y protección solar.',
    },
    {
      name: 'Mercado Local Tradicional',
      category: 'market',
      description: 'El pulso de la vida cotidiana, aromas, colores y sabores locales.',
      whyVisit: 'Para experimentar la auténtica gastronomía y artesanía local.',
      bestFor: 'Foodies y buscadores de souvenirs únicos',
      estimatedTime: '2 horas',
      practicalInfo: 'Abierto de martes a domingo. Llevar efectivo.',
    },
  ]

  // Añadir lugares específicos según el focus
  if (focus?.toLowerCase().includes('gastronomía') || focus?.toLowerCase().includes('comida')) {
    basePlaces.push({
      name: 'Restaurante Estrella Local',
      category: 'neighborhood',
      description: 'El lugar favorito de los locales para degustar platos tradicionales.',
      whyVisit: 'La comida aquí representa lo mejor de la cocina regional.',
      bestFor: 'Amantes de la gastronomía auténtica',
      estimatedTime: '2 horas',
      practicalInfo: 'Reservar con anticipación. Menú del día excelente relación calidad-precio.',
    })
  }

  if (focus?.toLowerCase().includes('cultura') || focus?.toLowerCase().includes('arte')) {
    basePlaces.push({
      name: 'Museo de Arte Regional',
      category: 'museum',
      description: 'Colección impresionante de arte local e historia.',
      whyVisit: 'Para comprender mejor el contexto cultural del destino.',
      bestFor: 'Amantes del arte y la cultura',
      estimatedTime: '2-3 horas',
      practicalInfo: 'Entrada gratuita los domingos. Audio-guía disponible.',
    })
  }

  return basePlaces.map(p => ({ ...p, id: generateId() }))
}

function generateActivities(_destination: string, focus?: string): Activity[] {
  const baseActivities: Omit<Activity, 'id'>[] = [
    {
      name: 'Tour a pie por el centro histórico',
      description: 'Recorrido guiado descubriendo los secretos y anécdotas del lugar.',
      category: 'tour',
      idealFor: 'Primerizos y curiosos',
      duration: '3 horas',
    },
    {
      name: 'Experiencia gastronómica local',
      description: 'Degustación de productos típicos en establecimientos seleccionados.',
      category: 'food',
      idealFor: 'Foodies y aventureros culinarios',
      duration: '4 horas',
    },
    {
      name: 'Paseo en bicicleta por la orilla',
      description: 'Ruta escénica para disfrutar del paisaje a ritmo relajado.',
      category: 'experience',
      idealFor: 'Familias y viajeros activos',
      duration: '2 horas',
    },
  ]

  if (focus?.toLowerCase().includes('relax') || focus?.toLowerCase().includes('tranquilidad')) {
    baseActivities.push({
      name: 'Día de relax en spa local',
      description: 'Tratamientos tradicionales en un entorno único.',
      category: 'relax',
      idealFor: 'Viajeros buscando desconexión',
      duration: 'Día completo',
    })
  }

  return baseActivities.map(a => ({ ...a, id: generateId() }))
}

function generateTips(dest: string): string[] {
  // Uso de dest para evitar error de variable no usada
  const place = dest.split(',')[0]
  void dest // Marcar como usado intencionalmente
  return [
    `La mejor época para visitar ${place} es primavera u otoño, cuando el clima es ideal.`,
    'Reservar alojamiento con anticipación, especialmente en temporada alta.',
    'Probar los platos del mercado local, son auténticos y económicos.',
    'Llevar calzado cómodo para caminar por las calles empedradas.',
    'Aprender algunas frases básicas en el idioma local, se valora mucho el esfuerzo.',
  ]
}

function generateSources(): Source[] {
  return [
    {
      id: generateId(),
      url: 'https://example-travel-guide.com/destinations',
      title: 'Guía Oficial de Turismo',
      type: 'official',
      reliability: 0.9,
      accessedAt: new Date(),
    },
    {
      id: generateId(),
      url: 'https://travel-blog-example.com/local-guide',
      title: 'Experiencias de un viajero local',
      type: 'blog',
      reliability: 0.7,
      accessedAt: new Date(),
    },
    {
      id: generateId(),
      url: 'https://reviews-example.com/restaurants',
      title: 'Opiniones de restaurantes locales',
      type: 'review',
      reliability: 0.8,
      accessedAt: new Date(),
    },
  ]
}