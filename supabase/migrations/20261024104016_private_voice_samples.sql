begin;
create table dj_private.voice_samples (
 id uuid primary key default gen_random_uuid(), thread_id uuid references dj_private.contact_threads(id) on delete set null,
 owner_id uuid references auth.users(id) on delete set null, object_key text unique,
 mime text not null check(mime in ('audio/wav','audio/mpeg','audio/mp4')), bytes integer not null check(bytes between 1 and 10485760),
 status text not null default 'pending' check(status in ('pending','active','deleting','deleted')),
 uploaded_at timestamptz not null default now(),expires_at timestamptz not null,
 request_use boolean not null check(request_use),future_use boolean not null default false,
 keep_90_days boolean not null default false check(not keep_90_days or future_use),
 consent_version text not null default 'voice-2026-10-24',withdrawn_at timestamptz,deleted_at timestamptz
);
create index voice_samples_owner_date on dj_private.voice_samples(owner_id,uploaded_at desc);
create index voice_samples_thread on dj_private.voice_samples(thread_id);
create index voice_samples_due on dj_private.voice_samples(expires_at) where status<>'deleted';
alter table dj_private.voice_samples enable row level security;
revoke all on dj_private.voice_samples from public,anon,authenticated;
grant select,insert,update on dj_private.voice_samples to service_role;
create table dj_private.voice_job_auth(id boolean primary key default true check(id),token_hash text not null);
alter table dj_private.voice_job_auth enable row level security;
revoke all on dj_private.voice_job_auth from public,anon,authenticated;
grant select on dj_private.voice_job_auth to service_role;
create function public.voice_dispatch(p_user uuid,p_admin boolean,p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security invoker set search_path='' as $$
declare t dj_private.contact_threads; v dj_private.voice_samples; result jsonb; thread_key uuid; sample_key uuid; extension text;
begin
 if p_user is null or p_admin is null then raise exception 'Unauthorized' using errcode='42501';end if;
 if p_action in ('reserve','list') then
   begin thread_key=(p_data->>'thread_id')::uuid;exception when invalid_text_representation then raise exception 'Unavailable' using errcode='42501';end;
   select * into t from dj_private.contact_threads where id=thread_key and (p_admin or owner_id=p_user) for update;
   if t.id is null or t.kind<>'request' then raise exception 'Unavailable' using errcode='42501';end if;
   if p_action='list' then
     select coalesce(jsonb_agg(to_jsonb(x) order by x.uploaded_at),'[]') into result from (
       select id,mime,bytes,status,uploaded_at,expires_at,request_use,future_use,keep_90_days,withdrawn_at,deleted_at from dj_private.voice_samples where thread_id=t.id
     ) x;return jsonb_build_object('samples',result);
   end if;
   if t.owner_id<>p_user or t.status='closed' or exists(select 1 from dj_private.contact_blocks where user_id=p_user) then raise exception 'Upload unavailable' using errcode='42501';end if;
   if p_data->>'own_adult_voice' is distinct from 'true' or p_data->>'request_use' is distinct from 'true' or p_data->>'retention_30' is distinct from 'true' then raise exception 'Required voice permissions missing' using errcode='22023';end if;
   if (p_data->>'keep_90_days')::boolean and not coalesce((p_data->>'future_use')::boolean,false) then raise exception 'Longer storage requires future-use permission' using errcode='22023';end if;
   if exists(select 1 from dj_private.voice_samples where thread_id=t.id and status<>'deleted') then raise exception 'One stored sample per request' using errcode='P0001';end if;
   perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('voice-upload:'||p_user::text,0));
   if (select count(*) from dj_private.voice_samples where owner_id=p_user and uploaded_at>now()-interval '24 hours')>=3 then raise exception 'Voice upload limit reached' using errcode='P0001';end if;
   extension=case p_data->>'mime' when 'audio/wav' then 'wav' when 'audio/mpeg' then 'mp3' when 'audio/mp4' then 'm4a' end;
   if extension is null or (p_data->>'bytes')::int not between 1 and 10485760 then raise exception 'Invalid audio' using errcode='22023';end if;
   sample_key=gen_random_uuid();
   insert into dj_private.voice_samples(id,thread_id,owner_id,object_key,mime,bytes,expires_at,request_use,future_use,keep_90_days)
   values(sample_key,t.id,p_user,'samples/'||sample_key::text||'.'||extension,p_data->>'mime',(p_data->>'bytes')::int,
     now()+case when coalesce((p_data->>'keep_90_days')::boolean,false) then interval '90 days' else interval '30 days' end,true,
     coalesce((p_data->>'future_use')::boolean,false),coalesce((p_data->>'keep_90_days')::boolean,false)) returning * into v;
   return to_jsonb(v);
 end if;
 begin sample_key=(p_data->>'id')::uuid;exception when invalid_text_representation then raise exception 'Unavailable' using errcode='42501';end;
 select * into v from dj_private.voice_samples where id=sample_key and (p_admin or owner_id=p_user) for update;
 if v.id is null then raise exception 'Unavailable' using errcode='42501';end if;
 if p_action='read' then
   if v.status<>'active' or v.expires_at<=now() or v.withdrawn_at is not null then raise exception 'Sample expired or removed' using errcode='42501';end if;
   return to_jsonb(v);
 elsif p_action='complete' then
   if v.owner_id<>p_user or v.status<>'pending' or v.expires_at<=now() then raise exception 'Unavailable' using errcode='42501';end if;
   update dj_private.voice_samples set status='active' where id=v.id;return jsonb_build_object('id',v.id,'expires_at',v.expires_at);
 elsif p_action='remove' then
   update dj_private.voice_samples set status=case when status='deleted' then status else 'deleting' end,withdrawn_at=coalesce(withdrawn_at,now()),expires_at=least(expires_at,now()) where id=v.id;
   return to_jsonb(v);
 elsif p_action='deleted' then
   if v.status not in ('deleting','deleted') then raise exception 'Unavailable' using errcode='42501';end if;
   update dj_private.voice_samples set status='deleted',object_key=null,deleted_at=coalesce(deleted_at,now()) where id=v.id;
   return jsonb_build_object('ok',true);
 end if;
 raise exception 'Unknown action' using errcode='22023';
end $$;
revoke all on function public.voice_dispatch(uuid,boolean,text,jsonb) from public,anon,authenticated;
grant execute on function public.voice_dispatch(uuid,boolean,text,jsonb) to service_role;
create function public.voice_retention_jobs(p_token text,p_action text,p_id uuid default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if p_token is null or length(p_token)<>64 or not exists(select 1 from dj_private.voice_job_auth where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex')) then raise exception 'Unauthorized maintenance' using errcode='42501';end if;
 if p_action='claim' then
   with due as (select id from dj_private.voice_samples where status<>'deleted' and (expires_at<=now() or status='deleting' or (status='pending' and uploaded_at<now()-interval '1 hour')) for update skip locked limit 10),
   claimed as (update dj_private.voice_samples s set status='deleting' from due where s.id=due.id returning s.id,s.object_key)
   select coalesce(jsonb_agg(to_jsonb(c)),'[]') into result from claimed c;return result;
 elsif p_action='deleted' then
   update dj_private.voice_samples set status='deleted',object_key=null,deleted_at=now() where id=p_id and status='deleting';return jsonb_build_object('ok',true);
 end if;
 raise exception 'Unknown job action' using errcode='22023';
end $$;
revoke all on function public.voice_retention_jobs(text,text,uuid) from public,anon,authenticated;
grant execute on function public.voice_retention_jobs(text,text,uuid) to service_role;
commit;
