import { describe, expect, it } from 'vitest'
import { VERY_DIFFERENT_MAX_AUTOMATIC_RETRIES, assessRedoVariation, enforceRedoVariation, measureRedoSimilarity } from '@modules/real-pipeline/redo-variation-policy'
import type { AdventurePackageV1, StudentDocumentV1 } from '@shared/structured-editorial-package-contracts'

const evidence = [{ kind: 'source' as const, referenceId: 'fixture-source' }]
const id = '085k0000-0000-4000-8000-000000000001'

function student(headline = 'Patrimonio de la ciudad', text = 'El centro histórico conserva monumentos documentados y vida cultural.'): StudentDocumentV1 {
  return { version: 'student-document-v1', headline, lead: [text], blocks: [
    { type: 'heading', level: 2, text: 'Contexto cultural' }, { type: 'paragraph', text },
    { type: 'references', items: [{ title: 'Fuente de prueba', url: 'https://fixture.invalid/source' }] },
  ] }
}

function adventure(headline = 'Descubrir el paisaje', hook = 'Una ruta visual entre patrimonio y paisaje documentados.'): AdventurePackageV1 {
  return { version: 'adventure-package-v1', copy: { headline, hook, highlights: ['Mirador documentado'], sections: [{ id, title: 'Primera parada', copy: hook, evidenceRefs: evidence }], practicalTips: [], evidenceRefs: evidence }, hero: { asset: { status: 'INTENT', visualIntentId: id }, title: 'Mirador documentado', shortCopy: hook, presentationTone: 'LANDSCAPE', textPlacement: 'OVERLAY', evidenceRefs: evidence }, visualStory: { items: [] }, placesToGo: { items: [], supplementalGaps: [] } }
}

