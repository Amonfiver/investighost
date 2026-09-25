import { describe, expect, it } from 'vitest'
import { StructuredEditorialPackageArtifactService, composeStructuredEditorialPackage } from '@modules/editorial-pipeline/structured-editorial-package-service'
import { discoveryQueryForVisualIntent } from '@modules/visual-acquisition/structured-visual-intent-adapter'
import {
  CaptionGenerationContextSchema,
  StudentDocumentV1Schema,
  StructuredEditorialPackageV1Schema,
  assertStudentDocumentReadyForTrawel,
  buildCaptionGenerationContext,
} from '@shared/structured-editorial-package-contracts'

const ids = {
  package: '00000000-0000-4000-8000-000000000001', execution: '00000000-0000-4000-8000-000000000002', destination: '00000000-0000-4000-8000-000000000003',
  studentEntry: '00000000-0000-4000-8000-000000000004', studentVersion: '00000000-0000-4000-8000-000000000005', studentRevision: '00000000-0000-4000-8000-000000000006',
  adventureEntry: '00000000-0000-4000-8000-000000000007', adventureVersion: '00000000-0000-4000-8000-000000000008', adventureRevision: '00000000-0000-4000-8000-000000000009',
  figureIntent: '00000000-0000-4000-8000-000000000010', heroIntent: '00000000-0000-4000-8000-000000000011', storyIntent: '00000000-0000-4000-8000-000000000012', placeIntent: '00000000-0000-4000-8000-000000000013',
  story: '00000000-0000-4000-8000-000000000014', stay: '00000000-0000-4000-8000-000000000015', eat: '00000000-0000-4000-8000-000000000016', drink: '00000000-0000-4000-8000-000000000017', night: '00000000-0000-4000-8000-000000000018',
}
const hash = 'a'.repeat(64)
const evidence = [{ kind: 'claim' as const, referenceId: 'claim-territory' }]
const intent = (id: string, purpose: 'STUDENT_FIGURE' | 'ADVENTURE_HERO' | 'VISUAL_STORY' | 'PLACE_ASSET', linkedType: 'STUDENT_BLOCK' | 'HERO' | 'VISUAL_STORY_ITEM' | 'PLACE') => ({
  id, purpose, subject: 'Entidad documentada', keywords: ['entidad', 'documentada'], context: 'Contexto editorial durable', desiredRole: purpose === 'ADVENTURE_HERO' ? 'HERO' as const : purpose === 'STUDENT_FIGURE' ? 'FIGURE' as const : 'PLACE' as const,
  desiredPlacement: purpose === 'STUDENT_FIGURE' ? 'WIDE' as const : 'OVERLAY' as const, linkedContent: { type: linkedType, id: linkedType === 'VISUAL_STORY_ITEM' ? ids.story : linkedType === 'PLACE' ? ids.stay : ids.package }, evidenceRefs: evidence,
})

