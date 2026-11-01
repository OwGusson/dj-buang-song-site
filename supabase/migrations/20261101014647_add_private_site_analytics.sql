begin;

create schema if not exists dj_private;
revoke all on schema dj_private from public, anon, authenticated;
grant usage on schema dj_private to service_role;

create table dj_private.site_analytics_events (
  event_id uuid primary key,
  session_id uuid not null,
  event_type text not null check (event_type in ('page_view','outbound_click')),
  page_key text not null check (page_key in ('/','/#music','/#requests','/#merch','/#faq','/#privacy','/shared-song','/albums/global-barangay','/albums/buang-after-dark','/other-public-page')),
  referrer_domain text check (referrer_domain is null or (char_length(referrer_domain) between 3 and 253 and referrer_domain ~ '^[a-z0-9.-]+$')),
  source_key text not null check (char_length(source_key) between 1 and 253),
  campaign_source text check (campaign_source is null or campaign_source in ('facebook','instagram','tiktok','youtube','dia','google','spotify','suno','other')),
  campaign_medium text check (campaign_medium is null or campaign_medium in ('social','livestream','profile','bio','post','story','search','referral','other')),
  campaign_name text check (campaign_name is null or campaign_name in ('global-barangay-launch','dj-buang-2-launch','social-launch','dia-livestream','music-release','other')),
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  device_group text not null check (device_group in ('mobile','tablet','desktop','unknown')),
  destination text check (destination is null or destination in ('spotify_presave','spotify','apple_music','youtube_music','facebook','instagram','tiktok','youtube','listen_album','listen_music')),
  traffic_scope text not null check (traffic_scope in ('public','admin','qa')),
  created_at timestamptz not null default now(),
  check ((event_type = 'page_view' and destination is null) or (event_type = 'outbound_click' and destination is not null))
);
create index site_analytics_events_date_type on dj_private.site_analytics_events(created_at desc,event_type,traffic_scope);
create index site_analytics_events_date_page on dj_private.site_analytics_events(created_at desc,page_key);
alter table dj_private.site_analytics_events enable row level security;
revoke all on dj_private.site_analytics_events from public, anon, authenticated;
grant select, insert, delete on dj_private.site_analytics_events to service_role;

alter table public.song_events
  add column session_id uuid,
  add column playback_id uuid,
  add column event_id uuid,
  add column measurement_version smallint,
  add column duration_seconds integer,
  add column listened_seconds integer,
  add column traffic_scope text not null default 'legacy' check (traffic_scope in ('legacy','public','admin','qa'));
create unique index song_events_event_id on public.song_events(event_id) where event_id is not null;
create unique index song_events_one_playback_milestone on public.song_events(playback_id,event_type)
  where playback_id is not null and measurement_version=2 and event_type in ('play_start','play_25','play_50','play_75','play_finished');
create index song_events_session_period on public.song_events(session_id,created_at desc) where session_id is not null;

