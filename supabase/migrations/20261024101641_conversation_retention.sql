-- Reviewed summaries survive; original private content does not. No browser grants.
begin;
alter table dj_private.contact_threads add column closed_at timestamptz,
 add column archive_summary text not null default '' check(char_length(archive_summary)<=2000),
 add column summary_reviewed_at timestamptz;
-- Existing closed rows start their six-month period at installation, never retrospectively.
update dj_private.contact_threads set closed_at=now() where status='closed';
create index contact_threads_retention_due on dj_private.contact_threads(closed_at) where status='closed';
create table dj_private.contact_archives (
 id uuid primary key default gen_random_uuid(),kind text not null check(kind in ('request','message')),
 status text not null check(status='closed'),created_at timestamptz not null,closed_at timestamptz not null,
 archived_at timestamptz not null default now(),summary text not null check(char_length(summary)<=2000)
);
create index contact_archives_kind_date on dj_private.contact_archives(kind,archived_at desc,id);
alter table dj_private.contact_archives enable row level security;
revoke all on dj_private.contact_archives from public,anon,authenticated;
grant select,insert on dj_private.contact_archives to service_role;
-- Only the permission evidence needed for a linked song is retained separately.
-- It is not an archive copy and contains no conversation text or title.
create table dj_private.contact_song_permissions (
 id uuid primary key default gen_random_uuid(),song_id text not null,owner_id uuid references auth.users(id) on delete set null,
 owner_email text not null,publish_song boolean not null,credit_name boolean not null,recorded_at timestamptz not null
);
alter table dj_private.contact_song_permissions enable row level security;
revoke all on dj_private.contact_song_permissions from public,anon,authenticated;
grant select,insert,delete on dj_private.contact_song_permissions to service_role;
create index contact_song_permissions_owner on dj_private.contact_song_permissions(owner_id);
create function dj_private.contact_retention_clock() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.status='closed' then
   if old.status is distinct from 'closed' then new.closed_at=now();else new.closed_at=old.closed_at;end if;
 else new.closed_at=null;end if;
 -- A changed conversation needs a fresh summary review; do not silently keep stale text.
 if new.status is distinct from old.status or new.linked_song_id is distinct from old.linked_song_id then
   new.archive_summary='';new.summary_reviewed_at=null;
 end if;
 return new;
end $$;
revoke all on function dj_private.contact_retention_clock() from public,anon,authenticated;
create trigger contact_retention_clock before update on dj_private.contact_threads for each row execute function dj_private.contact_retention_clock();
create function dj_private.contact_post_retention_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from dj_private.contact_threads where id=new.thread_id and status<>'closed' for update;
 if not found then raise exception 'Reopen this conversation before replying' using errcode='42501';end if;
 update dj_private.contact_threads set archive_summary='',summary_reviewed_at=null where id=new.thread_id;
 return new;
end $$;
revoke all on function dj_private.contact_post_retention_guard() from public,anon,authenticated;
create trigger contact_post_retention_guard before insert on dj_private.contact_posts for each row execute function dj_private.contact_post_retention_guard();
create function dj_private.expire_contact_conversations() returns integer language plpgsql security invoker set search_path='' as $$
declare t dj_private.contact_threads; total integer=0;
begin
 for t in select * from dj_private.contact_threads where status='closed' and closed_at<=now()-interval '6 months' order by closed_at for update skip locked limit 1000 loop
   insert into dj_private.contact_archives(kind,status,created_at,closed_at,summary)
   values(t.kind,'closed',t.created_at,t.closed_at,case when t.summary_reviewed_at is not null then t.archive_summary else '' end);
   if t.linked_song_id<>'' and (t.publish_song or t.credit_name) then
     insert into dj_private.contact_song_permissions(song_id,owner_id,owner_email,publish_song,credit_name,recorded_at)
     values(t.linked_song_id,t.owner_id,t.owner_email,t.publish_song,t.credit_name,t.updated_at);
   end if;
   -- Cascades erase all posts and email-notification recipients for this thread.
   delete from dj_private.contact_threads where id=t.id;
   total=total+1;
 end loop;
 return total;
end $$;
revoke all on function dj_private.expire_contact_conversations() from public,anon,authenticated,service_role;
create or replace function public.contact_dispatch(p_user uuid,p_admin boolean,p_action text,p_data jsonb default '{}',p_actor text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare t dj_private.contact_threads; result jsonb; thread_key uuid; n integer; kind text; title text; body text; nickname text; email text; s dj_private.contact_settings; bucket_key text; blocked boolean;
begin
 if p_user is null or p_admin is null then raise exception 'Unauthorized' using errcode='42501'; end if;
 -- This role and all actor arguments come only from the verified edge service.
 if p_action='archive_list' then
   if not p_admin then raise exception 'Forbidden' using errcode='42501';end if;
   select coalesce(jsonb_agg(to_jsonb(x) order by x.archived_at desc,x.id),'[]') into result from (
     select * from dj_private.contact_archives a where a.kind=coalesce(p_data->>'kind','message') order by archived_at desc,id limit 200
   ) x;
   return jsonb_build_object('archives',result,'total',(select count(*) from dj_private.contact_archives ca where ca.kind=coalesce(p_data->>'kind','message')));
 end if;
 if p_action='list' then
   select coalesce(jsonb_agg((case when p_admin then to_jsonb(x) else to_jsonb(x)-'archive_summary'-'summary_reviewed_at' end) order by x.updated_at desc),'[]') into result from (
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
 if p_action='archive_summary' then
   if not p_admin then raise exception 'Forbidden' using errcode='42501';end if;
   if p_data->>'reviewed' is distinct from 'true' or p_data->>'summary' is null or char_length(btrim(p_data->>'summary')) not between 1 and 2000 then raise exception 'Review the summary before saving' using errcode='22023';end if;
   update dj_private.contact_threads set archive_summary=btrim(p_data->>'summary'),summary_reviewed_at=now() where id=t.id;
   return jsonb_build_object('ok',true);
 end if;
 if p_action='detail' then
   if p_admin then update dj_private.contact_threads set artist_read_at=now() where id=t.id;else update dj_private.contact_threads set listener_read_at=now() where id=t.id;end if;
   select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') into result from (select cp.id,cp.author_role,cp.body,cp.created_at from dj_private.contact_posts cp where cp.thread_id=t.id order by cp.id limit 500) x;
   select exists(select 1 from dj_private.contact_blocks where user_id=t.owner_id) into blocked;
   return jsonb_build_object('thread',(case when p_admin then to_jsonb(t) else to_jsonb(t)-'archive_summary'-'summary_reviewed_at' end)||jsonb_build_object('blocked',blocked),'posts',result);
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

commit;
-- Scheduler is installed separately after the database behavior is verified.

