insert into public.import_batches (id,status,found_count,created_at,completed_at) values
('10000000-0000-4000-8000-000000000001','completed',2,'2026-01-01T10:00:00Z','2026-01-01T10:01:00Z'),
('10000000-0000-4000-8000-000000000002','running',1,'2026-01-01T11:00:00Z',null),
('10000000-0000-4000-8000-000000000003','completed_with_errors',2,'2026-01-01T12:00:00Z','2026-01-01T12:03:00Z')
on conflict (id) do nothing;

insert into public.contribution_import_jobs (id,batch_id,remote_id,source_type,status,attempt_count,next_retry_at,idempotency_key,version,created_at,updated_at) values
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','synthetic-no-file','suggestion','completed',1,null,'synthetic:no-file:v1',1,'2026-01-01T10:00:00Z','2026-01-01T10:01:00Z'),
('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','synthetic-with-file','photo','completed',1,null,'synthetic:with-file:v1',1,'2026-01-01T10:00:00Z','2026-01-01T10:01:00Z'),
('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','synthetic-pending','message','pending',0,null,'synthetic:pending:v1',1,'2026-01-01T11:00:00Z','2026-01-01T11:00:00Z'),
('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000003','synthetic-retry','report','retry_pending',2,'2026-01-01T12:05:00Z','synthetic:retry:v1',1,'2026-01-01T12:00:00Z','2026-01-01T12:03:00Z')
on conflict (id) do nothing;

insert into public.imported_contributions (id,job_id,remote_id,source_type,payload_json,payload_sha256,payload_size,version,imported_at) values
('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','synthetic-no-file','suggestion','{"content":"synthetic contribution alpha"}','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',42,1,'2026-01-01T10:00:30Z'),
('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','synthetic-with-file','photo','{"content":"synthetic contribution beta"}','bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',41,1,'2026-01-01T10:00:40Z')
on conflict (id) do nothing;

insert into public.contribution_files (id,contribution_id,remote_file_id,safe_storage_name,storage_path,mime_type,size,sha256,verified_at) values
('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','synthetic-file-1','synthetic-file-1.png','seed/synthetic-file-1.png','image/png',68,'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc','2026-01-01T10:00:40Z')
on conflict (id) do nothing;

insert into public.import_attempts (id,job_id,operation,outcome,error_code,error_message,attempted_at) values
('50000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000004','download','failure','SYNTHETIC_TIMEOUT','Synthetic transient timeout','2026-01-01T12:02:00Z')
on conflict (id) do nothing;

insert into public.local_backup_records (id,path,file_count,status,created_at,verified_at) values
('60000000-0000-4000-8000-000000000001','supabase-local://synthetic-snapshot',1,'verified','2026-01-01T10:01:00Z','2026-01-01T10:01:00Z')
on conflict (id) do nothing;

insert into public.geographic_entities (
  id,parent_id,entity_type,name,normalized_name,country_code,region_code,slug,
  latitude,longitude,source_name,source_version,source_license,status,resolution_method,version
) values
('70000000-0000-4000-8000-000000000001',null,'country','España','espana','ES',null,'espana',null,null,'Investighost representative fixture','2026-07-v1','CC0 synthetic fixture','active','exact',1),
('70000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000001','region','Comunitat Valenciana','comunitat valenciana','ES','VC','comunitat-valenciana',null,null,'Investighost representative fixture','2026-07-v1','CC0 synthetic fixture','active','exact',1),
('70000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000002','locality','Morella','morella','ES','VC','morella',40.6199,-0.1016,'Investighost representative fixture','2026-07-v1','CC0 synthetic fixture','active','exact',1),
('70000000-0000-4000-8000-000000000010',null,'country','Testland','testland','ZZ',null,'testland',null,null,'Investighost synthetic geography fixture','2026-07-v1','CC0 synthetic fixture','active','exact',1),
('70000000-0000-4000-8000-000000000011','70000000-0000-4000-8000-000000000010','region','Norte','norte','ZZ','N','norte',null,null,'Investighost synthetic geography fixture','2026-07-v1','CC0 synthetic fixture','active','exact',1),
('70000000-0000-4000-8000-000000000012','70000000-0000-4000-8000-000000000010','region','Sur','sur','ZZ','S','sur',null,null,'Investighost synthetic geography fixture','2026-07-v1','CC0 synthetic fixture','active','exact',1),
('70000000-0000-4000-8000-000000000013','70000000-0000-4000-8000-000000000011','locality','San Pedro','san pedro','ZZ','N','san-pedro-norte',null,null,'Investighost synthetic geography fixture','2026-07-v1','CC0 synthetic fixture','active','exact',1),
('70000000-0000-4000-8000-000000000014','70000000-0000-4000-8000-000000000012','locality','San Pedro','san pedro','ZZ','S','san-pedro-sur',null,null,'Investighost synthetic geography fixture','2026-07-v1','CC0 synthetic fixture','active','exact',1)
on conflict (id) do nothing;

insert into public.geographic_aliases (id,entity_id,alias,normalized_alias,source_version) values
('71000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000003','Morella','morella','2026-07-v1'),
('71000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000003','Morella, España','morella espana','2026-07-v1'),
('71000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000013','San Pedro','san pedro','2026-07-v1'),
('71000000-0000-4000-8000-000000000004','70000000-0000-4000-8000-000000000014','San Pedro','san pedro','2026-07-v1')
on conflict (id) do nothing;
