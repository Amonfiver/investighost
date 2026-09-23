import { readFile } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'
import { importBatchFile } from '../src/renderer/batch-file-import'
import {
  hiddenTechnicalViews,
  jobPhaseLabel,
  jobStatusLabel,
  primaryNavigationLabels,
  userFacingJobFailure,
} from '../src/renderer/factory-presentation'

const batchFile = (name: string, type: string, content: string) => ({ name, type, text: async () => content }) as File
const accepted = { batch: { id: 'batch-id' } } as never

describe('simplified factory UI boundaries', () => {
  it('limits the picker to JSON and rejects a non-JSON file before the importer can create a batch', async () => {
    const importer = vi.fn(async () => accepted)
    const result = await importBatchFile(batchFile('destinations.csv', 'text/csv', 'Granada'), importer)
    expect(result).toMatchObject({ ok: false, error: 'Archivo no válido. Selecciona un archivo de lote (.json).' })
    expect(importer).not.toHaveBeenCalled()
  })

  it('surfaces invalid JSON and an invalid schema as user errors without accepting a batch', async () => {
    const invalidJsonImporter = vi.fn(async () => { throw new Error('INVALID_JSON') })
    const invalidSchemaImporter = vi.fn(async () => { throw new Error('INVALID_ENVELOPE') })
    await expect(importBatchFile(batchFile('batch.json', 'application/json', '{broken'), invalidJsonImporter))
      .resolves.toMatchObject({ ok: false, error: 'Este archivo no contiene un lote compatible.' })
    await expect(importBatchFile(batchFile('batch.json', 'application/json', '{"batch":{}}'), invalidSchemaImporter))
      .resolves.toMatchObject({ ok: false, error: 'Este archivo no contiene un lote compatible.' })
  })

  it('accepts a valid JSON batch only when the durable importer accepts it', async () => {
    const importer = vi.fn(async () => accepted)
    await expect(importBatchFile(batchFile('batch.json', 'application/json', '{"batch":{"name":"España"},"destinations":[{"name":"Granada","country":"España"}]}'), importer))
      .resolves.toEqual({ ok: true, result: accepted })
    expect(importer).toHaveBeenCalledOnce()
  })

  it('maps internal job statuses and phases to user-facing labels without changing the enums', () => {
    expect(Object.fromEntries(['QUEUED', 'PROCESSING', 'READY_FOR_REVIEW', 'APPROVED', 'FAILED'].map(value => [value, jobStatusLabel(value)]))).toEqual({ QUEUED: 'En cola', PROCESSING: 'Procesando', READY_FOR_REVIEW: 'Para revisar', APPROVED: 'Aprobado', FAILED: 'Fallido' })
    expect(Object.fromEntries(['RESEARCH', 'ANALYSIS', 'STUDENT', 'ADVENTURE', 'VISUALS', 'AUTO_REVIEW'].map(value => [value, jobPhaseLabel(value)]))).toEqual({ RESEARCH: 'Investigando', ANALYSIS: 'Analizando', STUDENT: 'Creando Student', ADVENTURE: 'Creando Adventure', VISUALS: 'Buscando imágenes', AUTO_REVIEW: 'Revisando automáticamente' })
  })

  it('keeps daily navigation visible and technical routes available but out of the primary navigation', async () => {
    expect(primaryNavigationLabels).toEqual({ library: 'Biblioteca', new: 'Nueva investigación', batches: 'Producción', providers: 'Proveedores' })
    expect(hiddenTechnicalViews).toEqual(['contributions', 'real-config'])
    const app = await readFile(new URL('../src/renderer/App.tsx', import.meta.url), 'utf8')
    expect(app).toContain("view === 'contributions'")
    expect(app).toContain("view === 'real-config'")
  })

  it('exposes the human redo selector and confirmation without a technical scope in the UI', async () => {
    const desk = await readFile(new URL('../src/renderer/BatchReviewDesk.tsx', import.meta.url), 'utf8')
    expect(desk).toContain('>Rehacer<')
    expect(desk).toContain("STUDENT: 'Student'")
    expect(desk).toContain("ADVENTURE: 'Adventure'")
    expect(desk).toContain("VISUALS: 'Imágenes'")
    expect(desk).toContain("EDITORIAL: 'Contenido editorial'")
    expect(desk).toContain('Confirmar rehacer')
    expect(desk).toContain('Cancelar')
  })

  it('gives a human redo status and hides authorization internals from the primary failure message', async () => {
    expect(jobStatusLabel('REDO_REQUIRED', 'ADVENTURE')).toBe('Rehaciendo Adventure')
    expect(jobPhaseLabel('AUTO_REVIEW', 'ADVENTURE')).toBe('Rehaciendo Adventure')
    expect(userFacingJobFailure('BATCH_PROVIDER_AUTHORIZATION_REQUIRED: falta la capability', 'ADVENTURE'))
      .toBe('No se pudo rehacer Adventure. El modo de ejecución disponible no está autorizado.')
    const app = await readFile(new URL('../src/renderer/App.tsx', import.meta.url), 'utf8')
    expect(app).toContain('El destino volverá a revisión cuando termine.')
  })
})