-- New page and click events are inserted only by the authenticated server using service_role.
-- The short-lived HMAC actor is used only in the existing rate-limit table; it is not stored in analytics rows.
create or replace function public.record_site_analytics_event(
  p_actor text,p_event_id uuid,p_session_id uuid,p_event_type text,p_page_key text,
  p_referrer_domain text,p_source_key text,p_campaign_source text,p_campaign_medium text,
  p_campaign_name text,p_country_code text,p_device_group text,p_destination text,p_traffic_scope text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare used integer; inserted integer;
begin
  if p_actor is null or p_actor !~ '^[0-9a-f]{64}$' or p_event_id is null or p_session_id is null
    or p_event_type is null or p_event_type not in ('page_view','outbound_click')
    or p_page_key is null or p_page_key not in ('/','/#music','/#requests','/#merch','/#faq','/#privacy','/shared-song','/albums/global-barangay','/albums/buang-after-dark','/other-public-page')
    or p_source_key is null or char_length(p_source_key) not between 1 and 253
    or p_campaign_source is not null and p_campaign_source not in ('facebook','instagram','tiktok','youtube','dia','google','spotify','suno','other')
    or p_campaign_medium is not null and p_campaign_medium not in ('social','livestream','profile','bio','post','story','search','referral','other')
    or p_campaign_name is not null and p_campaign_name not in ('global-barangay-launch','dj-buang-2-launch','social-launch','dia-livestream','music-release','other')
    or p_country_code is null or p_country_code !~ '^[A-Z]{2}$' or p_device_group is null or p_device_group not in ('mobile','tablet','desktop','unknown')
    or p_traffic_scope is null or p_traffic_scope not in ('public','admin','qa')
    or (p_event_type='page_view' and p_destination is not null)
    or (p_event_type='outbound_click' and (p_destination is null or p_destination not in ('spotify_presave','spotify','apple_music','youtube_music','facebook','instagram','tiktok','youtube','listen_album','listen_music')))
    or (p_referrer_domain is not null and (char_length(p_referrer_domain) not between 3 and 253 or p_referrer_domain !~ '^[a-z0-9.-]+$')) then
    raise exception 'Invalid site analytics event';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('analytics:' || p_actor,0));
  insert into dj_private.interaction_limits(actor,window_start,requests) values(p_actor,now(),1)
  on conflict(actor) do update set
    requests=case when dj_private.interaction_limits.window_start < now()-interval '1 minute' then 1 else dj_private.interaction_limits.requests+1 end,
    window_start=case when dj_private.interaction_limits.window_start < now()-interval '1 minute' then now() else dj_private.interaction_limits.window_start end
  returning requests into used;
  if used>60 then raise exception 'Rate limit exceeded'; end if;
  insert into dj_private.site_analytics_events(event_id,session_id,event_type,page_key,referrer_domain,source_key,campaign_source,campaign_medium,campaign_name,country_code,device_group,destination,traffic_scope)
  values(p_event_id,p_session_id,p_event_type,p_page_key,p_referrer_domain,p_source_key,p_campaign_source,p_campaign_medium,p_campaign_name,p_country_code,p_device_group,p_destination,p_traffic_scope)
  on conflict(event_id) do nothing;
  get diagnostics inserted=row_count;
  return jsonb_build_object('recorded',inserted=1,'duplicate',inserted=0);
