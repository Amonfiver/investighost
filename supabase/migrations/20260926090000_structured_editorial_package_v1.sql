-- Structured editorial package artifacts remain append-only inside the
-- existing execution owner. This adds no parallel Library or research store.

alter table public.real_editorial_artifacts
  drop constraint if exists real_editorial_artifacts_artifact_kind_check;

alter table public.real_editorial_artifacts
  add constraint real_editorial_artifacts_artifact_kind_check check (artifact_kind in (
    'mission','round','query','tavily_result','source_accepted','source_rejected',
    'extracted_document','evidence','master_knowledge','fact','place','activity',
    'gap','contradiction','coverage','draft_adventure','draft_student',
    'student_document','adventure_package','visual_intent','editorial_package',
    'final_review','checkpoint'
  ));
