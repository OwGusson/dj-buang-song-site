-- Private conversation service. No browser role can call this service-role-only RPC.
-- Apply the legacy insert-policy shutdown separately during the coordinated release.
begin;
create schema if not exists dj_private;
revoke all on schema dj_private from public, anon, authenticated;
grant usage on schema dj_private to service_role;

create table dj_private.contact_threads (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 owner_email text not null, nickname text not null check(char_length(nickname) between 1 and 100),
 kind text not null check(kind in ('request','message')), title text not null check(char_length(title) between 1 and 300),
 status text not null default 'pending' check(status in ('pending','in_progress','waiting','done','closed')),
 publish_song boolean not null default false, credit_name boolean not null default false,
 linked_song_id text not null default '', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 listener_read_at timestamptz, artist_read_at timestamptz
);
create index contact_threads_owner_updated on dj_private.contact_threads(owner_id,updated_at desc);
create index contact_threads_kind_status on dj_private.contact_threads(kind,status);
create table dj_private.contact_posts (
 id bigint generated always as identity primary key, thread_id uuid not null references dj_private.contact_threads(id) on delete cascade,
 author_id uuid not null references auth.users(id), author_role text not null check(author_role in ('listener','artist')),
 body text not null check(char_length(body) between 1 and 10000), created_at timestamptz not null default now()
);
create index contact_posts_thread_created on dj_private.contact_posts(thread_id,created_at,id);
create index contact_posts_author_created on dj_private.contact_posts(author_id,created_at);
create table dj_private.contact_blocks (user_id uuid primary key references auth.users(id),created_at timestamptz not null default now());
create table dj_private.contact_settings (id boolean primary key default true check(id), pause_requests boolean not null default false,pause_messages boolean not null default false);
insert into dj_private.contact_settings(id) values(true);
create table dj_private.contact_limits (bucket text primary key,started_at timestamptz not null,hits integer not null);
create table dj_private.contact_notifications (
 id uuid primary key default gen_random_uuid(),thread_id uuid not null references dj_private.contact_threads(id) on delete cascade,
 recipient text not null, status text not null default 'pending' check(status in ('pending','sending','sent','failed')),
 created_at timestamptz not null default now(),attempts integer not null default 0,claimed_at timestamptz
);
create index contact_notifications_pending on dj_private.contact_notifications(status,created_at);
alter table dj_private.contact_threads enable row level security;
alter table dj_private.contact_posts enable row level security;
alter table dj_private.contact_blocks enable row level security;
alter table dj_private.contact_settings enable row level security;
alter table dj_private.contact_limits enable row level security;
alter table dj_private.contact_notifications enable row level security;
grant select,insert,update,delete on dj_private.contact_threads,dj_private.contact_posts,dj_private.contact_blocks,dj_private.contact_settings,dj_private.contact_limits,dj_private.contact_notifications to service_role;
grant usage,select on sequence dj_private.contact_posts_id_seq to service_role;

