import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const snapshotPath = new URL('../data/geography/geonames-es-mvp-2026-07-20.json', import.meta.url)
const migrationPath = new URL('../supabase/migrations/20260721020000_geography_resolution.sql', import.meta.url)
const seedPath = new URL('../supabase/seed.sql', import.meta.url)

describe('versioned geography snapshot', () => {
  it('pins source, license, scope and four upstream artifact hashes', () => {
    const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8')) as {
      provider: string
      sourceVersion: string
      sourceLicense: string
      scope: string
      artifacts: Array<{ sha256: string }>
      entities: Array<{ geonameId: string }>
    }
    expect(snapshot.provider).toBe('GeoNames')
    expect(snapshot.sourceVersion).toBe('geonames-2026-07-20')
    expect(snapshot.sourceLicense).toBe('Creative Commons Attribution 4.0')
    expect(snapshot.scope).toContain('Morella')
    expect(snapshot.artifacts).toHaveLength(4)
    expect(snapshot.artifacts.every(artifact => /^[a-f0-9]{64}$/.test(artifact.sha256))).toBe(true)
    expect(snapshot.entities.map(entity => entity.geonameId)).toEqual(['2510769', '2593113', '3116121'])
  })

  it('keeps the committed snapshot itself reproducible', () => {
    const content = readFileSync(snapshotPath)
    expect(createHash('sha256').update(content).digest('hex')).toMatch(/^[a-f0-9]{64}$/)
  })

  it('adds normalized provenance, external identifiers and human corrections', () => {
    const migration = readFileSync(migrationPath, 'utf8')
    expect(migration).toContain('create table public.geographic_source_snapshots')
    expect(migration).toContain('create table public.geographic_external_ids')
    expect(migration).toContain('create table public.geographic_resolution_corrections')
    expect(migration).toContain('enable row level security')
  })

  it('imports the MVP scope and preserves synthetic homonyms separately', () => {
    const seed = readFileSync(seedPath, 'utf8')
    expect(seed).toContain("'GeoNames','geonames-2026-07-20','Creative Commons Attribution 4.0'")
    expect(seed).toContain("'geonames','3116121'")
    expect(seed.match(/'San Pedro','san pedro'/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
  })
})