function fixture() {
  return {
    version: 'structured-editorial-package-v1' as const, packageId: ids.package, executionId: ids.execution, destinationId: ids.destination, masterKnowledgeArtifactId: ids.execution, state: 'DRAFT' as const,
    student: {
      document: { version: 'student-document-v1' as const, headline: 'Destino documentado', lead: [], blocks: [
        { type: 'paragraph' as const, text: 'Una explicación basada en evidencia disponible.' },
        { type: 'figure' as const, resolution: 'INTENT' as const, visualIntentId: ids.figureIntent, placement: 'WIDE' as const, altHint: 'Vista territorial documentada' },
        { type: 'key_facts' as const, items: [{ label: 'Marco', value: 'Evidencia común' }] },
        { type: 'references' as const, items: [{ title: 'Fuente pública', source: 'Archivo documental', url: 'https://example.test/source' }] },
      ] },
      libraryRevision: { libraryEntryId: ids.studentEntry, versionId: ids.studentVersion, revisionId: ids.studentRevision, revisionHash: hash },
    },
    adventure: {
      document: { version: 'adventure-package-v1' as const, copy: { headline: 'Explorar con contexto', hook: 'Una puerta de entrada breve y visual.', highlights: ['Paisaje documentado'], sections: [], practicalTips: [], evidenceRefs: evidence },
        hero: { asset: { status: 'INTENT' as const, visualIntentId: ids.heroIntent }, title: 'Una llegada visual', shortCopy: 'Contexto para empezar.', presentationTone: 'LANDSCAPE' as const, textPlacement: 'OVERLAY' as const, evidenceRefs: evidence },
        visualStory: { items: [{ id: ids.story, asset: { status: 'INTENT' as const, visualIntentId: ids.storyIntent }, order: 0, presentationTone: 'CULTURE' as const, textPlacement: 'CARD_OVERLAY' as const, evidenceRefs: evidence }] },
        placesToGo: { items: [
          { id: ids.stay, category: 'STAY' as const, name: 'Alojamiento con evidencia', order: 0, shortDescription: 'Selección documentada.', reasonToGo: 'Evidencia disponible.', evidenceRefs: evidence, asset: { status: 'INTENT' as const, visualIntentId: ids.placeIntent } },
          { id: ids.eat, category: 'EAT' as const, name: 'Comer con evidencia', order: 0, shortDescription: 'Selección documentada.', reasonToGo: 'Evidencia disponible.', evidenceRefs: evidence },
          { id: ids.drink, category: 'DRINK' as const, name: 'Tomar algo con evidencia', order: 0, shortDescription: 'Selección documentada.', reasonToGo: 'Evidencia disponible.', evidenceRefs: evidence },
          { id: ids.night, category: 'NIGHTLIFE' as const, name: 'Salir con evidencia', order: 0, shortDescription: 'Selección documentada.', reasonToGo: 'Evidencia disponible.', evidenceRefs: evidence },
        ], supplementalGaps: [{ type: 'MISSING_NIGHTLIFE_EVIDENCE' as const, description: 'Sólo si falta evidencia futura.', evidenceRefs: evidence }] },
      },
      libraryRevision: { libraryEntryId: ids.adventureEntry, versionId: ids.adventureVersion, revisionId: ids.adventureRevision, revisionHash: hash },
    },
    visualIntents: [intent(ids.figureIntent, 'STUDENT_FIGURE', 'STUDENT_BLOCK'), intent(ids.heroIntent, 'ADVENTURE_HERO', 'HERO'), intent(ids.storyIntent, 'VISUAL_STORY', 'VISUAL_STORY_ITEM'), intent(ids.placeIntent, 'PLACE_ASSET', 'PLACE')],
  }
}

