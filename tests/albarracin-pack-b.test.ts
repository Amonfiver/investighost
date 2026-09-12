import { describe, expect, it } from 'vitest'
import {
  ALBARRACIN_PACK_B_CANDIDATES,
  canonicalHeadingKinds,
} from '@modules/library-versioning/albarracin-pack-b'

describe('Pack B de Albarracín', () => {
  it.each(['adventure', 'student'] as const)('%s emite la taxonomía canónica completa', profile => {
    const candidate = ALBARRACIN_PACK_B_CANDIDATES[profile]
    expect(canonicalHeadingKinds(candidate.content)).toEqual(candidate.taxonomy)
    expect(candidate.content).toMatch(/^## \[intro]\n/m)
    expect(candidate.content).toMatch(/## \[sources]\n/)
  })

  it('mantiene los límites de evidencia del perfil estudiante', () => {
    const content = ALBARRACIN_PACK_B_CANDIDATES.student.content
    expect(content).toContain('costes parciales de visita')
    expect(content).toContain('no de un presupuesto de estancia ni de coste de vida')
    expect(content).toContain('no confirma una oferta académica formal')
    expect(content).toContain('No hay datos recientes suficientes sobre población, servicios cotidianos, empleo ni estacionalidad residencial')
    expect(content).toContain('El expediente no respalda alquiler, alojamiento, manutención, matrícula ni un presupuesto mensual')
    expect(content).toContain('universidad, campus, grado, matrícula, calendario, plazas ni disponibilidad de estudios')
  })

  it('no convierte las incertidumbres documentadas en certezas', () => {
    const { adventure, student } = ALBARRACIN_PACK_B_CANDIDATES
    expect(adventure.content).toContain('No deben mezclarse las cifras ni las características de ambos recorridos')
    expect(adventure.content).toContain('No se documentan barandillas concretas')
    expect(student.content).toContain('precios documentados son discrepantes')
    expect(student.content).toContain('No hay evidencia suficiente para afirmar horarios')
  })
})
