import { z } from 'zod'
import {
  OpenAIRoundAnalysisOutputSchema,
  type OpenAIRoundAnalysisOutput,
} from '@shared/openai-intelligence-contracts'

/**
 * Contrato de transporte reducido para Responses de DeepSeek.
 *
 * Conserva todos los bloques editoriales obligatorios, pero no proyecta al
 * proveedor los 132 campos del contrato canónico. La validación semántica y
 * de forma sigue ocurriendo inmediatamente después contra el schema canónico.
 */
export const DeepSeekRoundAnalysisEnvelopeSchema = z.object({
  canonicalJson: z.string(),
}).strict()

export type DeepSeekRoundAnalysisEnvelope = z.infer<typeof DeepSeekRoundAnalysisEnvelopeSchema>

/** Instrucción compacta que sustituye el detalle del JSON Schema remoto. */
export const DEEPSEEK_ANALYSIS_ENVELOPE_INSTRUCTION = [
  'Devuelve un único campo canonicalJson: su valor es texto JSON serializado, sin Markdown, con los bloques claims, contradictions, coverage, profileCoverage, gaps, proposedQueries y decision.',
  'Dentro de cada bloque usa el contrato editorial completo: claims con id/topic/statement/evidenceIds/confidence/suitableProfiles;',
  'coverage con score/sufficient/topics; profileCoverage debe incluir los requisitos propios de adventure o student;',
  'gaps y proposedQueries deben conservar todos sus campos; decision debe respetar su variante y queries.',
  'No inventes evidencia, ids, rutas, costes, horarios ni campos para completar el formato.',
].join(' ')

/**
 * Ensamblado sin defaults: cada valor procede literalmente del envelope. Un
 * campo ausente, extra o semánticamente inválido deja de ser válido aquí.
 */
export function canonicalAnalysisFromDeepSeekEnvelope(
  candidate: unknown,
): z.SafeParseReturnType<unknown, OpenAIRoundAnalysisOutput> {
  return parseDeepSeekCanonicalJson(candidate, OpenAIRoundAnalysisOutputSchema)
}

/** Reutilizable en sondas: envelope estricto, JSON interior y schema local. */
export function parseDeepSeekCanonicalJson<T>(
  candidate: unknown,
  schema: z.ZodType<T>,
): z.SafeParseReturnType<unknown, T> {
  const envelope = DeepSeekRoundAnalysisEnvelopeSchema.safeParse(candidate)
  if (!envelope.success) return envelope as z.SafeParseError<unknown>
  try {
    return schema.safeParse(JSON.parse(envelope.data.canonicalJson))
  } catch {
    return schema.safeParse(undefined)
  }
}
