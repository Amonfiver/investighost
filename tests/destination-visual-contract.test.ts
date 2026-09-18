import { describe, expect, it } from 'vitest'
import {
  DestinationVisualContractSchema,
  emptyDestinationVisualContract,
  emptyDestinationVisualSlot,
  projectDestinationVisualsForTrawel,
} from '@shared/destination-visual-contract'

const destinationId = '11111111-1111-4111-8111-111111111111'

describe('destination-level visual contract', () => {
  it('accepts two empty slots without blocking text publication', () => {
    const visuals = emptyDestinationVisualContract(destinationId)
    expect(visuals.imageSlot1.state).toBe('EMPTY')
    expect(visuals.imageSlot2.state).toBe('EMPTY')
    expect(DestinationVisualContractSchema.parse(visuals)).toEqual(visuals)
  })

  it('keeps visual metadata outside Adventure and Student bodies', () => {
    const visuals = emptyDestinationVisualContract(destinationId)
    expect(JSON.stringify(visuals)).not.toContain('Adventure')
    expect(JSON.stringify(visuals)).not.toContain('Student')
  })

  it('does not require a URL while a slot is EMPTY', () => {
    expect(emptyDestinationVisualSlot().imageUrl).toBeNull()
  })

  it('rejects an approved asset when usage is not allowed', () => {
    expect(() => DestinationVisualContractSchema.parse({
      ...emptyDestinationVisualContract(destinationId),
      imageSlot1: {
        ...emptyDestinationVisualSlot(), state: 'APPROVED', assetId: 'asset-1',
        usageAllowed: false, approvedForPublicUse: true, rightsCheckedAt: '2026-09-18T00:00:00.000Z',
      },
    })).toThrow(/no puede ser consumible/)
  })

  it('retains attribution metadata for an approved, rights-checked asset', () => {
    const result = DestinationVisualContractSchema.parse({
      ...emptyDestinationVisualContract(destinationId),
      imageSlot2: {
        ...emptyDestinationVisualSlot(), state: 'APPROVED', imageUrl: 'https://images.example.test/cuenca.jpg',
        sourceUrl: 'https://images.example.test/source', author: 'Autora', sourceName: 'Archivo',
        license: 'CC BY 4.0', attributionText: 'Foto: Autora — Archivo — CC BY 4.0',
        usageAllowed: true, approvedForPublicUse: true, referenceOnly: false,
        rightsCheckedAt: '2026-09-18T00:00:00.000Z',
      },
    })
    expect(result.imageSlot2.attributionText).toContain('Foto: Autora')
  })

  it('keeps a reference-only candidate out of the public V2 visual projection', () => {
    const internal = DestinationVisualContractSchema.parse({
      ...emptyDestinationVisualContract(destinationId),
      imageSlot1: {
        ...emptyDestinationVisualSlot(), state: 'PENDING', imageUrl: 'https://images.example.test/reference.jpg',
        sourceUrl: 'https://images.example.test/source', author: 'Sin verificar', referenceOnly: true,
        approvedForPublicUse: false, usageAllowed: false,
      },
    })
    const projected = projectDestinationVisualsForTrawel(internal)
    expect(projected.imageSlot1).toMatchObject({ state: 'PENDING', imageUrl: null, assetId: null })
    expect(JSON.stringify(projected)).not.toContain('reference.jpg')
    expect(JSON.stringify(projected)).not.toContain('Sin verificar')
  })
})