create function public.contact_dispatch(p_user uuid,p_admin boolean,p_action text,p_data jsonb default '{}',p_actor text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare t dj_private.contact_threads; result jsonb; thread_key uuid; n integer; kind text; title text; body text; nickname text; email text; s dj_private.contact_settings; bucket_key text; blocked boolean;
begin
 if p_user is null or p_admin is null then raise exception 'Unauthorized' using errcode='42501'; end if;
 -- This role and all actor arguments come only from the verified edge service.
 if p_action='list' then
   select coalesce(jsonb_agg(to_jsonb(x) order by x.updated_at desc),'[]') into result from (
     select th.*,exists(select 1 from dj_private.contact_blocks b where b.user_id=th.owner_id) as blocked
     from dj_private.contact_threads th where p_admin or th.owner_id=p_user order by th.updated_at desc limit 200
   ) x;
   return jsonb_build_object('threads',result,'settings',(select to_jsonb(cs) from dj_private.contact_settings cs where id));
 end if;
 if p_action='settings' then
   if not p_admin then raise exception 'Forbidden' using errcode='42501';end if;
   update dj_private.contact_settings set pause_requests=coalesce((p_data->>'pause_requests')::boolean,pause_requests),pause_messages=coalesce((p_data->>'pause_messages')::boolean,pause_messages) where id;
   return jsonb_build_object('ok',true);
 end if;
 if p_action='create' then
   perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('contact-user:'||p_user::text,0));
   if exists(select 1 from dj_private.contact_blocks where user_id=p_user) then raise exception 'Submissions unavailable' using errcode='42501';end if;
   select * into s from dj_private.contact_settings where id;
   kind=p_data->>'kind';title=btrim(p_data->>'title');body=btrim(p_data->>'body');nickname=btrim(p_data->>'nickname');email=p_data->>'email';
   if kind is null or kind not in ('request','message') or title is null or char_length(title) not between 1 and 300 or body is null or char_length(body) not between 1 and 10000 or nickname is null or char_length(nickname) not between 1 and 100 or email is null or char_length(email) not between 3 and 320 then raise exception 'Invalid conversation' using errcode='22023';end if;
   if (kind='request' and s.pause_requests) or (kind='message' and s.pause_messages) then raise exception 'Submissions paused' using errcode='55000';end if;
   if exists(select 1 from dj_private.contact_threads where owner_id=p_user and created_at>now()-interval '60 seconds') then raise exception 'Please wait before starting another conversation' using errcode='P0001';end if;
   if (select count(*) from dj_private.contact_threads where owner_id=p_user and created_at>now()-interval '24 hours')>=5 then raise exception 'Daily conversation limit reached' using errcode='P0001';end if;
   if kind='request' and (select count(*) from dj_private.contact_threads ct where ct.owner_id=p_user and ct.kind='request' and status not in ('done','closed'))>=2 then raise exception 'Two active requests allowed' using errcode='P0001';end if;
   if p_actor is null or p_actor!~'^[0-9a-f]{64}$' then raise exception 'Client identity unavailable' using errcode='22023';end if;
   bucket_key='new:'||p_actor;
   perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(bucket_key,0));
   insert into dj_private.contact_limits values(bucket_key,now(),1) on conflict(bucket) do update set hits=case when dj_private.contact_limits.started_at<now()-interval '24 hours' then 1 else dj_private.contact_limits.hits+1 end,started_at=case when dj_private.contact_limits.started_at<now()-interval '24 hours' then now() else dj_private.contact_limits.started_at end returning hits into n;
   if n>30 then raise exception 'Network submission limit reached' using errcode='P0001';end if;
   insert into dj_private.contact_threads(owner_id,owner_email,nickname,kind,title,publish_song,credit_name,listener_read_at)
     values(p_user,email,nickname,kind,title,coalesce((p_data->>'publish_song')::boolean,false),coalesce((p_data->>'credit_name')::boolean,false),now()) returning * into t;
   insert into dj_private.contact_posts(thread_id,author_id,author_role,body) values(t.id,p_user,'listener',body);
   return jsonb_build_object('id',t.id);
 end if;
 begin thread_key=(p_data->>'id')::uuid;exception when invalid_text_representation then raise exception 'Conversation not found' using errcode='42501';end;
 select * into t from dj_private.contact_threads where id=thread_key and (p_admin or owner_id=p_user) for update;
 if t.id is null then raise exception 'Conversation not found' using errcode='42501';end if;
 if p_action='detail' then
   if p_admin then update dj_private.contact_threads set artist_read_at=now() where id=t.id;else update dj_private.contact_threads set listener_read_at=now() where id=t.id;end if;
   select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') into result from (select cp.id,cp.author_role,cp.body,cp.created_at from dj_private.contact_posts cp where cp.thread_id=t.id order by cp.id limit 500) x;
   select exists(select 1 from dj_private.contact_blocks where user_id=t.owner_id) into blocked;
   return jsonb_build_object('thread',to_jsonb(t)||jsonb_build_object('blocked',blocked),'posts',result);
 elsif p_action='reply' then
   body=btrim(p_data->>'body');
   if body is null or char_length(body) not between 1 and 10000 then raise exception 'Invalid reply' using errcode='22023';end if;
   if not p_admin then
     perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('contact-user:'||p_user::text,0));
     if t.status='closed' or exists(select 1 from dj_private.contact_blocks where user_id=p_user) then raise exception 'Replies unavailable' using errcode='42501';end if;
     if exists(select 1 from dj_private.contact_posts where author_id=p_user and created_at>now()-interval '30 seconds') then raise exception 'Please wait before replying again' using errcode='P0001';end if;
     if (select count(*) from dj_private.contact_posts where author_id=p_user and author_role='listener' and created_at>now()-interval '24 hours')>=20 then raise exception 'Daily reply limit reached' using errcode='P0001';end if;
     if (select count(*) from dj_private.contact_posts where thread_id=t.id)>=500 then raise exception 'Conversation is full' using errcode='P0001';end if;
     if p_actor is null or p_actor!~'^[0-9a-f]{64}$' then raise exception 'Client identity unavailable' using errcode='22023';end if;
     bucket_key='reply:'||p_actor;perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(bucket_key,0));
     insert into dj_private.contact_limits values(bucket_key,now(),1) on conflict(bucket) do update set hits=case when dj_private.contact_limits.started_at<now()-interval '1 hour' then 1 else dj_private.contact_limits.hits+1 end,started_at=case when dj_private.contact_limits.started_at<now()-interval '1 hour' then now() else dj_private.contact_limits.started_at end returning hits into n;
     if n>120 then raise exception 'Network reply limit reached' using errcode='P0001';end if;
   end if;
   insert into dj_private.contact_posts(thread_id,author_id,author_role,body) values(t.id,p_user,case when p_admin then 'artist' else 'listener' end,body);
   update dj_private.contact_threads set updated_at=now(),listener_read_at=case when p_admin then listener_read_at else now() end,artist_read_at=case when p_admin then now() else artist_read_at end where id=t.id;
   if p_admin then
     insert into dj_private.contact_notifications(thread_id,recipient) select t.id,t.owner_email where not exists(select 1 from dj_private.contact_notifications where thread_id=t.id and status in ('pending','sending'));
   end if;
   return jsonb_build_object('ok',true);
 elsif p_action='consent' then
   if p_user<>t.owner_id then raise exception 'Only the requester can change consent' using errcode='42501';end if;
   update dj_private.contact_threads set publish_song=coalesce((p_data->>'publish_song')::boolean,publish_song),credit_name=coalesce((p_data->>'credit_name')::boolean,credit_name),updated_at=now() where id=t.id;
   return jsonb_build_object('ok',true);
 elsif p_action='update' then
   if not p_admin then raise exception 'Forbidden' using errcode='42501';end if;
   if p_data ? 'status' and p_data->>'status' not in ('pending','in_progress','waiting','done','closed') then raise exception 'Invalid status' using errcode='22023';end if;
   update dj_private.contact_threads set status=coalesce(p_data->>'status',status),linked_song_id=coalesce(p_data->>'linked_song_id',linked_song_id),updated_at=now() where id=t.id;
   return jsonb_build_object('ok',true);
 elsif p_action='block' then
   if not p_admin or p_user=t.owner_id then raise exception 'Forbidden' using errcode='42501';end if;
   if (p_data->>'blocked')::boolean then insert into dj_private.contact_blocks(user_id) values(t.owner_id) on conflict do nothing;
   else delete from dj_private.contact_blocks where user_id=t.owner_id;end if;
   return jsonb_build_object('ok',true);
 end if;
 raise exception 'Unknown action' using errcode='22023';
end $$;
revoke all on function public.contact_dispatch(uuid,boolean,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.contact_dispatch(uuid,boolean,text,jsonb,text) to service_role;
create function public.contact_notification_jobs(p_action text,p_id uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare jobs jsonb;
begin
 if p_action='claim' then
   with selected as (
     select id from dj_private.contact_notifications where (status in ('pending','failed') or (status='sending' and claimed_at<now()-interval '10 minutes')) and attempts<5 order by created_at for update skip locked limit 5
   ), claimed as (
     update dj_private.contact_notifications n set status='sending',attempts=attempts+1,claimed_at=now() from selected s where n.id=s.id returning n.id,n.recipient,n.thread_id
   ) select coalesce(jsonb_agg(to_jsonb(c)),'[]') into jobs from claimed c;
   return jobs;
 elsif p_action in ('sent','failed') then
   update dj_private.contact_notifications set status=p_action where id=p_id and status='sending';
   return jsonb_build_object('ok',true);
 end if;
 raise exception 'Unknown notification action' using errcode='22023';
end $$;
revoke all on function public.contact_notification_jobs(text,uuid) from public,anon,authenticated;
grant execute on function public.contact_notification_jobs(text,uuid) to service_role;
commit;


