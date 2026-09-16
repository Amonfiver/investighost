-- El snapshot v1 de Cuenca conserva el contrato de usage visible, pero no
-- telemetría interna del receipt. La proyección se limita a esos campos y no
-- modifica artefactos, hashes, costes ni recibos.

create or replace function public.project_terminal_payload_for_snapshot_v1_compatibility(
  p_artifact_kind text,
  p_payload jsonb
) returns jsonb language plpgsql immutable strict set search_path = public as $$
declare
  expected_profile text;
begin
  if p_artifact_kind not in ('draft_adventure','draft_student','final_review') then
    raise exception 'TERMINAL_SNAPSHOT_V1_KIND_INVALID';
  end if;
  if jsonb_typeof(p_payload) <> 'object'
     or jsonb_typeof(p_payload->'usage') <> 'object' then
    raise exception 'TERMINAL_SNAPSHOT_V1_USAGE_INVALID';
  end if;
  expected_profile := case p_artifact_kind
    when 'draft_adventure' then 'adventure'
    when 'draft_student' then 'student'
    else null
  end;
  if expected_profile is not null
     and p_payload->>'profile' is distinct from expected_profile then
    raise exception 'TERMINAL_SNAPSHOT_V1_PROFILE_INVALID';
  end if;
  return jsonb_set(
    p_payload,
    '{usage}',
    (p_payload->'usage') - array[
      'providerRequestIds','model','providerId','reasoningTokens','cachedInputTokens'
    ],
    false
  );
end;
$$;

revoke all on function public.project_terminal_payload_for_snapshot_v1_compatibility(
  text,jsonb
) from public,anon,authenticated;
grant execute on function public.project_terminal_payload_for_snapshot_v1_compatibility(
  text,jsonb
) to service_role;
