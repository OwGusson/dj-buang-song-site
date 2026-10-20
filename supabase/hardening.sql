-- Reviewed against the live schema and applied on 2026-10-20.
-- Recorded live migration: restrict_private_data_and_require_admin_mfa.
-- Replaces policies ONLY on the six application tables named below.
-- Assign app_metadata.role=admin to the intended Auth account through a trusted admin API.
begin;
do $$
declare t text; p record;
begin
  foreach t in array array['song_requests','private_messages','songs_backup','song_events','song_analytics','song_likes'] loop
    if to_regclass('public.' || t) is null then raise exception 'Required table missing: %', t; end if;
    execute format('alter table public.%I enable row level security', t);
    for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('create policy admin_access on public.%I for all to authenticated using (((select auth.jwt())->''app_metadata''->>''role'') = ''admin'' and ((select auth.jwt())->>''aal'') = ''aal2'') with check (((select auth.jwt())->''app_metadata''->>''role'') = ''admin'' and ((select auth.jwt())->>''aal'') = ''aal2'')', t);
  end loop;
end $$;

grant insert (requester_name, song_name, details, email, notify, delivery, linked_song_id, status)
  on public.song_requests to anon, authenticated;
create policy public_submit_request on public.song_requests for insert to anon, authenticated
  with check (status = 'pending' and coalesce(linked_song_id, '') = ''
    and delivery in ('public', 'private')
    and char_length(requester_name) between 1 and 200
    and char_length(song_name) between 1 and 300
    and char_length(coalesce(details, '')) <= 10000 and char_length(coalesce(email, '')) <= 320);

grant insert (sender_name, sender_email, message, status) on public.private_messages to anon, authenticated;
create policy public_submit_message on public.private_messages for insert to anon, authenticated
  with check (status = 'new' and char_length(sender_name) between 1 and 200
    and char_length(message) between 1 and 10000 and char_length(coalesce(sender_email, '')) <= 500);

grant select on public.songs_backup to anon;
create policy public_published_backup on public.songs_backup for select to anon, authenticated
  using (visibility = 'public' and status = 'published');

grant select on public.song_likes to anon;
create policy public_read_like_counts on public.song_likes for select to anon, authenticated using (true);
-- Only the server may call this RPC. It serializes interactions per actor and song,
-- enforces 60 requests/minute/IP hash, and accepts one like per actor/song.
create schema if not exists dj_private;
revoke all on schema dj_private from public, anon, authenticated;
create table if not exists dj_private.interaction_limits (
  actor text primary key, window_start timestamptz not null, requests integer not null
);
create table if not exists dj_private.like_receipts (
  actor text not null, song_id text not null, created_at timestamptz not null default now(),
  primary key(actor, song_id)
);
alter table dj_private.interaction_limits enable row level security;
alter table dj_private.like_receipts enable row level security;
grant usage on schema dj_private to service_role;
grant select, insert, update on dj_private.interaction_limits, dj_private.like_receipts to service_role;
create or replace function public.record_interaction(p_song_id text, p_event_type text, p_actor text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare used integer; inserted integer; total bigint; summary jsonb;
begin
  if p_actor is null or p_song_id is null or p_event_type is null
    or p_actor !~ '^[0-9a-f]{64}$' or char_length(p_song_id) not between 1 and 100
    or p_event_type not in ('like','open','play_start','play_25','download_song','download_lyrics') then
    raise exception 'Invalid interaction';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('actor:' || p_actor, 0));
  insert into dj_private.interaction_limits(actor, window_start, requests) values(p_actor, now(), 1)
  on conflict(actor) do update set
    requests = case when dj_private.interaction_limits.window_start < now() - interval '1 minute' then 1 else dj_private.interaction_limits.requests + 1 end,
    window_start = case when dj_private.interaction_limits.window_start < now() - interval '1 minute' then now() else dj_private.interaction_limits.window_start end
  returning requests into used;
  if used > 60 then raise exception 'Rate limit exceeded'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('song:' || p_song_id, 0));
  if p_event_type = 'like' then
    insert into dj_private.like_receipts(actor, song_id) values(p_actor, p_song_id) on conflict do nothing;
    get diagnostics inserted = row_count;
    if inserted > 0 then
      insert into public.song_likes(song_id, likes, updated_at) values(p_song_id, 1, now())
      on conflict(song_id) do update set likes = coalesce(public.song_likes.likes, 0) + 1, updated_at = now();
    end if;
    select likes into total from public.song_likes where song_id=p_song_id;
    return jsonb_build_object('likes', coalesce(total, 0));
  end if;
  insert into public.song_events(song_id, event_type, listener_id, created_at)
    values(p_song_id, p_event_type, p_actor, now());
  insert into public.song_analytics(song_id, opens, plays, unique_opens, unique_listeners, play_25_count, song_downloads, lyrics_downloads, updated_at)
    select p_song_id,
      count(*) filter(where event_type='open'), count(*) filter(where event_type='play_start'),
      count(distinct listener_id) filter(where event_type='open'),
      count(distinct listener_id) filter(where event_type in ('play_start','play_25')),
      count(*) filter(where event_type='play_25'), count(*) filter(where event_type='download_song'),
      count(*) filter(where event_type='download_lyrics'), now()
    from public.song_events where song_id=p_song_id
    on conflict(song_id) do update set opens=excluded.opens, plays=excluded.plays,
      unique_opens=excluded.unique_opens, unique_listeners=excluded.unique_listeners,
      play_25_count=excluded.play_25_count, song_downloads=excluded.song_downloads,
      lyrics_downloads=excluded.lyrics_downloads, updated_at=excluded.updated_at;
  select to_jsonb(a) into summary from public.song_analytics a where a.song_id=p_song_id;
  return summary;
end $$;
revoke all on function public.record_interaction(text,text,text) from public, anon, authenticated;
grant execute on function public.record_interaction(text,text,text) to service_role;
-- The deployed event trigger already recomputes totals; remove it only when this
-- coordinated migration is deployed, to avoid duplicate aggregation per event.
drop trigger if exists song_events_refresh_analytics on public.song_events;
-- Legacy refresh helpers are now internal; only service/admin infrastructure may invoke them.
revoke execute on function public.refresh_song_analytics(text) from public, anon, authenticated;
revoke execute on function public.song_events_refresh_trigger() from public, anon, authenticated;
commit;
