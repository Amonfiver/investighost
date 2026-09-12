import {
  ALBARRACIN_PACK_B_CANDIDATES,
  canonicalHeadingKinds,
} from './albarracin-pack-b'

export const ALBARRACIN_ADVENTURE_R2 = {
  libraryEntryId: '2311ae35-e677-4cf2-aa78-e7ebbb0b6180',
  versionId: '35989e10-074d-48f4-ba15-e072c1ef6ba8',
  parentRevisionId: '845cb368-a43e-451f-b298-ece34874b6c3',
  expectedOriginVersionHash: 'bc2230d4d11cd877fa465d88c30b28ea51cef047d0f63aa3050f7f23ca94a88e',
  taxonomy: ['intro', 'overview', 'highlights', 'route', 'practical', 'risks', 'sources'],
  changeSummary: 'Ajuste editorial mínimo de introducción, afluencia y preparación; pendiente de revisión humana.',
} as const

const introR1 = 'Albarracín combina patrimonio y una ruta breve junto al agua.'
const introR2 = 'Albarracín combina patrimonio histórico con recorridos vinculados al Guadalaviar.'
const practicalR1 = '- La documentación registra mayor afluencia en agosto, Semana Santa, puentes y fines de semana [c12].'
const practicalR2 = `${practicalR1}
- Una publicación de la Fundación atribuye más de 415.000 visitantes a 2024 [c13]. La cifra sirve como contexto de afluencia turística, pero no debe compararse directamente con series históricas no equivalentes [c13].`
const risksR1 = 'El paseo fluvial requiere atención por sus cambios de superficie, escaleras, pasarelas y puentes [c6]. La evidencia incorporada recomienda calzado adecuado y agua porque no hay fuentes; también indica que no es apto para carritos de bebé ni para personas con movilidad reducida y que puede resultar incómodo para personas con vértigo [c7].'
const risksR2 = 'El paseo fluvial combina cambios de superficie, escaleras, pasarelas y puentes [c6]. Lleva calzado adecuado y agua porque no hay fuentes; no es apto para carritos de bebé ni para personas con movilidad reducida y puede resultar incómodo para personas con vértigo [c7].'

export const ADVENTURE_R2_EVIDENCE_AUDIT = [
  {
    text: introR2,
    classification: 'EDITORIAL_ONLY',
  },
  {
    text: 'Una publicación de la Fundación atribuye más de 415.000 visitantes a 2024 [c13].',
    classification: 'SUPPORTED',
  },
  {
    text: 'La cifra sirve como contexto de afluencia turística, pero no debe compararse directamente con series históricas no equivalentes [c13].',
    classification: 'CONTRADICTION_DISCLOSED',
  },
  {
    text: risksR2,
    classification: 'LIMITED_EVIDENCE_DISCLOSED',
  },
] as const

export type AdventureR2EvidenceClassification =
  typeof ADVENTURE_R2_EVIDENCE_AUDIT[number]['classification']

export function refineAlbarracinAdventureR1ToR2(content: string): string {
  assertExactlyOnce(content, introR1)
  assertExactlyOnce(content, practicalR1)
  assertExactlyOnce(content, risksR1)
  const refined = content
    .replace(introR1, introR2)
    .replace(practicalR1, practicalR2)
    .replace(risksR1, risksR2)
  assertR2ChangesAreLimited(content, refined)
  return refined
}

export function adventureR2Content(): string {
  return refineAlbarracinAdventureR1ToR2(ALBARRACIN_PACK_B_CANDIDATES.adventure.content)
}

export function canonicalSections(content: string): Map<string, string> {
  const parts = content.split(/^## \[([a-z_]+)]\n/gm)
  const sections = new Map<string, string>()
  for (let index = 1; index < parts.length; index += 2) {
    sections.set(parts[index] ?? '', parts[index + 1] ?? '')
  }
  return sections
}

export function changedCanonicalSections(before: string, after: string): string[] {
  const beforeSections = canonicalSections(before)
  const afterSections = canonicalSections(after)
  const keys = [...new Set([...beforeSections.keys(), ...afterSections.keys()])]
  return keys.filter(key => beforeSections.get(key) !== afterSections.get(key))
}

export function assertR2ChangesAreLimited(before: string, after: string): void {
  const changed = changedCanonicalSections(before, after)
  if (JSON.stringify(changed) !== JSON.stringify(['intro', 'practical', 'risks'])) {
    throw new Error(`Adventure r2 contiene cambios fuera de los bloques autorizados: ${changed.join(', ')}`)
  }
  if (JSON.stringify(canonicalHeadingKinds(after)) !== JSON.stringify(ALBARRACIN_ADVENTURE_R2.taxonomy)) {
    throw new Error('Adventure r2 no conserva la taxonomía canónica completa')
  }
}

function assertExactlyOnce(content: string, text: string): void {
  const occurrences = content.split(text).length - 1
  if (occurrences !== 1) {
    throw new Error('Adventure r1 no coincide con el texto durable esperado para el ajuste mínimo')
  }
}
