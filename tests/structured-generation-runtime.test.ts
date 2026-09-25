import { describe, expect, it } from 'vitest'
import {
  generateAdventurePackageV1,
  generateStudentDocumentV1,
  type StructuredGenerationTransport,
} from '@modules/real-pipeline/structured-generation-runtime'
import type { RealResearchDossier, RealMasterKnowledge } from '@shared/real-pipeline-contracts'

const ids = {
  destination: '085f0000-0000-4000-8000-000000000001', figure: '085f0000-0000-4000-8000-000000000002', hero: '085f0000-0000-4000-8000-000000000003',
  storyIntent: '085f0000-0000-4000-8000-000000000004', story: '085f0000-0000-4000-8000-000000000005', placeIntent: '085f0000-0000-4000-8000-000000000006', place: '085f0000-0000-4000-8000-000000000007', linked: '085f0000-0000-4000-8000-000000000008',
}
const evidence = [{ kind: 'source' as const, referenceId: 'source-1' }]
const masterKnowledge: RealMasterKnowledge = {
  requestId: 'request-1', destinationId: ids.destination, revision: 1, generatedAt: '2026-09-26T10:00:00.000Z', contradictions: [],
  claims: [{ id: 'claim-1', topic: 'heritage', statement: 'La ciudad conserva patrimonio y vida cultural.', evidenceIds: ['evidence-1'], confidence: 0.9, suitableProfiles: ['student', 'adventure'] }],
}
const dossier: RealResearchDossier = {
  requestId: 'request-1', runId: 'run-1', taskId: 'task-1', destinationId: ids.destination, rounds: [1], generatedAt: '2026-09-26T10:00:00.000Z',
  sources: [{ id: 'source-1', round: 1, url: 'https://fixture.invalid/source', normalizedUrl: 'https://fixture.invalid/source', title: 'Fuente pública', capturedAt: '2026-09-26T10:00:00.000Z', contentHash: 'a'.repeat(64), score: 0.9, content: 'Patrimonio, cultura, un mirador y un restaurante concreto.' }],
  evidence: [{ id: 'evidence-1', statement: 'La fuente documenta patrimonio y cultura.', sourceIds: ['source-1'], confidence: 0.9, contradiction: 'none', freshness: 'current' }],
}

class DeterministicStructuredTransport implements StructuredGenerationTransport {
  readonly payloads: Record<string, unknown>[] = []
  async generateStructured<T>(operation: 'generate_student_document_v1' | 'generate_adventure_package_v1', payload: Record<string, unknown>, schema: Parameters<StructuredGenerationTransport['generateStructured']>[2]): Promise<{ output: T; usage: { providerId: string; model: string; inputTokens: number; outputTokens: number; estimatedCost: number; currency: 'EUR' } }> {
    this.payloads.push(payload)
    const intent = (id: string, purpose: 'STUDENT_FIGURE' | 'ADVENTURE_HERO' | 'VISUAL_STORY' | 'PLACE_ASSET', type: 'STUDENT_BLOCK' | 'HERO' | 'VISUAL_STORY_ITEM' | 'PLACE', subject: string, linkedId = ids.linked) => ({
      id, purpose, subject, keywords: [subject, 'documentado'], context: 'Entidad del corpus común.', desiredRole: purpose === 'ADVENTURE_HERO' ? 'HERO' as const : purpose === 'STUDENT_FIGURE' ? 'FIGURE' as const : purpose === 'PLACE_ASSET' ? 'PLACE' as const : 'HIGHLIGHT' as const,
      desiredPlacement: purpose === 'STUDENT_FIGURE' ? 'WIDE' as const : 'OVERLAY' as const, linkedContent: { type, id: linkedId }, evidenceRefs: evidence,
    })
    const output = operation === 'generate_student_document_v1'
      ? { document: { version: 'student-document-v1' as const, headline: 'Ciudad documentada', lead: ['Entrada breve.'], blocks: [
        { type: 'heading' as const, level: 2 as const, text: 'Patrimonio' }, { type: 'paragraph' as const, text: 'La ciudad conserva patrimonio y vida cultural.' },
        { type: 'list' as const, style: 'unordered' as const, items: ['Patrimonio', 'Vida cultural'] }, { type: 'key_facts' as const, items: [{ label: 'Contexto', value: 'Evidencia común' }] },
        { type: 'timeline' as const, items: [{ label: 'Actualidad', text: 'El corpus describe patrimonio y cultura.' }] }, { type: 'figure' as const, resolution: 'INTENT' as const, visualIntentId: ids.figure, placement: 'WIDE' as const, altHint: 'Mirador documentado' },
        { type: 'references' as const, items: [{ title: 'Fuente pública', url: 'https://fixture.invalid/source' }] },
      ] }, visualIntents: [intent(ids.figure, 'STUDENT_FIGURE', 'STUDENT_BLOCK', 'Mirador concreto')] }
      : { document: { version: 'adventure-package-v1' as const, copy: { headline: 'Mirar la ciudad', hook: 'Una entrada visual basada en el corpus.', highlights: ['Mirador concreto'], sections: [], practicalTips: [], evidenceRefs: evidence },
        hero: { asset: { status: 'INTENT' as const, visualIntentId: ids.hero }, title: 'Mirador concreto', shortCopy: 'Patrimonio y paisaje.', presentationTone: 'LANDSCAPE' as const, textPlacement: 'OVERLAY' as const, evidenceRefs: evidence },
        visualStory: { items: [{ id: ids.story, asset: { status: 'INTENT' as const, visualIntentId: ids.storyIntent }, order: 0, title: 'Barrio histórico', presentationTone: 'CULTURE' as const, textPlacement: 'CARD_OVERLAY' as const, evidenceRefs: evidence }] },
        placesToGo: { items: [{ id: ids.place, category: 'EAT' as const, name: 'Restaurante concreto', order: 0, shortDescription: 'Establecimiento citado por el corpus.', reasonToGo: 'Tiene evidencia durable.', evidenceRefs: evidence, asset: { status: 'INTENT' as const, visualIntentId: ids.placeIntent } }], supplementalGaps: [{ type: 'MISSING_STAY_EVIDENCE' as const, description: 'No hay evidencia de alojamiento.', evidenceRefs: evidence }] },
      }, visualIntents: [intent(ids.hero, 'ADVENTURE_HERO', 'HERO', 'Mirador concreto'), intent(ids.storyIntent, 'VISUAL_STORY', 'VISUAL_STORY_ITEM', 'Barrio histórico', ids.story), intent(ids.placeIntent, 'PLACE_ASSET', 'PLACE', 'Restaurante concreto', ids.place)] }
    return { output: schema.parse(output) as T, usage: { providerId: 'double', model: 'structured', inputTokens: 0, outputTokens: 0, estimatedCost: 0, currency: 'EUR' } }
  }
}

