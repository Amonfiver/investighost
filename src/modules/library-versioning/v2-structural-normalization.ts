export interface V2StructuralBoundary {
  kind: string
  marker: string
}

export class V2StructuralNormalizationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'V2StructuralNormalizationError'
  }
}

/**
 * Adds only V2 machine-readable section delimiters around contiguous portions
 * of an approved document. Every non-delimiter character remains in its
 * original order; semantic equivalence is verified independently below.
 */
export function normalizeApprovedContentForV2(
  content: string,
  boundaries: readonly V2StructuralBoundary[],
): string {
  const source = normalized(content)
  if (boundaries.length === 0) {
    throw new V2StructuralNormalizationError('Se requiere al menos un bloque V2')
  }
  if (new Set(boundaries.map(item => item.kind)).size !== boundaries.length) {
    throw new V2StructuralNormalizationError('Los bloques V2 deben ser únicos')
  }

  const starts = boundaries.map((boundary, index) => {
    const position = index === 0
      ? source.indexOf(boundary.marker)
      : source.indexOf(`\n\n${boundary.marker}\n`)
    if (position < 0 || (index === 0 && position !== 0)) {
      throw new V2StructuralNormalizationError(`No se encontró el marcador estructural ${boundary.kind}`)
    }
    return index === 0 ? position : position + 2
  })
  if (starts.some((position, index) => index > 0 && position <= starts[index - 1]!)) {
    throw new V2StructuralNormalizationError('Los marcadores estructurales no están ordenados')
  }

  const sections = boundaries.map((boundary, index) => {
    const end = starts[index + 1] ?? source.length
    const body = source.slice(starts[index], end).trim()
    if (!body) throw new V2StructuralNormalizationError(`El bloque ${boundary.kind} quedó vacío`)
    return `## [${boundary.kind}]\n${body}`
  })
  return `${sections.join('\n\n')}\n`
}

/** Removes only generated V2 delimiters and insignificant blank-line variance. */
export function semanticTextWithoutV2Delimiters(content: string): string {
  return normalized(content)
    .replace(/^## \[[a-z_]+]\n/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function assertV2StructuralSemanticEquivalence(before: string, after: string): void {
  if (semanticTextWithoutV2Delimiters(before) !== semanticTextWithoutV2Delimiters(after)) {
    throw new V2StructuralNormalizationError('La normalización V2 alteró el texto semántico')
  }
}

function normalized(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
}
