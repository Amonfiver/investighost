-- Serializa primero la clave de preparación y después la identidad canónica.

create or replace function public.prepare_real_editorial_pilot(
  p_pilot_id uuid,
  p_run_id uuid,
  p_policy_id text,
  p_preparation_key text,
  p_identity_key text,
  p_variant_key text,
  p_destination_id uuid,
  p_profiles jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare existing public.real_editorial_pilots%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('real-editorial-preparation:' || p_preparation_key,0));
  perform pg_advisory_xact_lock(hashtextextended('real-editorial-identity:' || p_identity_key,0));
  select * into existing from public.real_editorial_pilots
   where preparation_key = p_preparation_key;
  if found then
    if existing.policy_id = p_policy_id
       and existing.identity_key = p_identity_key
       and existing.variant_key = p_variant_key
       and existing.canonical_destination_id = p_destination_id
       and existing.profile_configuration = p_profiles then
      return existing.id;
    end if;
    raise exception using errcode = 'P0001', message = 'PREPARATION_IDEMPOTENCY_CONFLICT';
  end if;
  if exists (select 1 from public.real_editorial_pilots where identity_key = p_identity_key) then
    raise exception using errcode = 'P0001', message = 'DUPLICATE_REAL_EDITORIAL_PILOT';
  end if;

  insert into public.real_editorial_pilots (
    id,policy_id,mode,task_origin,variant_key,preparation_key,identity_key,
    canonical_destination_id,destination_name,normalized_destination,country_code,
    destination_type,language,pipeline_version,profile_configuration,state
  ) values (
    p_pilot_id,p_policy_id,'real_editorial_pilot','human_authorized',p_variant_key,
    p_preparation_key,p_identity_key,p_destination_id,'Morella','morella','ES',
    'locality','es','real-editorial-v1',p_profiles,'queued'
  );
  insert into public.real_editorial_runs (
    id,pilot_id,attempt,state,prompt_version,schema_version
  ) values (
    p_run_id,p_pilot_id,1,'queued','morella-real-editorial-v1','real-editorial-snapshot-v1'
  );
  update public.real_editorial_pilots set current_run_id = p_run_id where id = p_pilot_id;
  insert into public.real_editorial_events (pilot_id,run_id,event_type,state,payload)
  values (
    p_pilot_id,p_run_id,'real.editorial.pilot.prepared','queued',
    jsonb_build_object('policyId',p_policy_id,'variantKey',p_variant_key,'mode','real_editorial_pilot')
  );
  return p_pilot_id;
end;
$$;

revoke all on function public.prepare_real_editorial_pilot(
  uuid,uuid,text,text,text,text,uuid,jsonb
) from public,anon,authenticated;
grant execute on function public.prepare_real_editorial_pilot(
  uuid,uuid,text,text,text,text,uuid,jsonb
) to service_role;
