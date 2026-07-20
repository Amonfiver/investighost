import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(new URL('../supabase/migrations/20260721010000_editorial_pipeline.sql', import.meta.url), 'utf8')
const seed = readFileSync(new URL('../supabase/seed.sql', import.meta.url), 'utf8')

describe('editorial Supabase schema', () => {
  it('normalizes all durable entities and traceability relations', () => {
    for (const table of [
      'geographic_entities', 'geographic_aliases', 'editorial_research_requests', 'editorial_research_runs',
      'research_sources', 'research_facts', 'research_fact_sources', 'research_places', 'research_place_facts',
      'research_place_sources', 'research_activities', 'research_activity_facts', 'research_activity_sources',
      'editorial_drafts', 'editorial_sections', 'editorial_section_facts', 'editorial_section_sources',
      'quality_reviews', 'quality_checks', 'provider_usage', 'research_events', 'stage_checkpoints', 'execution_locks',
    ]) {
      expect(migration).toContain(`create table public.${table}`)
    }
  })

  it('uses foreign keys, checks, indexes, RLS and service-role-only functions', () => {
    expect(migration).toContain('references public.research_sources(id) on delete restrict')
    expect(migration).toContain('references public.research_facts(id) on delete restrict')
    expect(migration).toContain('create index editorial_requests_state_updated_idx')
    expect(migration).toContain("execute format('alter table public.%I enable row level security'")
    expect(migration).toContain('grant execute on function public.acquire_editorial_execution_lock')
    expect(migration).toContain('revoke all on function public.acquire_editorial_execution_lock')
  })

  it('keeps JSONB limited to justified snapshots and metadata', () => {
    expect(migration).toContain("options jsonb not null default '{}'::jsonb")
    expect(migration).toContain('snapshot jsonb not null')
    expect(migration).not.toMatch(/editorial_result\s+jsonb|draft_payload\s+jsonb/i)
  })

  it('contains versioned, representative local geography fixtures', () => {
    expect(seed).toContain("'Morella','morella'")
    expect(seed.match(/'San Pedro','san pedro'/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
    expect(seed).toContain("'CC0 synthetic fixture'")
  })

  it('does not create mode-specific persistence', () => {
    expect(migration).not.toMatch(/manual_|automatic_/i)
  })
})
