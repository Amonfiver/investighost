import { describe, expect, it } from 'vitest'
import { zodTextFormat } from 'openai/helpers/zod'
import { z } from 'zod'
import { inspectOpenAIEditorialResponseContracts } from '@modules/real-pipeline'
import {
  inspectOpenAIResponseRequest,
  type OpenAIResponseRequest,
} from '@modules/real-pipeline/openai-responses-payload'
import { OpenAIRoundAnalysisOutputSchema } from '@shared/openai-intelligence-contracts'
import {
  REAL_EDITORIAL_OPENAI_MODEL,
  REAL_EDITORIAL_PILOT_POLICY,
} from '@shared/real-editorial-pilot-contracts'

function validRequest(): OpenAIResponseRequest {
  const format = zodTextFormat(OpenAIRoundAnalysisOutputSchema, 'round_analysis')
  return {
    model: REAL_EDITORIAL_OPENAI_MODEL.apiId,
    input: [
      { role: 'system', content: 'Solo contrato local.' },
      { role: 'user', content: '{"operation":"round_analysis"}' },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: format.name,
        strict: true,
        schema: format.schema as Record<string, unknown>,
      },
    },
    max_output_tokens: 12_000,
    store: false,
  }
}

describe('contrato local de OpenAI Responses', () => {
  it('acepta el payload editorial real y sus tres esquemas sin enviar red', () => {
    expect(inspectOpenAIResponseRequest(validRequest())).toEqual({
      valid: true,
      issues: [],
    })
    expect(inspectOpenAIEditorialResponseContracts(
      REAL_EDITORIAL_PILOT_POLICY.providers.model,
    )).toMatchObject({
      valid: true,
      operations: [
        { operation: 'round_analysis', valid: true, issues: [] },
        { operation: 'draft', valid: true, issues: [] },
        { operation: 'final_review', valid: true, issues: [] },
      ],
    })
  })

  it('reproduce el objeto dinámico rechazado y localiza el campo exacto', () => {
    const request = validRequest()
    const legacyProfileCoverage = z.object({
      profile: z.enum(['adventure', 'student']),
      score: z.number().min(0).max(1),
      sufficient: z.boolean(),
      requirements: z.record(z.number().min(0).max(1)),
      warnings: z.array(z.string()),
    })
    const legacyFormat = zodTextFormat(
      OpenAIRoundAnalysisOutputSchema.extend({
        profileCoverage: z.array(legacyProfileCoverage).min(1).max(2),
      }),
      'round_analysis',
    )
    request.text.format.schema = legacyFormat.schema as Record<string, unknown>

    expect(inspectOpenAIResponseRequest(request)).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([
        expect.objectContaining({
          path: '$.text.format.schema.properties.profileCoverage.items'
            + '.properties.requirements.additionalProperties',
          code: 'unsupported_schema',
        }),
      ]),
    })
  })

  it('rechaza input mal formado antes del cliente', () => {
    const request = {
      ...validRequest(),
      input: [{ role: 'assistant', content: '' }],
    }

    expect(inspectOpenAIResponseRequest(request)).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ path: '$.input[0].role', code: 'invalid_input' }),
        expect.objectContaining({ path: '$.input[0].content', code: 'invalid_input' }),
      ]),
    })
  })

  it('bloquea parámetros incompatibles en vez de añadir fallback', () => {
    const request = {
      ...validRequest(),
      response_format: { type: 'json_object' },
    }

    expect(inspectOpenAIResponseRequest(request)).toMatchObject({
      valid: false,
      issues: [
        expect.objectContaining({
          path: '$.response_format',
          code: 'unsupported_parameter',
        }),
      ],
    })
  })

  it('separa nombre visible e identificador API sin cambiar el modelo', () => {
    expect(REAL_EDITORIAL_OPENAI_MODEL.displayName).toBe('GPT-5.6 Luna')
    expect(REAL_EDITORIAL_OPENAI_MODEL.apiId).toBe('gpt-5.6-luna')
    expect(REAL_EDITORIAL_OPENAI_MODEL.displayName)
      .not.toBe(REAL_EDITORIAL_OPENAI_MODEL.apiId)
    expect(validRequest().model).toBe(REAL_EDITORIAL_PILOT_POLICY.providers.model)
  })
})