const input = () => ({ destination: { id: ids.destination, name: 'Ciudad', countryCode: 'ES' }, masterKnowledge, dossier })

describe('STRUCTURED_GENERATION_RUNTIME', () => {
  it('STRUCTURED_STUDENT_GENERATION / STUDENT_FROM_MASTER_KNOWLEDGE / STUDENT_ORDER_PRESERVED', async () => {
    const transport = new DeterministicStructuredTransport()
    const generated = await generateStudentDocumentV1(transport, input(), new AbortController().signal)
    expect(generated.document.blocks.map(block => block.type)).toEqual(['heading', 'paragraph', 'list', 'key_facts', 'timeline', 'figure', 'references'])
    expect(generated.document.headline).toBeTruthy()
    expect((transport.payloads[0].masterKnowledge as RealMasterKnowledge).claims).toEqual(masterKnowledge.claims)
    expect(generated.visualIntents[0]).toMatchObject({ purpose: 'STUDENT_FIGURE', subject: 'Mirador concreto' })
  })

  it('STRUCTURED_ADVENTURE_GENERATION / ADVENTURE_NOT_FROM_STUDENT / HERO_INTENT / SINGLE_VISUAL_STORY', async () => {
    const transport = new DeterministicStructuredTransport()
    const generated = await generateAdventurePackageV1(transport, input(), new AbortController().signal)
    expect(generated.document.hero.asset).toMatchObject({ status: 'INTENT' })
    expect(generated.document.visualStory.items).toHaveLength(1)
    expect(generated.visualIntents.map(intent => intent.subject)).toEqual(['Mirador concreto', 'Barrio histórico', 'Restaurante concreto'])
    expect('student' in transport.payloads[0]).toBe(false)
  })

  it('PLACES_EVIDENCE_ONLY / MISSING_PLACE_CATEGORY_GAP / REDO_REUSES_MASTER_KNOWLEDGE', async () => {
    const transport = new DeterministicStructuredTransport()
    const first = await generateStudentDocumentV1(transport, input(), new AbortController().signal)
    const redo = await generateStudentDocumentV1(transport, { ...input(), previousRevision: { revisionId: 'revision-1', document: first.document } }, new AbortController().signal)
    const adventure = await generateAdventurePackageV1(transport, input(), new AbortController().signal)
    expect(adventure.document.placesToGo.items).toEqual([expect.objectContaining({ category: 'EAT', evidenceRefs: evidence })])
    expect(adventure.document.placesToGo.supplementalGaps[0].type).toBe('MISSING_STAY_EVIDENCE')
    expect((transport.payloads[1].masterKnowledge as RealMasterKnowledge)).toBe(masterKnowledge)
    expect(redo.document.version).toBe('student-document-v1')
  })
})