describe('structured editorial package contracts', () => {
  it('validates a variable-length Student document, preserves its order and allows a figure intent', () => {
    const student = fixture().student.document
    expect(StudentDocumentV1Schema.parse(student).blocks.map(block => block.type)).toEqual(['paragraph', 'figure', 'key_facts', 'references'])
    expect(() => assertStudentDocumentReadyForTrawel(student)).toThrow('STUDENT_FIGURE_INTENT_UNRESOLVED')
    expect(StudentDocumentV1Schema.safeParse({ ...student, blocks: [{ type: 'heading', level: 2, text: 'Vacío informativo' }] }).success).toBe(false)
    expect(StudentDocumentV1Schema.safeParse({ ...student, blocks: [{ type: 'paragraph', text: ' ' }] }).success).toBe(false)
  })

  it('validates Adventure, typed visual intents and all four evidence-backed Places categories', () => {
    const value = StructuredEditorialPackageV1Schema.parse(fixture())
    expect(value.adventure.document.placesToGo.items.map(place => place.category)).toEqual(['STAY', 'EAT', 'DRINK', 'NIGHTLIFE'])
    expect(value.visualIntents.map(item => item.purpose)).toEqual(['STUDENT_FIGURE', 'ADVENTURE_HERO', 'VISUAL_STORY', 'PLACE_ASSET'])
    const withoutEvidence = structuredClone(fixture()); withoutEvidence.adventure.document.placesToGo.items[0].evidenceRefs = []
    expect(StructuredEditorialPackageV1Schema.safeParse(withoutEvidence).success).toBe(false)
  })

  it('rejects mixed Library revisions and unresolved visual references in an approved package', () => {
    const mixed = fixture(); mixed.adventure.libraryRevision.revisionId = ids.studentRevision
    expect(StructuredEditorialPackageV1Schema.safeParse(mixed).success).toBe(false)
    expect(StructuredEditorialPackageV1Schema.safeParse({ ...fixture(), state: 'APPROVED' }).success).toBe(false)
  })

  it('accepts an approved coherent package only after every linked visual intent is resolved', () => {
    const value = fixture()
    const asset = (suffix: string) => ({ status: 'RESOLVED' as const, assetId: `00000000-0000-4000-8000-0000000000${suffix}` })
    const approved = {
      ...value,
      state: 'APPROVED' as const,
      student: { ...value.student, document: { ...value.student.document, blocks: value.student.document.blocks.map(block => block.type === 'figure' ? { type: 'figure' as const, resolution: 'RESOLVED' as const, assetId: asset('19').assetId, placement: block.placement, alt: 'Vista territorial documentada' } : block) } },
      adventure: { ...value.adventure, document: { ...value.adventure.document,
        hero: { ...value.adventure.document.hero, asset: asset('20') },
        visualStory: { items: value.adventure.document.visualStory.items.map(item => ({ ...item, asset: asset('21') })) },
        placesToGo: { ...value.adventure.document.placesToGo, items: value.adventure.document.placesToGo.items.map(place => place.asset ? { ...place, asset: asset('22') } : place) },
      } },
    }
    expect(StructuredEditorialPackageV1Schema.parse(approved).state).toBe('APPROVED')
  })

  it('round-trips a Library-linked structured package through append-only durable artifacts without altering legacy text', async () => {
    const artifacts: Array<{ version: number; payload: unknown }> = []
    const repository = {
      latestArtifact: async () => artifacts.at(-1) ? { ...artifacts.at(-1)!, kind: 'editorial_package' as const, key: 'structured/v1', payloadHash: hash, createdAt: new Date().toISOString() } : undefined,
      appendArtifact: async (_executionId: string, _kind: 'editorial_package', _key: string, version: number, payload: unknown) => { artifacts.push({ version, payload }) },
    }
    const service = new StructuredEditorialPackageArtifactService(repository as never)
    const result = await service.save(ids.execution, composeStructuredEditorialPackage({ package: fixture(), masterKnowledgeArtifactId: ids.execution }))
    expect(result.version).toBe(1)
    const revised = { ...fixture(), packageId: '00000000-0000-4000-8000-000000000099' }
    expect((await service.save(ids.execution, composeStructuredEditorialPackage({ package: revised, masterKnowledgeArtifactId: ids.execution }))).version).toBe(2)
    expect((await service.loadCurrent(ids.execution))?.student.libraryRevision.revisionId).toBe(ids.studentRevision)
    expect((await service.loadCurrent(ids.execution))?.masterKnowledgeArtifactId).toBe(ids.execution)
    expect(artifacts).toHaveLength(2)
  })

  it('models caption work as a post-selection boundary without a provider', () => {
    const context = { assetId: ids.figureIntent, assetMetadata: { sourceName: 'Archivo', license: 'CC BY', alt: 'Vista documentada' }, slot: 'STUDENT_FIGURE' as const, editorialContext: 'Territorio y relieve.', evidenceRefs: evidence }
    expect(buildCaptionGenerationContext(context)).toEqual(CaptionGenerationContextSchema.parse(context))
  })

  it('maps typed visual intents onto the existing discovery abstraction without searching', () => {
    const visualIntent = fixture().visualIntents[1]
    expect(discoveryQueryForVisualIntent(visualIntent, { destinationId: ids.destination, destinationName: 'Destino genérico', countryOrRegion: 'ES' }, 'landscape')).toMatchObject({
      role: 'hero', category: 'landscape', searchKeywords: ['Entidad documentada', 'entidad', 'documentada'], limit: 20,
    })
  })
})