end $$;
revoke all on function public.record_site_analytics_event(text,uuid,uuid,text,text,text,text,text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.record_site_analytics_event(text,uuid,uuid,text,text,text,text,text,text,text,text,text,text,text) to service_role;

-- Playback events carry a random browser-session ID and per-playback ID. No network hash is persisted.
create or replace function public.record_song_analytics_event(
  p_actor text,p_song_id text,p_event_id uuid,p_session_id uuid,p_playback_id uuid,
  p_event_type text,p_duration_seconds integer,p_listened_seconds integer,p_traffic_scope text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare used integer; inserted integer; new_session boolean; new_open_session boolean;
begin
  if p_actor is null or p_actor !~ '^[0-9a-f]{64}$' or p_song_id is null or char_length(p_song_id) not between 1 and 100
    or p_event_id is null or p_session_id is null
    or p_event_type is null or p_event_type not in ('song_detail_open','play_start','play_25','play_50','play_75','play_finished','download_song','download_lyrics')
    or p_traffic_scope is null or p_traffic_scope not in ('public','admin','qa')
    or (p_event_type in ('play_start','play_25','play_50','play_75','play_finished') and p_playback_id is null)
    or (p_event_type in ('play_25','play_50','play_75','play_finished') and (p_duration_seconds is null or p_duration_seconds not between 1 and 86400 or p_listened_seconds is null or p_listened_seconds not between 0 and p_duration_seconds))
    or (p_event_type='play_25' and p_listened_seconds < p_duration_seconds*0.25)
    or (p_event_type='play_50' and p_listened_seconds < p_duration_seconds*0.50)
    or (p_event_type='play_75' and p_listened_seconds < p_duration_seconds*0.75)
    or (p_event_type='play_finished' and p_listened_seconds < p_duration_seconds*0.95) then
    raise exception 'Invalid song analytics event';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('analytics:' || p_actor,0));
  insert into dj_private.interaction_limits(actor,window_start,requests) values(p_actor,now(),1)
  on conflict(actor) do update set
    requests=case when dj_private.interaction_limits.window_start < now()-interval '1 minute' then 1 else dj_private.interaction_limits.requests+1 end,
    window_start=case when dj_private.interaction_limits.window_start < now()-interval '1 minute' then now() else dj_private.interaction_limits.window_start end
  returning requests into used;
  if used>60 then raise exception 'Rate limit exceeded'; end if;
  select not exists(select 1 from public.song_events e where e.song_id=p_song_id and e.session_id=p_session_id and e.event_type in ('play_start','play_25') and e.traffic_scope='public') into new_session;
  select not exists(select 1 from public.song_events e where e.song_id=p_song_id and e.session_id=p_session_id and e.event_type='song_detail_open' and e.traffic_scope='public') into new_open_session;
  insert into public.song_events(song_id,event_type,listener_id,progress_percent,created_at,session_id,playback_id,event_id,measurement_version,duration_seconds,listened_seconds,traffic_scope)
  values(p_song_id,p_event_type,null,case when p_duration_seconds>0 then round(p_listened_seconds::numeric*100/p_duration_seconds) else null end,now(),p_session_id,p_playback_id,p_event_id,2,p_duration_seconds,p_listened_seconds,p_traffic_scope)
  on conflict do nothing;
  get diagnostics inserted=row_count;
  if inserted=0 then return jsonb_build_object('recorded',false,'duplicate',true); end if;
  if p_traffic_scope='public' then
    insert into public.song_analytics(song_id,opens,plays,unique_opens,unique_listeners,play_25_count,song_downloads,lyrics_downloads,updated_at)
    values(p_song_id,
      (p_event_type='song_detail_open')::integer,
      (p_event_type='play_start')::integer,
      (p_event_type='song_detail_open' and new_open_session)::integer,
      (p_event_type in ('play_start','play_25') and new_session)::integer,
      (p_event_type='play_25')::integer,
      (p_event_type='download_song')::integer,
      (p_event_type='download_lyrics')::integer,now())
    on conflict(song_id) do update set
      opens=coalesce(public.song_analytics.opens,0)+excluded.opens,
      plays=coalesce(public.song_analytics.plays,0)+excluded.plays,
      unique_opens=coalesce(public.song_analytics.unique_opens,0)+excluded.unique_opens,
      unique_listeners=coalesce(public.song_analytics.unique_listeners,0)+excluded.unique_listeners,
      play_25_count=coalesce(public.song_analytics.play_25_count,0)+excluded.play_25_count,
      song_downloads=coalesce(public.song_analytics.song_downloads,0)+excluded.song_downloads,
      lyrics_downloads=coalesce(public.song_analytics.lyrics_downloads,0)+excluded.lyrics_downloads,updated_at=now();
  end if;
  return jsonb_build_object('recorded',true,'duplicate',false);
end $$;
revoke all on function public.record_song_analytics_event(text,text,uuid,uuid,uuid,text,integer,integer,text) from public,anon,authenticated;
grant execute on function public.record_song_analytics_event(text,text,uuid,uuid,uuid,text,integer,integer,text) to service_role;

create or replace function public.read_site_analytics(p_start timestamptz,p_end timestamptz,p_include_qa boolean default false)
returns jsonb language sql security invoker set search_path = '' as $$
with selected as (
  select * from dj_private.site_analytics_events
  where created_at>=p_start and created_at<p_end and traffic_scope<>'admin' and (p_include_qa or traffic_scope<>'qa')
), visible_page_views as (select * from selected where event_type='page_view'), visible_clicks as (select * from selected where event_type='outbound_click')
select jsonb_build_object(
  'pageViews',(select count(*) from visible_page_views),
  'sessions',(select count(distinct session_id) from visible_page_views),
  'outboundClicks',(select count(*) from visible_clicks),
  'trackingStartedAt',(select min(created_at) from dj_private.site_analytics_events where traffic_scope='public'),
  'musicTrackingStartedAt',(select min(created_at) from public.song_events where measurement_version=2 and traffic_scope='public'),
  'qaEventsExcluded',(select count(*) from dj_private.site_analytics_events where created_at>=p_start and created_at<p_end and traffic_scope='qa' and not p_include_qa),
  'adminEventsExcluded',(select count(*) from dj_private.site_analytics_events where created_at>=p_start and created_at<p_end and traffic_scope='admin'),
  'topPages',coalesce((select jsonb_agg(jsonb_build_object('key',page_key,'views',views,'sessions',sessions) order by views desc,page_key) from (select page_key,count(*) views,count(distinct session_id) sessions from visible_page_views group by page_key order by count(*) desc limit 10) p),'[]'::jsonb),
  'sources',coalesce((select jsonb_agg(jsonb_build_object('key',source_key,'sessions',sessions) order by sessions desc,source_key) from (select source_key,count(distinct session_id) sessions from visible_page_views group by source_key order by count(distinct session_id) desc limit 10) s),'[]'::jsonb),
  'campaigns',coalesce((select jsonb_agg(jsonb_build_object('key',campaign_name,'source',campaign_source,'medium',campaign_medium,'sessions',sessions) order by sessions desc,campaign_name) from (select campaign_name,campaign_source,campaign_medium,count(distinct session_id) sessions from visible_page_views where campaign_name is not null group by campaign_name,campaign_source,campaign_medium order by count(distinct session_id) desc limit 10) c),'[]'::jsonb),
  'countries',coalesce((select jsonb_agg(jsonb_build_object('key',country_code,'sessions',sessions) order by sessions desc,country_code) from (select country_code,count(distinct session_id) sessions from visible_page_views group by country_code order by count(distinct session_id) desc limit 10) c),'[]'::jsonb),
  'devices',coalesce((select jsonb_agg(jsonb_build_object('key',device_group,'sessions',sessions) order by sessions desc,device_group) from (select device_group,count(distinct session_id) sessions from visible_page_views group by device_group order by count(distinct session_id) desc) d),'[]'::jsonb),
  'clicks',coalesce((select jsonb_agg(jsonb_build_object('key',destination,'clicks',clicks) order by clicks desc,destination) from (select destination,count(*) clicks from visible_clicks group by destination order by count(*) desc) c),'[]'::jsonb)
);
$$;
revoke all on function public.read_site_analytics(timestamptz,timestamptz,boolean) from public,anon,authenticated;
grant execute on function public.read_site_analytics(timestamptz,timestamptz,boolean) to service_role;

create or replace function dj_private.expire_site_analytics() returns integer
language plpgsql security invoker set search_path = '' as $$
declare total integer=0; removed integer;
begin
  delete from dj_private.site_analytics_events where created_at<now()-interval '90 days';
  get diagnostics removed=row_count; total=total+removed;
  update public.song_events set session_id=null,playback_id=null,event_id=null,duration_seconds=null,listened_seconds=null
  where measurement_version=2 and created_at<now()-interval '90 days'
    and (listener_id is not null or session_id is not null or playback_id is not null or event_id is not null or duration_seconds is not null or listened_seconds is not null);
  get diagnostics removed=row_count; total=total+removed;
  delete from dj_private.interaction_limits where window_start<now()-interval '2 days';
  return total;
end $$;
revoke all on function dj_private.expire_site_analytics() from public,anon,authenticated;
grant execute on function dj_private.expire_site_analytics() to service_role;
select cron.schedule('dj-buang-analytics-90-day-retention','23 3 * * *','select dj_private.expire_site_analytics();');

commit;
