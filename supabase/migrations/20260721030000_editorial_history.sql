alter table public.editorial_drafts
  add column previous_draft_id uuid references public.editorial_drafts(id) on delete set null,
  add column regeneration_reason text check (length(regeneration_reason) <= 1000);

create index editorial_drafts_previous_idx on public.editorial_drafts(previous_draft_id)
  where previous_draft_id is not null;