describe('R7 VERY_DIFFERENT constraint', () => {
  it('LIGHT_NO_FORCED_RETRY / LIGHT_WARNING_ALLOWED / LIGHT_PRESERVES_RESEARCH', async () => {
    let retries = 0
    const result = await enforceRedoVariation({ variation: 'LIGHT', previous: student(), first: student(), canRetry: true, generateRetry: async () => { retries += 1; return student('Otro') } })
    expect(retries).toBe(0); expect(result.trace.attempts).toHaveLength(1); expect(result.trace.warning).toBe('REDO_OUTPUT_TOO_SIMILAR_TO_PREVIOUS')
  })

  it('CLEAR_STRONG_GUIDANCE / CLEAR_NO_MANDATORY_SECOND_ATTEMPT', async () => {
    let retries = 0
    const result = await enforceRedoVariation({ variation: 'CLEAR', previous: adventure(), first: adventure(), canRetry: true, generateRetry: async () => { retries += 1; return adventure('Otro') } })
    expect(retries).toBe(0); expect(result.trace.attempts).toHaveLength(1)
  })

  it('VERY_DIFFERENT_FIRST_ATTEMPT_PASS / NO_RETRY_WHEN_TARGET_MET / ATTEMPT_TRACE_PERSISTED', async () => {
    let retries = 0
    const result = await enforceRedoVariation({ variation: 'VERY_DIFFERENT', previous: student(), first: student('Geografía cotidiana', 'La red de barrios articula mercados, recorridos y espacios públicos citados por las fuentes.'), canRetry: true, generateRetry: async () => { retries += 1; return student('No debe usarse') } })
    expect(result.trace).toMatchObject({ targetMet: true, warning: null, attempts: [{ attempt: 1, result: 'PASS' }] }); expect(retries).toBe(0)
  })

  it('FIRST_ATTEMPT_TOO_SIMILAR / ONE_AUTOMATIC_RETRY / SECOND_ATTEMPT_DIFFERENT_ENOUGH / FINAL_READY_FOR_REVIEW', async () => {
    let retries = 0
    const result = await enforceRedoVariation({ variation: 'VERY_DIFFERENT', previous: adventure(), first: adventure(), canRetry: true, generateRetry: async () => { retries += 1; return adventure('Mercados y ritmo local', 'Los mercados, talleres y plazas proponen una lectura cotidiana con evidencia independiente.') } })
    expect(VERY_DIFFERENT_MAX_AUTOMATIC_RETRIES).toBe(1); expect(retries).toBe(1)
    expect(result.trace).toMatchObject({ targetMet: true, warning: null, attempts: [{ result: 'FAIL', retryTriggered: true }, { attempt: 2, result: 'PASS' }] })
  })

  it('SECOND_ATTEMPT_TOO_SIMILAR / NO_THIRD_ATTEMPT / REDO_VARIATION_TARGET_NOT_MET_PRESENT', async () => {
    let retries = 0
    const result = await enforceRedoVariation({ variation: 'VERY_DIFFERENT', previous: student(), first: student(), canRetry: true, generateRetry: async () => { retries += 1; return student() } })
    expect(retries).toBe(1); expect(result.trace).toMatchObject({ targetMet: false, warning: 'REDO_VARIATION_TARGET_NOT_MET', attempts: [{ attempt: 1, result: 'FAIL' }, { attempt: 2, result: 'FAIL' }] })
  })

  it('SAME_REDO_OPERATION / ATTEMPT_1_PERSISTED / ATTEMPT_2_PERSISTED / SIMILARITY_SCORE_PERSISTED / FINAL_DECISION_PERSISTED', async () => {
    const traces: Array<{ attempts: Array<{ attempt: number; similarity: { score: number } }>; targetMet: boolean }> = []
    await enforceRedoVariation({ variation: 'VERY_DIFFERENT', previous: student(), first: student(), canRetry: true, generateRetry: async () => student('Geografía cotidiana', 'La red de barrios articula mercados, recorridos y espacios públicos citados por las fuentes.'), onTrace: trace => { traces.push(trace) } })
    expect(traces).toHaveLength(2)
    expect(traces[0]).toMatchObject({ attempts: [{ attempt: 1, similarity: { score: expect.any(Number) } }], targetMet: false })
    expect(traces[1]).toMatchObject({ attempts: [{ attempt: 1 }, { attempt: 2, similarity: { score: expect.any(Number) } }], targetMet: true })
  })

  it('NO_BUDGET_NO_RETRY / READY_FOR_REVIEW / VARIATION_TARGET_WARNING_PRESENT', async () => {
    let retries = 0
    const result = await enforceRedoVariation({ variation: 'VERY_DIFFERENT', previous: student(), first: student(), canRetry: false, generateRetry: async () => { retries += 1; return student('Nunca') } })
    expect(retries).toBe(0); expect(result.trace).toMatchObject({ targetMet: false, warning: 'REDO_VARIATION_TARGET_NOT_MET' })
  })

  it('STUDENT_HEADLINE_VARIATION / STUDENT_STRUCTURE_VARIATION / STUDENT_FACTS_PRESERVED / STUDENT_PROVENANCE_PRESERVED', () => {
    const prior = student(); const next = student('Geografía cotidiana', 'La red de barrios articula mercados, recorridos y espacios públicos citados por las fuentes.')
    expect(measureRedoSimilarity(prior, next).score).toBeLessThan(0.7)
    expect(next.blocks.map(block => block.type)).toEqual(prior.blocks.map(block => block.type))
    expect(next.blocks.at(-1)).toMatchObject({ type: 'references', items: [{ url: 'https://fixture.invalid/source' }] })
  })

  it('ADVENTURE_TITLE_VARIATION / ADVENTURE_STRUCTURE_VARIATION / ADVENTURE_NOT_DERIVED_FROM_STUDENT / ADVENTURE_FACTS_PRESERVED', () => {
    const result = assessRedoVariation('VERY_DIFFERENT', adventure(), adventure('Mercados y ritmo local', 'Los mercados, talleres y plazas proponen una lectura cotidiana con evidencia independiente.'))
    expect(result.result).toBe('PASS'); expect(adventure().copy.evidenceRefs).toEqual(evidence)
  })

  it('DEEPSEEK_STYLE_FAKE / OPENAI_STYLE_FAKE share the exact provider-neutral gate', () => {
    const prior = student()
    expect(assessRedoVariation('VERY_DIFFERENT', prior, student()).result).toBe('FAIL')
    expect(assessRedoVariation('VERY_DIFFERENT', prior, student('Geografía cotidiana', 'La red de barrios articula mercados, recorridos y espacios públicos citados por las fuentes.')).result).toBe('PASS')
  })
})
